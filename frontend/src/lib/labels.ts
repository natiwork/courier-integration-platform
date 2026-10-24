import type { AttentionReason } from '../api/types';
import type { OrderStatus, PaymentStatus } from '../types/order';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  PAID: 'Paid',
  UNPAID: 'Unpaid',
  REFUNDED: 'Refunded',
};

export const ATTENTION_LABELS: Record<AttentionReason, string> = {
  FAILED: 'Delivery failed',
  RETURNED: 'Refund pending',
  UNPAID_OVERDUE: 'Unpaid 3+ days',
};
