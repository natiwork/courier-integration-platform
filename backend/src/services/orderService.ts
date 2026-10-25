import { randomUUID } from 'node:crypto';
import { computeTotalCents } from '../domain/money.js';
import { CURRENCY, type Order } from '../domain/order.js';
import type { EventSource, OrderEvent, OrderEventType } from '../domain/orderEvent.js';
import type { OrderStatus } from '../domain/orderStatus.js';
import { canTransition } from '../domain/orderStatus.js';
import {
  concurrentUpdate,
  invalidStatusTransition,
  orderCancelled,
  orderNotFound,
  paymentAlreadyRecorded,
  shipmentInterrupted,
} from '../errors/appError.js';
import type { OrderEventRepository } from '../repositories/orderEventRepository.js';
import type { OrderChanges, OrderExpectation, OrderFilter, OrderRepository } from '../repositories/orderRepository.js';
import { withoutTransaction, type RunInTransaction } from '../repositories/transaction.js';
import type { CreateOrderInput } from '../validation/orderSchemas.js';

// Why and by whom a status changes. Stored as an OrderEvent next to the change itself.
export interface StatusChange {
  type?: OrderEventType; // default STATUS_CHANGED
  source: EventSource;
  message: string;
  providerId?: string;
  code?: string;
  attempts?: number;
  // Fields that change together with the status, e.g. the tracking number when a parcel ships.
  patch?: Partial<Pick<Order, 'courierProvider' | 'trackingNumber'>>;
}

// How often a change is re-read and tried again when another request changed the order in between.
const MAX_CONFLICT_RETRIES = 3;

// The event that goes into the same transaction as the order update.
interface EventDraft {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  change: StatusChange;
}

// Business logic for orders. Knows nothing about HTTP or Express.
// Every status change goes through this class, so every change is recorded as an event, whichever way it
// arrives: the HTTP API, a courier's answer, a courier webhook or the recovery job.
//
// Writes follow one pattern (optimistic concurrency): read the order, check the rules, then update it only
// if it is still exactly what was read (UPDATE ... WHERE status = <what we read>). If another request was
// faster, nothing is written; the order is read again and the rules decide anew (usually: 409).
export class OrderService {
  private readonly repository: OrderRepository;
  private readonly events: OrderEventRepository;
  private readonly now: () => Date;
  private readonly inTransaction: RunInTransaction;

