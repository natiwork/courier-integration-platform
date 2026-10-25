import { randomUUID } from 'node:crypto';
import { computeTotalCents } from '../domain/money.js';
import { CURRENCY, type Order } from '../domain/order.js';
import type { EventSource, OrderEvent, OrderEventType } from '../domain/orderEvent.js';
import type { OrderStatus } from '../domain/orderStatus.js';
import { canTransition } from '../domain/orderStatus.js';
import { invalidStatusTransition, orderCancelled, orderNotFound, paymentAlreadyRecorded } from '../errors/appError.js';
import type { OrderEventRepository } from '../repositories/orderEventRepository.js';
import type { OrderFilter, OrderRepository } from '../repositories/orderRepository.js';
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

// Business logic for orders. Knows nothing about HTTP or Express.
// Every status change goes through changeStatus(), so every change is recorded as an event,
// whichever way it arrives: the HTTP API today, courier webhooks and retries later.
export class OrderService {
  private readonly repository: OrderRepository;
  private readonly events: OrderEventRepository;
  private readonly now: () => Date;

  // `now` is injectable so tests can control time.
  constructor(repository: OrderRepository, events: OrderEventRepository, now: () => Date = () => new Date()) {
    this.repository = repository;
    this.events = events;
    this.now = now;
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const timestamp = this.now().toISOString();
    const order = await this.repository.create({
      ...input,
      totalCents: computeTotalCents(input.items),
      currency: CURRENCY,
      id: randomUUID(),
      status: 'PENDING',
      courierProvider: null,
      trackingNumber: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.record(order.id, null, 'PENDING', timestamp, {
      type: 'ORDER_CREATED',
      source: 'api',
      message: 'Order created',
    });
    return order;
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
    const order = await this.getOrderById(id);
    if (!canTransition(order.status, to)) {
      throw invalidStatusTransition(order.status, to);
    }

    const timestamp = this.now().toISOString();
    // In memory the two writes can't be interrupted; with PostgreSQL (Phase 9) they share one transaction.
    const updated = await this.repository.update({
      ...order,
      ...change.patch,
      status: to,
      updatedAt: timestamp,
    });
    // The order may have been removed between the read and the write.
    if (!updated) {
      throw orderNotFound(id);
    }
    await this.record(id, order.status, to, timestamp, change);
    return updated;
  }

  // The shop received the money (bank transfer, invoice). Only UNPAID → PAID; refunds are not handled here.
  // Recorded as an event too, so the history shows when and how the order became shippable.
  async markPaid(id: string): Promise<Order> {
    const order = await this.getOrderById(id);
    if (order.status === 'CANCELLED') throw orderCancelled(order.orderNumber);
    if (order.paymentStatus !== 'UNPAID') throw paymentAlreadyRecorded(order.orderNumber, order.paymentStatus);

    const timestamp = this.now().toISOString();
    const updated = await this.repository.update({ ...order, paymentStatus: 'PAID', updatedAt: timestamp });
    if (!updated) throw orderNotFound(id);
    await this.record(id, order.status, order.status, timestamp, {
      type: 'PAYMENT_RECORDED',
      source: 'api',
      message: 'Payment recorded',
    });
    return updated;
  }

  private async record(
    orderId: string,
    fromStatus: OrderStatus | null,
    toStatus: OrderStatus,
    createdAt: string,
    change: StatusChange,
  ): Promise<void> {
    await this.events.append({
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
    });
  }
}
