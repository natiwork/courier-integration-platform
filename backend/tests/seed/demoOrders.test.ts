import { describe, expect, it } from 'vitest';
import { computeTotalCents } from '../../src/domain/money.js';
import { ORDER_STATUSES } from '../../src/domain/orderStatus.js';
import { createProviderRegistry } from '../../src/providers/index.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { generateDemoOrders } from '../../src/seed/demoOrders.js';
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
    const stats = await new StatsService(repository, { now: () => NOW }).getOverview();

    expect(stats.today.orders).toBeGreaterThan(0);
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
