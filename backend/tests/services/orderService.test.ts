import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../src/errors/appError.js';
import { InMemoryOrderEventRepository } from '../../src/repositories/inMemoryOrderEventRepository.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { OrderService } from '../../src/services/orderService.js';
import type { CreateOrderInput } from '../../src/validation/orderSchemas.js';
import { validOrderBody, validOrderTotalCents } from '../fixtures/orders.js';

// What validateBody hands to the service: the parsed body, with the paymentStatus default applied.
const input: CreateOrderInput = { ...validOrderBody, destinationCountry: 'GB', paymentStatus: 'UNPAID' };

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
  let events: InMemoryOrderEventRepository;

  beforeEach(() => {
    events = new InMemoryOrderEventRepository();
    service = new OrderService(new InMemoryOrderRepository(), events, steppingClock());
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

    it('computes the total from the items and sets the currency', async () => {
      const order = await service.createOrder(input);

      expect(order.totalCents).toBe(validOrderTotalCents);
      expect(order.currency).toBe('EUR');
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

    it('breaks createdAt ties by order number, newest first', async () => {
      const frozenClock = () => new Date('2026-01-01T10:00:00.000Z');
      const frozenService = new OrderService(new InMemoryOrderRepository(), new InMemoryOrderEventRepository(), frozenClock);
      await frozenService.createOrder(input);
      await frozenService.createOrder(input);
      await frozenService.createOrder(input);

      const numbers = (await frozenService.listOrders()).map((order) => order.orderNumber);
      expect(numbers).toEqual(['ORD-1003', 'ORD-1002', 'ORD-1001']);
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
    const byApi = { source: 'api', message: 'Picked and packed' } as const;

    it('changes the status and updatedAt, but not createdAt', async () => {
      const created = await service.createOrder(input);

      const updated = await service.changeStatus(created.id, 'PROCESSING', byApi);

      expect(updated.status).toBe('PROCESSING');
      expect(updated.createdAt).toBe(created.createdAt);
      expect(updated.updatedAt).toBe('2026-01-01T10:01:00.000Z');
      expect(await service.getOrderById(created.id)).toEqual(updated);
    });

    it('records the change as an event with the same timestamp', async () => {
      const created = await service.createOrder(input);
      const updated = await service.changeStatus(created.id, 'PROCESSING', byApi);

      const history = await service.listEvents(created.id);
      expect(history).toHaveLength(2);
      expect(history[1]).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        orderId: created.id,
        type: 'STATUS_CHANGED',
        fromStatus: 'PENDING',
        toStatus: 'PROCESSING',
        source: 'api',
        message: 'Picked and packed',
        providerId: null,
        code: null,
        createdAt: updated.updatedAt,
      });
    });

    it('applies the patch and stores courier details on the event', async () => {
      const created = await service.createOrder(input);
      await service.changeStatus(created.id, 'PROCESSING', byApi);

      const shipped = await service.changeStatus(created.id, 'SHIPPED', {
        type: 'SHIPMENT_CREATED',
        source: 'provider',
        message: 'SwiftParcel accepted the parcel',
        providerId: 'swiftparcel',
        patch: { courierProvider: 'swiftparcel', trackingNumber: 'SP0000000001' },
      });

      expect(shipped).toMatchObject({ status: 'SHIPPED', courierProvider: 'swiftparcel', trackingNumber: 'SP0000000001' });
      const last = (await service.listEvents(created.id)).at(-1);
      expect(last).toMatchObject({ type: 'SHIPMENT_CREATED', source: 'provider', providerId: 'swiftparcel', fromStatus: 'PROCESSING' });
    });

    it('rejects a forbidden transition with 409, leaves the order unchanged and records nothing', async () => {
      const created = await service.createOrder(input);

      await expectAppError(
        service.changeStatus(created.id, 'DELIVERED', byApi),
        'INVALID_STATUS_TRANSITION',
        409,
      );
      expect(await service.getOrderById(created.id)).toEqual(created);
      expect(await service.listEvents(created.id)).toHaveLength(1);
    });

    it('throws ORDER_NOT_FOUND (404) for an unknown id', async () => {
      await expectAppError(service.changeStatus('missing', 'PROCESSING', byApi), 'ORDER_NOT_FOUND', 404);
    });
  });

  describe('events', () => {
    it('records ORDER_CREATED when an order is created', async () => {
      const order = await service.createOrder(input);

      expect(await service.listEvents(order.id)).toEqual([
        expect.objectContaining({
          type: 'ORDER_CREATED',
          fromStatus: null,
          toStatus: 'PENDING',
          source: 'api',
          createdAt: order.createdAt,
        }),
      ]);
    });

    it('keeps each order\'s history separate and in the order it happened', async () => {
      const first = await service.createOrder(input);
      const second = await service.createOrder(input);
      await service.changeStatus(first.id, 'PROCESSING', { source: 'api', message: 'Packed' });
      await service.changeStatus(first.id, 'SHIPPED', { source: 'api', message: 'Handed over' });

      const statuses = (await service.listEvents(first.id)).map((event) => event.toStatus);
      expect(statuses).toEqual(['PENDING', 'PROCESSING', 'SHIPPED']);
      expect(await service.listEvents(second.id)).toHaveLength(1);
    });

    it('throws ORDER_NOT_FOUND (404) for the history of an unknown order', async () => {
      await expectAppError(service.listEvents('missing'), 'ORDER_NOT_FOUND', 404);
    });

    it('never hands out the stored event, only copies', async () => {
      const order = await service.createOrder(input);
      const [event] = await service.listEvents(order.id);
      event!.message = 'tampered';
      expect((await events.findByOrderId(order.id))[0]!.message).toBe('Order created');
    });
  });
});
