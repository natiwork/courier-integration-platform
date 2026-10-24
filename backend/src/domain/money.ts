import type { OrderItem } from './order.js';

// Money is stored as integer cents: floats can't represent most decimal amounts exactly (0.1 + 0.2 !== 0.3).
export function computeTotalCents(items: readonly OrderItem[]): number {
  return items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0);
}
