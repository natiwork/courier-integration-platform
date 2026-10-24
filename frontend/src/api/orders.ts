import type { Order, OrderStatus } from '../types/order';
import { apiGet } from './client';

export interface OrderQuery {
  search?: string;
  status?: OrderStatus;
  limit?: number;
}

export function listOrders(query: OrderQuery, signal?: AbortSignal): Promise<Order[]> {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (query.limit) params.set('limit', String(query.limit));
  const suffix = params.size > 0 ? `?${params}` : '';
  return apiGet<Order[]>(`/api/orders${suffix}`, signal);
}

export function getOrder(id: string, signal?: AbortSignal): Promise<Order> {
  return apiGet<Order>(`/api/orders/${encodeURIComponent(id)}`, signal);
}
