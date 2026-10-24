import type { OrderStatus } from '../types/order';

// Mirrors OverviewStats in backend/src/services/statsService.ts.
export interface Trend {
  current: number;
  previous: number;
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
  currency: 'EUR';
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
