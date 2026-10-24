export const ORDER_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

// The single source of truth for status changes. Anything not listed here is forbidden.
export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['PROCESSING'],
  PROCESSING: ['SHIPPED', 'FAILED'],
  SHIPPED: ['IN_TRANSIT', 'FAILED'],
  IN_TRANSIT: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: ['PROCESSING'], // retry
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
