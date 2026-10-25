import type { Order, OrderItem, OrderStatus, PaymentStatus } from '../types/order';
import { apiGet, apiPost } from './client';

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

// The body of POST /api/orders. Totals and currency are computed by the server, never sent.
export interface CreateOrderPayload {
  customerName: string;
  customerEmail: string;
  deliveryAddress: string;
  destinationCity: string;
  postalCode: string;
  destinationCountry: string;
  parcelWeightKg: number;
  paymentStatus: PaymentStatus;
  items: OrderItem[];
}

export function createOrder(payload: CreateOrderPayload): Promise<Order> {
  return apiPost<Order>('/api/orders', payload);
}
