// Mirrors ORDER_STATUSES in backend/src/domain/orderStatus.ts. Keep the two in sync.
export const ORDER_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
