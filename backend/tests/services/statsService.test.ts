import { describe, expect, it } from 'vitest';
import type { Order } from '../../src/domain/order.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { StatsService } from '../../src/services/statsService.js';
import { buildOrder } from '../fixtures/orders.js';

const NOW = '2026-10-24T12:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;

// ISO timestamp `days` days (and optional extra ms) before NOW.
function daysAgo(days: number, extraMs = 0): string {
  return new Date(Date.parse(NOW) - days * DAY - extraMs).toISOString();
}

async function statsFor(orders: Order[], now = NOW) {
  const repository = new InMemoryOrderRepository();
  for (const { orderNumber: _ignored, ...order } of orders) {
    await repository.create(order);
  }
  return new StatsService(repository, { now: () => new Date(now), demoData: true }).getOverview();
}

describe('StatsService.getOverview', () => {
  it('returns zeros and nulls (not NaN) when there are no orders', async () => {
    const stats = await statsFor([]);

    expect(stats.totals.orders).toBe(0);
    expect(Object.values(stats.totals.byStatus)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(stats.today).toMatchObject({ date: '2026-10-24', orders: 0, revenueCents: 0 });
    expect(stats.last30Days.orders).toEqual({ current: 0, previous: 0, changePercent: null });
    expect(stats.last30Days.averageOrderValueCents).toEqual({ current: 0, previous: 0, changePercent: null });
    expect(stats.rates).toEqual({ returnRate: null, deliveryPerformance: null });
    expect(stats.topDestinations).toEqual([]);
    expect(stats.topProducts).toEqual([]);
    expect(stats.needsAttention).toEqual({ total: 0, items: [] });
    expect(stats).toMatchObject({ currency: 'EUR', demoData: true, generatedAt: NOW });
  });

  it('counts orders per status', async () => {
    const stats = await statsFor([
      buildOrder({ status: 'PENDING' }),
      buildOrder({ status: 'PENDING' }),
      buildOrder({ status: 'DELIVERED' }),
      buildOrder({ status: 'RETURNED' }),
    ]);

    expect(stats.totals.orders).toBe(4);
    expect(stats.totals.byStatus).toMatchObject({ PENDING: 2, DELIVERED: 1, RETURNED: 1, FAILED: 0 });
  });

  it("counts today's orders, today's paid revenue and today's status updates (UTC)", async () => {
    const stats = await statsFor([
      buildOrder({ createdAt: '2026-10-24T00:00:00.000Z', totalCents: 1500, paymentStatus: 'PAID' }),
      buildOrder({ createdAt: '2026-10-24T09:00:00.000Z', totalCents: 9900, paymentStatus: 'UNPAID' }),
      buildOrder({ createdAt: '2026-10-23T23:59:59.999Z', totalCents: 700 }),
      buildOrder({ createdAt: daysAgo(5), updatedAt: '2026-10-24T08:00:00.000Z', status: 'SHIPPED' }),
      buildOrder({ createdAt: daysAgo(9), updatedAt: '2026-10-24T10:00:00.000Z', status: 'DELIVERED' }),
    ]);

    expect(stats.today.orders).toBe(2);
    expect(stats.today.revenueCents).toBe(1500);
    // Includes the two orders created today (their updatedAt is today too).
    expect(stats.today.activity).toMatchObject({ PENDING: 2, SHIPPED: 1, DELIVERED: 1, PROCESSING: 0 });
  });

  it('splits the last 30 days from the previous 30 at the exact boundary', async () => {
    const stats = await statsFor([
      buildOrder({ createdAt: daysAgo(30, -1) }), // 1 ms inside the current window
      buildOrder({ createdAt: daysAgo(30) }), // exactly 30 days ago: previous window
      buildOrder({ createdAt: daysAgo(60) }), // exactly 60 days ago: outside both
    ]);

    expect(stats.last30Days.orders).toEqual({ current: 1, previous: 1, changePercent: 0 });
  });

  it('computes revenue and average order value from PAID orders only, with trends', async () => {
    const stats = await statsFor([
      buildOrder({ createdAt: daysAgo(1), totalCents: 2000, paymentStatus: 'PAID' }),
      buildOrder({ createdAt: daysAgo(2), totalCents: 1001, paymentStatus: 'PAID' }),
      buildOrder({ createdAt: daysAgo(3), totalCents: 50000, paymentStatus: 'UNPAID' }),
      buildOrder({ createdAt: daysAgo(4), totalCents: 50000, paymentStatus: 'REFUNDED' }),
      buildOrder({ createdAt: daysAgo(40), totalCents: 2000, paymentStatus: 'PAID' }),
    ]);

    // (3001 - 2000) / 2000 = +50.05 % -> 50.1 (needs exact arithmetic: in floats it drifts to 50.0)
    expect(stats.last30Days.revenueCents).toEqual({ current: 3001, previous: 2000, changePercent: 50.1 });
    // AOV 3001 / 2 = 1500.5 -> 1501 cents; (1501 - 2000) / 2000 = -24.95 % -> -25 (symmetric with +50.05 -> 50.1)
    expect(stats.last30Days.averageOrderValueCents).toEqual({ current: 1501, previous: 2000, changePercent: -25 });
    expect(stats.last30Days.orders).toMatchObject({ current: 4, previous: 1, changePercent: 300 });
  });

  it('computes return rate and delivery performance', async () => {
    const stats = await statsFor([
      ...Array.from({ length: 6 }, () => buildOrder({ status: 'DELIVERED' })),
      buildOrder({ status: 'RETURNED' }),
      buildOrder({ status: 'FAILED' }),
      buildOrder({ status: 'IN_TRANSIT' }), // not finished: ignored by both rates
    ]);

    expect(stats.rates.returnRate).toBe(0.1429); // 1 / (6 + 1)
    expect(stats.rates.deliveryPerformance).toBe(0.75); // 6 / (6 + 1 + 1)
  });

  it('returns 9 months, oldest first, across a year boundary, with paid revenue', async () => {
    const stats = await statsFor(
      [
        buildOrder({ createdAt: '2025-12-15T10:00:00.000Z', totalCents: 1200, paymentStatus: 'PAID' }),
        buildOrder({ createdAt: '2025-12-20T10:00:00.000Z', totalCents: 800, paymentStatus: 'UNPAID' }),
        buildOrder({ createdAt: '2026-02-01T00:00:00.000Z', totalCents: 500, paymentStatus: 'PAID' }),
        buildOrder({ createdAt: '2025-05-31T23:59:59.999Z' }), // before the 9-month range
      ],
      '2026-02-10T12:00:00.000Z',
    );

    expect(stats.monthly.map((entry) => entry.month)).toEqual([
      '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02',
    ]);
    expect(stats.monthly[6]).toEqual({ month: '2025-12', orders: 2, revenueCents: 1200 });
    expect(stats.monthly[7]).toEqual({ month: '2026-01', orders: 0, revenueCents: 0 });
    expect(stats.monthly[8]).toEqual({ month: '2026-02', orders: 1, revenueCents: 500 });
  });

  it('ranks the top 5 destinations by number of orders', async () => {
    const countries = ['DE', 'DE', 'DE', 'FR', 'FR', 'IT', 'ES', 'NL', 'PL'] as const;
    const stats = await statsFor(
      countries.map((country) => buildOrder({ destinationCountry: country, totalCents: 1000, paymentStatus: 'PAID' })),
    );

    expect(stats.topDestinations).toHaveLength(5);
    expect(stats.topDestinations[0]).toEqual({ country: 'DE', orders: 3, revenueCents: 3000 });
    expect(stats.topDestinations[1]).toEqual({ country: 'FR', orders: 2, revenueCents: 2000 });
    // Ties are broken alphabetically, so the result is stable: ES, IT, NL make it, PL does not.
    expect(stats.topDestinations.slice(2).map((d) => d.country)).toEqual(['ES', 'IT', 'NL']);
  });

  it('ranks top products by units sold in PAID orders', async () => {
    const item = (sku: string, quantity: number, unitPriceCents = 1000) => ({ sku, name: `Product ${sku}`, quantity, unitPriceCents });
    const stats = await statsFor([
      buildOrder({ paymentStatus: 'PAID', items: [item('MUG-1', 3), item('CUP-1', 1)] }),
      buildOrder({ paymentStatus: 'PAID', items: [item('MUG-1', 2, 1200)] }),
      buildOrder({ paymentStatus: 'UNPAID', items: [item('CUP-1', 50)] }),
      buildOrder({ paymentStatus: 'PAID', items: [item('A-1', 1), item('B-1', 1), item('C-1', 1), item('D-1', 1)] }),
    ]);

    expect(stats.topProducts[0]).toEqual({ sku: 'MUG-1', name: 'Product MUG-1', quantity: 5, revenueCents: 5400 });
    expect(stats.topProducts).toHaveLength(5);
    expect(stats.topProducts.find((p) => p.sku === 'CUP-1')?.quantity ?? 1).toBe(1);
  });

  it('lists orders that need attention, most recent first, with one entry per order', async () => {
    const stats = await statsFor([
      buildOrder({ id: 'failed', status: 'FAILED', paymentStatus: 'UNPAID', createdAt: daysAgo(10), updatedAt: daysAgo(1) }),
      buildOrder({ id: 'returned', status: 'RETURNED', paymentStatus: 'REFUNDED', createdAt: daysAgo(20), updatedAt: daysAgo(2) }),
      buildOrder({ id: 'unpaid-old', status: 'PROCESSING', paymentStatus: 'UNPAID', createdAt: daysAgo(4) }),
      buildOrder({ id: 'unpaid-new', status: 'PENDING', paymentStatus: 'UNPAID', createdAt: daysAgo(2) }),
      buildOrder({ id: 'cancelled-unpaid', status: 'CANCELLED', paymentStatus: 'UNPAID', createdAt: daysAgo(30) }),
      buildOrder({ id: 'fine', status: 'DELIVERED', paymentStatus: 'PAID', createdAt: daysAgo(30) }),
    ]);

    expect(stats.needsAttention.total).toBe(3);
    expect(stats.needsAttention.items.map((item) => [item.orderId, item.reason])).toEqual([
      ['failed', 'FAILED'],
      ['returned', 'RETURNED'],
      ['unpaid-old', 'UNPAID_OVERDUE'],
    ]);
    expect(stats.needsAttention.items[0]).toMatchObject({ since: daysAgo(1), customerName: 'Ada Lovelace', totalCents: 1000 });
    expect(stats.needsAttention.items[2]?.since).toBe(daysAgo(4));
  });

  it('returns at most 20 attention items but reports the full total', async () => {
    const stats = await statsFor(Array.from({ length: 25 }, () => buildOrder({ status: 'FAILED' })));

    expect(stats.needsAttention.total).toBe(25);
    expect(stats.needsAttention.items).toHaveLength(20);
  });
});
