import { randomUUID } from 'node:crypto';
import { computeTotalCents } from '../domain/money.js';
import { CURRENCY, type Order } from '../domain/order.js';
import type { OrderStatus } from '../domain/orderStatus.js';
import { canTransition } from '../domain/orderStatus.js';
import { invalidStatusTransition, orderNotFound } from '../errors/appError.js';
import type { OrderRepository } from '../repositories/orderRepository.js';
import type { CreateOrderInput } from '../validation/orderSchemas.js';

// Business logic for orders. Knows nothing about HTTP or Express.
export class OrderService {
  private readonly repository: OrderRepository;
  private readonly now: () => Date;

  // `now` is injectable so tests can control time.
  constructor(repository: OrderRepository, now: () => Date = () => new Date()) {
    this.repository = repository;
    this.now = now;
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const timestamp = this.now().toISOString();
    return this.repository.create({
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
  }

  async listOrders(): Promise<Order[]> {
    return this.repository.findAll();
  }

  async getOrderById(id: string): Promise<Order> {
    const order = await this.repository.findById(id);
    if (!order) {
      throw orderNotFound(id);
    }
    return order;
  }

  async changeStatus(id: string, to: OrderStatus): Promise<Order> {
    const order = await this.getOrderById(id);
    if (!canTransition(order.status, to)) {
      throw invalidStatusTransition(order.status, to);
    }

    const updated = await this.repository.update({
      ...order,
      status: to,
      updatedAt: this.now().toISOString(),
    });
    // The order may have been removed between the read and the write.
    if (!updated) {
      throw orderNotFound(id);
    }
    return updated;
  }
}
