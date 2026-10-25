import type { Order, OrderEvent, OrderItem, OrderStatus, PaymentStatus } from '../types/order';
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

// The order's history, oldest first.
export function getOrderEvents(id: string, signal?: AbortSignal): Promise<OrderEvent[]> {
  return apiGet<OrderEvent[]>(`/api/orders/${encodeURIComponent(id)}/events`, signal);
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

export function createOrder(payload: CreateOrderPayload, idempotencyKey?: string): Promise<Order> {
  return apiPost<Order>('/api/orders', payload, { idempotencyKey });
}

export interface ShipOrderPayload {
  providerId: string;
  service: string;
}

// 200 with the shipped order. On 422/502 the order has already been marked FAILED: reload it.
export function shipOrder(id: string, payload: ShipOrderPayload, idempotencyKey?: string): Promise<Order> {
  return apiPost<Order>(`/api/orders/${encodeURIComponent(id)}/ship`, payload, { idempotencyKey });
}

// UNPAID → PAID. Only paid orders can be shipped.
export function markOrderPaid(id: string): Promise<Order> {
  return apiPost<Order>(`/api/orders/${encodeURIComponent(id)}/mark-paid`, {});
}

// Mirrors TrackingReport in backend/src/services/shipmentService.ts. Read-only: asking never changes the order.
export interface TrackingReport {
  providerId: string;
  providerName: string;
  trackingNumber: string;
  externalStatus: string;
  status: OrderStatus;
  updatedAt: string;
  checkedAt: string;
}

export function getTracking(id: string, signal?: AbortSignal): Promise<TrackingReport> {
  return apiGet<TrackingReport>(`/api/orders/${encodeURIComponent(id)}/tracking`, signal);
}
