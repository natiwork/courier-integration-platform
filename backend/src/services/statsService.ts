import { CURRENCY, type Order } from '../domain/order.js';
import { ORDER_STATUSES, type OrderStatus } from '../domain/orderStatus.js';
import { isStatusChange } from '../domain/orderEvent.js';
import type { OrderEventRepository } from '../repositories/orderEventRepository.js';
import type { OrderRepository } from '../repositories/orderRepository.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;
const MONTHS = 9;
const TOP_LIMIT = 5;
const ATTENTION_LIMIT = 20;
const UNPAID_OVERDUE_DAYS = 3;

export interface Trend {
  current: number;
  previous: number;
  // null when the previous value is 0: a percentage change from nothing is meaningless.
  changePercent: number | null;
}

export type AttentionReason = 'FAILED' | 'UNPAID_OVERDUE' | 'RETURNED';

export interface AttentionItem {
  orderId: string;
  orderNumber: string;
  customerName: string;
  reason: AttentionReason;
  since: string;
  totalCents: number;
}

export interface OverviewStats {
  generatedAt: string;
  currency: typeof CURRENCY;
  demoData: boolean;
  totals: { orders: number; byStatus: Record<OrderStatus, number> };
  today: { date: string; orders: number; revenueCents: number; activity: Record<OrderStatus, number> };
  last30Days: { orders: Trend; revenueCents: Trend; averageOrderValueCents: Trend };
  rates: { returnRate: number | null; deliveryPerformance: number | null };
  monthly: { month: string; orders: number; revenueCents: number }[];
  topDestinations: { country: string; orders: number; revenueCents: number }[];
  topProducts: { sku: string; name: string; quantity: number; revenueCents: number }[];
  needsAttention: { total: number; items: AttentionItem[] };
}

interface StatsServiceOptions {
  now?: () => Date;
  // Whether the orders come from the demo seed; shown as a label in the UI.
  demoData?: boolean;
}

// Dashboard numbers, computed from orders. All day and month boundaries are UTC.
// Definitions:
//   revenue       = sum of totalCents of PAID orders, by creation date (UNPAID and REFUNDED are excluded)
//   average order = revenue / number of PAID orders in the same window
//   return rate   = RETURNED / (DELIVERED + RETURNED), all orders
//   delivery perf = DELIVERED / (DELIVERED + FAILED + RETURNED), all orders
//   activity      = status changes recorded today, by the new status (ORDER_CREATED excluded:
//                   new orders are counted in today.orders). An order that moved twice counts twice.
export class StatsService {
  private readonly repository: OrderRepository;
  private readonly events: OrderEventRepository;
  private readonly now: () => Date;
  private readonly demoData: boolean;

  constructor(repository: OrderRepository, events: OrderEventRepository, options: StatsServiceOptions = {}) {
    this.repository = repository;
    this.events = events;
    this.now = options.now ?? (() => new Date());
    this.demoData = options.demoData ?? false;
  }

  async getOverview(): Promise<OverviewStats> {
    const now = this.now();
    const nowMs = now.getTime();
    const orders = await this.repository.findAll();
    const todayKey = dayKey(now.toISOString());

    const byStatus = countByStatus(orders);
    const paid = orders.filter((order) => order.paymentStatus === 'PAID');

    const createdToday = orders.filter((order) => dayKey(order.createdAt) === todayKey);
    const changesToday = (await this.events.findRecent({ since: `${todayKey}T00:00:00.000Z` })).filter(
      (event) => event.type !== 'ORDER_CREATED' && isStatusChange(event),
    );

    const currentStart = nowMs - WINDOW_DAYS * DAY_MS;
    const previousStart = nowMs - 2 * WINDOW_DAYS * DAY_MS;
    const inCurrent = (order: Order) => inWindow(order.createdAt, currentStart, nowMs);
    const inPrevious = (order: Order) => inWindow(order.createdAt, previousStart, currentStart);
    const currentPaid = paid.filter(inCurrent);
    const previousPaid = paid.filter(inPrevious);

    const delivered = byStatus.DELIVERED;
    const failed = byStatus.FAILED;
    const returned = byStatus.RETURNED;

    return {
      generatedAt: now.toISOString(),
      currency: CURRENCY,
      demoData: this.demoData,
      totals: { orders: orders.length, byStatus },
      today: {
        date: todayKey,
        orders: createdToday.length,
        revenueCents: sumTotals(createdToday.filter((order) => order.paymentStatus === 'PAID')),
        activity: countByStatus(changesToday.map((event) => ({ status: event.toStatus }))),
      },
      last30Days: {
        orders: trend(orders.filter(inCurrent).length, orders.filter(inPrevious).length),
        revenueCents: trend(sumTotals(currentPaid), sumTotals(previousPaid)),
        averageOrderValueCents: trend(averageTotal(currentPaid), averageTotal(previousPaid)),
      },
      rates: {
        returnRate: ratio(returned, delivered + returned),
        deliveryPerformance: ratio(delivered, delivered + failed + returned),
      },
      monthly: monthly(orders, now),
      topDestinations: topDestinations(orders),
      topProducts: topProducts(paid),
      needsAttention: needsAttention(orders, nowMs),
    };
  }
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

// (start, end]: an order created exactly 30 days ago belongs to the previous window.
function inWindow(iso: string, startMs: number, endMs: number): boolean {
  const time = Date.parse(iso);
  return time > startMs && time <= endMs;
}

function countByStatus(items: readonly { status: OrderStatus }[]): Record<OrderStatus, number> {
  const counts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<OrderStatus, number>;
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
}

function sumTotals(orders: readonly Order[]): number {
  return orders.reduce((sum, order) => sum + order.totalCents, 0);
}

function averageTotal(orders: readonly Order[]): number {
  return orders.length === 0 ? 0 : Math.round(sumTotals(orders) / orders.length);
}

// Math.round rounds halves towards +Infinity (Math.round(-249.5) === -249), so +50.05 and -24.95
// would round differently. Rounding the absolute value keeps gains and losses symmetric.
function roundHalfAwayFromZero(value: number): number {
  // `|| 0` turns -0 (from e.g. -0.04) into a plain 0.
  return Math.sign(value) * Math.round(Math.abs(value)) || 0;
}

// Multiply before dividing: (1001 / 2000) * 1000 is 500.49999999999994 in floating point,
// while (1001 * 1000) / 2000 is exactly 500.5, so 50.05 % rounds to 50.1 as expected.
function trend(current: number, previous: number): Trend {
  const changePercent =
    previous === 0 ? null : roundHalfAwayFromZero(((current - previous) * 1000) / previous) / 10;
  return { current, previous, changePercent };
}

function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part * 10000) / whole) / 10000;
}

