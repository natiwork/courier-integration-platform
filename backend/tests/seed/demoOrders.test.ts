import { describe, expect, it } from 'vitest';
import { computeTotalCents } from '../../src/domain/money.js';
import { canTransition, ORDER_STATUSES } from '../../src/domain/orderStatus.js';
import { createProviderRegistry } from '../../src/providers/index.js';
import { InMemoryOrderEventRepository } from '../../src/repositories/inMemoryOrderEventRepository.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { generateDemoEvents, generateDemoOrders } from '../../src/seed/demoOrders.js';
import { StatsService } from '../../src/services/statsService.js';
import { CreateOrderSchema } from '../../src/validation/orderSchemas.js';

// The seed bypasses OrderService (it needs past dates and finished statuses),
// so these tests are what guarantees the demo data still follows the business rules.
const NOW = new Date('2026-10-24T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const orders = generateDemoOrders(NOW);

describe('generateDemoOrders', () => {
  it('creates 1,200 orders over the last ~9 months, oldest first, none in the future', () => {
    expect(orders).toHaveLength(1200);
    const created = orders.map((order) => Date.parse(order.createdAt));
    expect(created).toEqual([...created].sort((a, b) => a - b));
    expect(Math.min(...created)).toBeGreaterThan(NOW.getTime() - 275 * DAY);
    expect(Math.max(...created)).toBeLessThanOrEqual(NOW.getTime());
  });

  it('is deterministic for the same "now"', () => {
    expect(generateDemoOrders(NOW)).toEqual(orders);
  });

  it('only contains data that would pass POST /api/orders validation', () => {
    for (const order of orders) {
      const body = {
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        deliveryAddress: order.deliveryAddress,
        destinationCity: order.destinationCity,
        postalCode: order.postalCode,
        destinationCountry: order.destinationCountry,
        parcelWeightKg: order.parcelWeightKg,
        items: order.items,
        paymentStatus: order.paymentStatus,
      };
      const result = CreateOrderSchema.safeParse(body);
      expect(result.success, `${order.customerName}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
      // Already normalized: parsing doesn't change anything.
      expect(result.data).toEqual(body);
    }
  });

  it('keeps totals, timestamps, payment and courier data consistent with the status', () => {
    for (const order of orders) {
      expect(order.totalCents).toBe(computeTotalCents(order.items));
      expect(order.currency).toBe('EUR');
      expect(Date.parse(order.updatedAt)).toBeGreaterThanOrEqual(Date.parse(order.createdAt));
      expect(Date.parse(order.updatedAt)).toBeLessThanOrEqual(NOW.getTime());

      // Refunds go out about 3 days after the return; until then the return is still PAID.
      if (order.status === 'RETURNED') {
        const daysSinceReturn = (NOW.getTime() - Date.parse(order.updatedAt)) / DAY;
        expect(order.paymentStatus).toBe(daysSinceReturn > 3 ? 'REFUNDED' : 'PAID');
      }
      if (['PENDING', 'PROCESSING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'].includes(order.status)) {
        expect(order.paymentStatus).not.toBe('REFUNDED');
      }
      if (['SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED'].includes(order.status)) {
        expect(order.courierProvider).toMatch(/^(swiftparcel|nordcargo)$/);
        expect(order.trackingNumber).toMatch(/^DEMO-(SP|NC)-\d{6}$/);
      }
      if (['PENDING', 'PROCESSING', 'CANCELLED'].includes(order.status)) {
        expect(order.courierProvider).toBeNull();
        expect(order.trackingNumber).toBeNull();
      }
    }
  });

  it('only gives an order to a registered courier that could really carry it', () => {
    const registry = createProviderRegistry({ seed: 1, simulateLatency: false });
    const withCourier = orders.filter((order) => order.courierProvider !== null);
    expect(withCourier.length).toBeGreaterThan(1000);

    for (const order of withCourier) {
      const { capabilities } = registry.get(order.courierProvider!); // throws for an unknown id
      expect(capabilities.supportedCountries).toContain(order.destinationCountry);
      expect(order.parcelWeightKg).toBeLessThanOrEqual(capabilities.maxParcelWeightKg);
      expect(order.trackingNumber!.slice(5, 7)).toBe(order.courierProvider === 'swiftparcel' ? 'SP' : 'NC');
    }
    // Both couriers have a fair share of the work.
    const nordCargo = withCourier.filter((order) => order.courierProvider === 'nordcargo').length;
    expect(nordCargo).toBeGreaterThan(withCourier.length * 0.15);
  });

  it('uses unique ids and tracking numbers', () => {
    expect(new Set(orders.map((o) => o.id)).size).toBe(orders.length);
    const tracking = orders.map((o) => o.trackingNumber).filter((t) => t !== null);
    expect(new Set(tracking).size).toBe(tracking.length);
  });

  it('covers every status and gives the dashboard something honest to show', async () => {
    const statuses = new Set(orders.map((order) => order.status));
    expect([...statuses].sort()).toEqual([...ORDER_STATUSES].sort());

    const repository = new InMemoryOrderRepository();
    for (const order of orders) await repository.create(order);
    const events = new InMemoryOrderEventRepository();
    for (const event of generateDemoEvents(orders)) await events.append(event);
    const stats = await new StatsService(repository, events, { now: () => NOW }).getOverview();

    expect(stats.today.orders).toBeGreaterThan(0);
    // The pipeline orders moved today, so "Updated today" has real changes to show.
    expect(Object.values(stats.today.activity).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    // A realistic to-do list, not hundreds of items.
    expect(stats.needsAttention.total).toBeGreaterThanOrEqual(10);
    expect(stats.needsAttention.total).toBeLessThanOrEqual(20);
    expect(stats.needsAttention.items.map((item) => item.reason)).toEqual(
      expect.arrayContaining(['FAILED', 'RETURNED', 'UNPAID_OVERDUE']),
    );
    expect(stats.monthly.every((month) => month.orders > 0)).toBe(true);
  });

  it('gets order numbers that grow with the creation date once stored', async () => {
    const repository = new InMemoryOrderRepository();
    for (const order of orders) await repository.create(order);
    const stored = (await repository.findAll()).reverse(); // oldest first
    const numbers = stored.map((order) => Number(order.orderNumber.slice(4)));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });
});

describe('generateDemoEvents', () => {
  const events = generateDemoEvents(orders);
  const byOrder = Map.groupBy(events, (event) => event.orderId);

  it('gives every demo order a history, and only demo orders', () => {
    expect(byOrder.size).toBe(orders.length);
    expect(orders.every((order) => byOrder.has(order.id))).toBe(true);
  });

  it('is deterministic and leaves the orders untouched', () => {
    expect(generateDemoEvents(generateDemoOrders(NOW))).toEqual(events);
    expect(generateDemoOrders(NOW)).toEqual(orders);
  });

  it('walks the state machine from ORDER_CREATED at createdAt to the current status at updatedAt', () => {
    for (const order of orders) {
      const history = byOrder.get(order.id)!;
      const first = history[0]!;
      const last = history.at(-1)!;
      expect(first).toMatchObject({ type: 'ORDER_CREATED', fromStatus: null, toStatus: 'PENDING', createdAt: order.createdAt });
      expect(last.toStatus).toBe(order.status);
      // A PENDING order has a single event, which is both the first and the last.
      expect(last.createdAt).toBe(order.status === 'PENDING' ? order.createdAt : order.updatedAt);

      for (let i = 1; i < history.length; i++) {
        const event = history[i]!;
        const previous = history[i - 1]!;
        expect(event.type).toBe('STATUS_CHANGED');
        expect(event.fromStatus).toBe(previous.toStatus);
        expect(canTransition(event.fromStatus!, event.toStatus), `${order.id}: ${event.fromStatus} → ${event.toStatus}`).toBe(true);
        expect(Date.parse(event.createdAt)).toBeGreaterThan(Date.parse(previous.createdAt));
        expect(Date.parse(event.createdAt)).toBeLessThanOrEqual(Date.parse(order.updatedAt));
      }
    }
  });

  it('only records a handover for orders that name a courier', () => {
    for (const order of orders) {
      const handedOver = byOrder.get(order.id)!.some((event) => event.toStatus === 'SHIPPED');
      expect(handedOver, order.id).toBe(order.courierProvider !== null);
    }
  });

  it('marks the events as generated, never as courier calls', () => {
    for (const event of events) {
      expect(event.source).toBe('system');
      expect(event.providerId).toBeNull();
      expect(event.message).toMatch(/^Demo data: /);
    }
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  });
});