  // `now` is injectable so tests can control time. `inTransaction` is given by PostgreSQL storage; in memory the
  // writes simply run one after the other.
  constructor(
    repository: OrderRepository,
    events: OrderEventRepository,
    now: () => Date = () => new Date(),
    inTransaction?: RunInTransaction,
  ) {
    this.repository = repository;
    this.events = events;
    this.now = now;
    this.inTransaction = inTransaction ?? withoutTransaction({ orders: repository, events });
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const timestamp = this.now().toISOString();
    // The order and its first event are written together: there is never an order without a history.
    return this.inTransaction(async ({ orders, events }) => {
      const order = await orders.create({
        ...input,
        totalCents: computeTotalCents(input.items),
        currency: CURRENCY,
        id: randomUUID(),
        status: 'PENDING',
        courierProvider: null,
        trackingNumber: null,
        shippingStartedAt: null,
        shippingProviderId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await events.append(
        buildEvent(order.id, timestamp, { fromStatus: null, toStatus: 'PENDING', change: { type: 'ORDER_CREATED', source: 'api', message: 'Order created' } }),
      );
      return order;
    });
  }

  async listOrders(filter: OrderFilter = {}): Promise<Order[]> {
    return this.repository.findAll(filter);
  }

  async getOrderById(id: string): Promise<Order> {
    const order = await this.repository.findById(id);
    if (!order) {
      throw orderNotFound(id);
    }
    return order;
  }

  // Oldest first. 404 for an unknown order, so "no history" and "no order" are never confused.
  async listEvents(id: string): Promise<OrderEvent[]> {
    await this.getOrderById(id);
    return this.events.findByOrderId(id);
  }

  async changeStatus(id: string, to: OrderStatus, change: StatusChange): Promise<Order> {
    return this.retryOnConflict(id, (order) => {
      if (!canTransition(order.status, to)) throw invalidStatusTransition(order.status, to);
      return this.write(
        order.id,
        { status: order.status },
        { ...change.patch, status: to },
        { fromStatus: order.status, toStatus: to, change },
      );
    });
  }

  // The shop received the money (bank transfer, invoice). Only UNPAID → PAID; refunds are not handled here.
  // Recorded as an event too, so the history shows when and how the order became shippable.
  async markPaid(id: string): Promise<Order> {
    return this.retryOnConflict(id, (order) => {
      if (order.status === 'CANCELLED') throw orderCancelled(order.orderNumber);
      if (order.paymentStatus !== 'UNPAID') throw paymentAlreadyRecorded(order.orderNumber, order.paymentStatus);
      return this.write(
        order.id,
        { status: order.status, paymentStatus: 'UNPAID' },
        { paymentStatus: 'PAID' },
        { fromStatus: order.status, toStatus: order.status, change: { type: 'PAYMENT_RECORDED', source: 'api', message: 'Payment recorded' } },
      );
    });
  }

  // Takes the shipping lock for one ship request: sets shippingStartedAt, but only if no other request holds it
  // and the order is still what the caller checked. PENDING and FAILED move to PROCESSING (recorded); an order
  // already PROCESSING (being prepared) keeps its status, so there is no status change to record.
  // Returns null when another request was faster: the caller reads the order again and decides.
  async startShipping(order: Order, providerId: string, message: string): Promise<Order | null> {
    if (order.status !== 'PROCESSING' && !canTransition(order.status, 'PROCESSING')) {
      throw invalidStatusTransition(order.status, 'PROCESSING');
    }
    const timestamp = this.now().toISOString();
    return this.write(
      order.id,
      { status: order.status, paymentStatus: 'PAID', trackingNumber: null, shippingStartedAt: null },
      { status: 'PROCESSING', shippingStartedAt: timestamp, shippingProviderId: providerId },
      order.status === 'PROCESSING' ? null : { fromStatus: order.status, toStatus: 'PROCESSING', change: { source: 'api', message, providerId } },
      timestamp,
    );
  }

  // Records the courier's outcome (SHIPPED or FAILED) and releases the shipping lock in the same write.
  // Only the request that took the lock can finish it (same shippingStartedAt): if the recovery job already
  // closed the attempt as interrupted, the late answer must not overwrite that history.
  async finishShipping(started: Order, to: 'SHIPPED' | 'FAILED', change: StatusChange): Promise<Order> {
    const updated = await this.write(
      started.id,
      { status: 'PROCESSING', shippingStartedAt: started.shippingStartedAt },
      { ...change.patch, status: to, shippingStartedAt: null, shippingProviderId: null },
      { fromStatus: 'PROCESSING', toStatus: to, change },
    );
    if (!updated) throw shipmentInterrupted(started.orderNumber);
    return updated;
  }

  // Closes a shipping attempt whose request never finished (the process died while waiting for the courier).
  // Conditional on the same shippingStartedAt, so a request that finishes at this very moment wins or loses
  // cleanly. Returns null if it was no longer stuck.
  async recoverInterruptedShipment(order: Order, message: string): Promise<Order | null> {
    // Without a lock there is no attempt to close: an order merely being prepared (PROCESSING) is left alone.
    if (!order.shippingStartedAt) return null;
    return this.write(
      order.id,
      { status: 'PROCESSING', shippingStartedAt: order.shippingStartedAt },
      { status: 'FAILED', shippingStartedAt: null, shippingProviderId: null },
      {
        fromStatus: 'PROCESSING',
        toStatus: 'FAILED',
        change: { source: 'system', message, code: 'SHIPMENT_INTERRUPTED', ...(order.shippingProviderId && { providerId: order.shippingProviderId }) },
      },
    );
  }

  async findShippingStartedBefore(before: Date): Promise<Order[]> {
    return this.repository.findShippingStartedBefore(before.toISOString());
  }

  async findByTrackingNumber(trackingNumber: string): Promise<Order | null> {
    return this.repository.findByTrackingNumber(trackingNumber);
  }

  // An event without a status change, e.g. a courier update we had to ignore. Kept in the history for auditing.
  async recordNote(id: string, change: StatusChange): Promise<void> {
    const order = await this.getOrderById(id);
    await this.events.append(buildEvent(id, this.now().toISOString(), { fromStatus: order.status, toStatus: order.status, change }));
  }

  // Reads the order and runs `attempt`, which checks the rules (throwing a 4xx) and tries a conditional write.
  // A null result means the order changed in between: read it again and let the rules decide on fresh data.
  private async retryOnConflict(id: string, attempt: (order: Order) => Promise<Order | null>): Promise<Order> {
    let order = await this.getOrderById(id);
    for (let tries = 1; tries <= MAX_CONFLICT_RETRIES; tries += 1) {
      const updated = await attempt(order);
      if (updated) return updated;
      order = await this.getOrderById(id);
    }
    throw concurrentUpdate(order.orderNumber);
  }

  // The order update and its event in one transaction: either both are stored or neither.
  private write(
    id: string,
    expected: OrderExpectation,
    changes: Omit<OrderChanges, 'updatedAt'>,
    event: EventDraft | null,
    timestamp: string = this.now().toISOString(),
  ): Promise<Order | null> {
    return this.inTransaction(async ({ orders, events }) => {
      const updated = await orders.update(id, expected, { ...changes, updatedAt: timestamp });
      if (updated && event) await events.append(buildEvent(id, timestamp, event));
      return updated;
    });
  }
}

function buildEvent(orderId: string, createdAt: string, { fromStatus, toStatus, change }: EventDraft): OrderEvent {
  return {
    id: randomUUID(),
    orderId,
    type: change.type ?? 'STATUS_CHANGED',
    fromStatus,
    toStatus,
    source: change.source,
    message: change.message,
    providerId: change.providerId ?? null,
    code: change.code ?? null,
    attempts: change.attempts ?? null,
    createdAt,
  };
}
