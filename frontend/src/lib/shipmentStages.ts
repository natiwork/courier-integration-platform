import { Ban, Boxes, CircleX, ClipboardList, House, Route, Truck, Undo2, type LucideIcon } from 'lucide-react';
import type { Order, OrderEvent, OrderStatus } from '../types/order';
import { formatDateTime } from './format';

export type StageState = 'done' | 'current' | 'upcoming';
export type Tone = 'default' | 'danger' | 'muted' | 'violet';

export interface Stage {
  key: string;
  label: string;
  icon: LucideIcon;
  state: StageState;
  tone: Tone;
  time: string; // when it happened, from the recorded event
  dateTime?: string;
  detail?: string; // what the courier said, when the step came from a courier
}

const ROUTE: { key: string; label: string; icon: LucideIcon; status: OrderStatus }[] = [
  { key: 'placed', label: 'Order placed', icon: ClipboardList, status: 'PENDING' },
  { key: 'processing', label: 'Processing', icon: Boxes, status: 'PROCESSING' },
  { key: 'shipped', label: 'Handed to courier', icon: Truck, status: 'SHIPPED' },
  { key: 'transit', label: 'In transit', icon: Route, status: 'IN_TRANSIT' },
  { key: 'delivered', label: 'Delivered', icon: House, status: 'DELIVERED' },
];

const ROUTE_INDEX: Partial<Record<OrderStatus, number>> = {
  PENDING: 0,
  PROCESSING: 1,
  SHIPPED: 2,
  IN_TRANSIT: 3,
  DELIVERED: 4,
};

// Shown only if a step has no event, which shouldn't happen for orders created since events exist.
const NOT_RECORDED = 'Time not recorded';

// The stages come from the current status; their times come from the order's events.
// After a retry a status can appear twice: the latest event is the one that counts.
export function buildStages(order: Order, events: readonly OrderEvent[]): Stage[] {
  const latest = (status: OrderStatus) => events.findLast((event) => event.toStatus === status);

  const timed = (status: OrderStatus): Pick<Stage, 'time' | 'dateTime' | 'detail'> => {
    const event = latest(status);
    if (!event) return { time: NOT_RECORDED };
    return {
      time: formatDateTime(event.createdAt),
      dateTime: event.createdAt,
      ...(event.source === 'provider' && { detail: event.message }),
    };
  };

  const routeStage = (index: number, state: StageState): Stage => {
    const { status, ...step } = ROUTE[index]!;
    return { ...step, state, tone: 'default', ...(state === 'upcoming' ? { time: 'Upcoming' } : timed(status)) };
  };

  const index = ROUTE_INDEX[order.status];
  if (index !== undefined) {
    return ROUTE.map((_, i) => routeStage(i, i < index ? 'done' : i === index ? 'current' : 'upcoming'));
  }

  const ending = (key: string, label: string, icon: LucideIcon, tone: Tone): Stage => ({
    key,
    label,
    icon,
    state: 'current',
    tone,
    ...timed(order.status),
  });

  switch (order.status) {
    case 'RETURNED':
      return [...ROUTE.map((_, i) => routeStage(i, 'done')), ending('returned', 'Returned by the customer', Undo2, 'violet')];
    case 'FAILED': {
      // A courier on the order means it was handed over before it failed.
      const reached = order.courierProvider ? 3 : 2;
      const label = order.courierProvider ? 'Delivery failed' : 'Shipping failed';
      return [...ROUTE.slice(0, reached).map((_, i) => routeStage(i, 'done')), ending('failed', label, CircleX, 'danger')];
    }
    case 'CANCELLED':
      return [routeStage(0, 'done'), ending('cancelled', 'Cancelled', Ban, 'muted')];
    default:
      return [];
  }
}

// 0..1 along the delivery route, or null when the order left the route (failed, cancelled).
export function routeProgress(status: OrderStatus): number | null {
  const index = ROUTE_INDEX[status];
  if (index !== undefined) return (index + 1) / ROUTE.length;
  return status === 'RETURNED' ? 1 : null;
}

export const SOURCE_LABELS: Record<OrderEvent['source'], string> = {
  api: 'LogiFlow',
  provider: 'Courier',
  webhook: 'Courier update',
  system: 'System',
};