// The current month and the 8 before it, oldest first. Months without orders are 0.
function monthly(orders: readonly Order[], now: Date): OverviewStats['monthly'] {
  const months = Array.from({ length: MONTHS }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1 - index), 1));
    return { month: date.toISOString().slice(0, 7), orders: 0, revenueCents: 0 };
  });
  const byMonth = new Map(months.map((entry) => [entry.month, entry]));
  for (const order of orders) {
    const entry = byMonth.get(order.createdAt.slice(0, 7));
    if (!entry) continue;
    entry.orders += 1;
    if (order.paymentStatus === 'PAID') entry.revenueCents += order.totalCents;
  }
  return months;
}

// By number of orders; revenue counts PAID orders only.
function topDestinations(orders: readonly Order[]): OverviewStats['topDestinations'] {
  const byCountry = new Map<string, { country: string; orders: number; revenueCents: number }>();
  for (const order of orders) {
    const entry = byCountry.get(order.destinationCountry) ?? { country: order.destinationCountry, orders: 0, revenueCents: 0 };
    entry.orders += 1;
    if (order.paymentStatus === 'PAID') entry.revenueCents += order.totalCents;
    byCountry.set(order.destinationCountry, entry);
  }
  return [...byCountry.values()]
    .sort((a, b) => b.orders - a.orders || b.revenueCents - a.revenueCents || a.country.localeCompare(b.country))
    .slice(0, TOP_LIMIT);
}

// Units sold in PAID orders, so the numbers agree with revenue.
function topProducts(paidOrders: readonly Order[]): OverviewStats['topProducts'] {
  const bySku = new Map<string, { sku: string; name: string; quantity: number; revenueCents: number }>();
  for (const order of paidOrders) {
    for (const item of order.items) {
      const entry = bySku.get(item.sku) ?? { sku: item.sku, name: item.name, quantity: 0, revenueCents: 0 };
      entry.quantity += item.quantity;
      entry.revenueCents += item.quantity * item.unitPriceCents;
      bySku.set(item.sku, entry);
    }
  }
  return [...bySku.values()]
    .sort((a, b) => b.quantity - a.quantity || b.revenueCents - a.revenueCents || a.sku.localeCompare(b.sku))
    .slice(0, TOP_LIMIT);
}

// One entry per order, most recent first. FAILED wins over RETURNED, which wins over an overdue payment.
//   FAILED          delivery failed
//   RETURNED        returned and still PAID, i.e. the refund is pending
//   UNPAID_OVERDUE  UNPAID for more than 3 days and not CANCELLED
function needsAttention(orders: readonly Order[], nowMs: number): OverviewStats['needsAttention'] {
  const items: AttentionItem[] = [];
  for (const order of orders) {
    const base = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      totalCents: order.totalCents,
    };
    if (order.status === 'FAILED') {
      items.push({ ...base, reason: 'FAILED', since: order.updatedAt });
    } else if (order.status === 'RETURNED' && order.paymentStatus === 'PAID') {
      // Returned but not refunded yet. Once REFUNDED, the return is settled and leaves the list.
      items.push({ ...base, reason: 'RETURNED', since: order.updatedAt });
    } else if (
      order.paymentStatus === 'UNPAID' &&
      order.status !== 'CANCELLED' &&
      nowMs - Date.parse(order.createdAt) > UNPAID_OVERDUE_DAYS * DAY_MS
    ) {
      items.push({ ...base, reason: 'UNPAID_OVERDUE', since: order.createdAt });
    }
  }
  items.sort((a, b) => b.since.localeCompare(a.since) || a.orderNumber.localeCompare(b.orderNumber));
  return { total: items.length, items: items.slice(0, ATTENTION_LIMIT) };
}
