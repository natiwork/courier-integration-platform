import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../src/errors/appError.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { OrderService } from '../../src/services/orderService.js';
import type { CreateOrderInput } from '../../src/validation/orderSchemas.js';

const input: CreateOrderInput = {
  customerName: 'Ada Lovelace',
  customerEmail: 'ada@example.com',
  deliveryAddress: '12 Analytical Street',
  destinationCity: 'London',
  postalCode: 'N1 9GU',
  parcelWeightKg: 2.4,
};

// A clock that moves forward one minute on every call, so timestamps are predictable and distinct.
function steppingClock(start = '2026-01-01T10:00:00.000Z') {
  let current = new Date(start).getTime();
  return () => {
    const now = new Date(current);
    current += 60_000;
    return now;
  };
}

async function expectAppError(promise: Promise<unknown>, code: string, httpStatus: number) {
  const error = await promise.catch((err: unknown) => err);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ code, httpStatus });
}

describe('OrderService', () => {
  let service: OrderService;

  beforeEach(() => {
    service = new OrderService(new InMemoryOrderRepository(), steppingClock());
  });

  describe('createOrder', () => {
    it('creates a PENDING order without courier or tracking number', async () => {
      const order = await service.createOrder(input);

      expect(order).toMatchObject({
        ...input,
        status: 'PENDING',
        courierProvider: null,
        trackingNumber: null,
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
      });
      expect(order.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('assigns sequential, unique order numbers', async () => {
      const first = await service.createOrder(input);
      const second = await service.createOrder(input);

      expect(first.orderNumber).toBe('ORD-1001');
      expect(second.orderNumber).toBe('ORD-1002');
      expect(first.id).not.toBe(second.id);
    });
  });

  describe('listOrders', () => {
    it('returns an empty list when there are no orders', async () => {
      expect(await service.listOrders()).toEqual([]);
    });

    it('returns orders newest first', async () => {
      await service.createOrder({ ...input, customerName: 'First' });
      await service.createOrder({ ...input, customerName: 'Second' });
      await service.createOrder({ ...input, customerName: 'Third' });

      const names = (await service.listOrders()).map((order) => order.customerName);
      expect(names).toEqual(['Third', 'Second', 'First']);
    });
  });

  describe('getOrderById', () => {
    it('returns the stored order', async () => {
      const created = await service.createOrder(input);
      expect(await service.getOrderById(created.id)).toEqual(created);
    });

    it('throws ORDER_NOT_FOUND (404) for an unknown id', async () => {
      await expectAppError(service.getOrderById('missing'), 'ORDER_NOT_FOUND', 404);
    });
  });

  describe('changeStatus', () => {
    it('changes the status and updatedAt, but not createdAt', async () => {
      const created = await service.createOrder(input);

      const updated = await service.changeStatus(created.id, 'PROCESSING');

      expect(updated.status).toBe('PROCESSING');
      expect(updated.createdAt).toBe(created.createdAt);
      expect(updated.updatedAt).toBe('2026-01-01T10:01:00.000Z');
      expect(await service.getOrderById(created.id)).toEqual(updated);
    });

    it('rejects a forbidden transition with 409 and leaves the order unchanged', async () => {
      const created = await service.createOrder(input);

      await expectAppError(
        service.changeStatus(created.id, 'DELIVERED'),
        'INVALID_STATUS_TRANSITION',
        409,
      );
      expect(await service.getOrderById(created.id)).toEqual(created);
    });

    it('throws ORDER_NOT_FOUND (404) for an unknown id', async () => {
      await expectAppError(service.changeStatus('missing', 'PROCESSING'), 'ORDER_NOT_FOUND', 404);
    });
  });
});
