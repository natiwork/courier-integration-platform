import { Ban, Boxes, CircleX, ClipboardList, House, Route, Truck, Undo2, type LucideIcon } from 'lucide-react';
import type { Order, OrderStatus } from '../types/order';
import { formatDateTime } from './format';

export type StageState = 'done' | 'current' | 'upcoming';
export type Tone = 'default' | 'danger' | 'muted' | 'violet';

export interface Stage {
  key: string;
  label: string;
  icon: LucideIcon;
  state: StageState;
  tone: Tone;
  time: string; // what we can honestly say about when it happened
  dateTime?: string;
}

const ROUTE: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'placed', label: 'Order placed', icon: ClipboardList },
  { key: 'processing', label: 'Processing', icon: Boxes },
  { key: 'shipped', label: 'Handed to courier', icon: Truck },
  { key: 'transit', label: 'In transit', icon: Route },
  { key: 'delivered', label: 'Delivered', icon: House },
];

const ROUTE_INDEX: Partial<Record<OrderStatus, number>> = {
  PENDING: 0,
  PROCESSING: 1,
  SHIPPED: 2,
  IN_TRANSIT: 3,
  DELIVERED: 4,
};

const NOT_RECORDED = 'Time not recorded yet';

// Stages are derived from the current status only. Each status change will be recorded as an
// event later; until then only "placed" (createdAt) and the current stage (updatedAt) have real times.
export function buildStages(order: Order): Stage[] {
  const placedTime = formatDateTime(order.createdAt);
  const currentTime = formatDateTime(order.updatedAt);
  const routeStage = (index: number, state: StageState): Stage => {
    const step = ROUTE[index]!;
    const time =
      state === 'upcoming' ? 'Upcoming' : index === 0 ? placedTime : state === 'current' ? currentTime : NOT_RECORDED;
    const dateTime = state === 'upcoming' ? undefined : index === 0 ? order.createdAt : state === 'current' ? order.updatedAt : undefined;
    return { ...step, state, tone: 'default', time, dateTime };
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
    time: currentTime,
    dateTime: order.updatedAt,
  });

  switch (order.status) {
    case 'RETURNED':
      return [...ROUTE.map((_, i) => routeStage(i, 'done')), ending('returned', 'Returned by the customer', Undo2, 'violet')];
    case 'FAILED': {
      // A courier on the order means it was handed over before it failed.
      const reached = order.courierProvider ? 3 : 2;
      return [
        ...ROUTE.slice(0, reached).map((_, i) => routeStage(i, 'done')),
        ending('failed', 'Delivery failed', CircleX, 'danger'),
      ];
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
