import { STATUS_LABELS } from '../../lib/labels';
import type { OrderStatus } from '../../types/order';
import styles from './StatusBadge.module.css';

const ROUTE_STOPS = 5;

// Position on the delivery route (1–5), or a special shape for statuses off the route.
const ROUTE: Record<OrderStatus, number | 'broken' | 'cancelled' | 'returned'> = {
  PENDING: 1,
  PROCESSING: 2,
  SHIPPED: 3,
  IN_TRANSIT: 4,
  DELIVERED: 5,
  FAILED: 'broken',
  CANCELLED: 'cancelled',
  RETURNED: 'returned',
};

const DESCRIPTIONS: Record<OrderStatus, string> = {
  PENDING: 'Waiting to be processed',
  PROCESSING: 'Being prepared for the courier',
  SHIPPED: 'Handed over to the courier',
  IN_TRANSIT: 'On the way to the customer',
  DELIVERED: 'Delivered to the customer',
  FAILED: 'Delivery failed and needs attention',
  CANCELLED: 'Cancelled, will not be shipped',
  RETURNED: 'Delivered, then sent back by the customer',
};

// The text is the status itself; the route marker is a visual aid, so colour is never the only signal.
export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`${styles.badge} ${styles[status]}`} title={DESCRIPTIONS[status]}>
      <RouteMarker route={ROUTE[status]} />
      <span>{STATUS_LABELS[status]}</span>
    </span>
  );
}

function RouteMarker({ route }: { route: (typeof ROUTE)[OrderStatus] }) {
  const stops = Array.from({ length: ROUTE_STOPS }, (_, index) => 4 + index * 8);
  const reached = typeof route === 'number' ? route : route === 'returned' ? ROUTE_STOPS : 0;

  return (
    <svg className={styles.route} viewBox="0 0 40 8" width="34" height="8" aria-hidden="true">
      {route !== 'cancelled' && (
        <line
          x1="4"
          y1="4"
          x2="36"
          y2="4"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray={route === 'broken' ? '2 2' : undefined}
        />
      )}
      {stops.map((x, index) => (
        <circle
          key={x}
          cx={x}
          cy="4"
          r="2.5"
          fill={index < reached ? 'currentColor' : 'var(--badge-bg)'}
          stroke="currentColor"
          strokeWidth="1"
        />
      ))}
      {route === 'broken' && <path d="M17 1 L23 7 M23 1 L17 7" stroke="currentColor" strokeWidth="1.5" />}
      {route === 'cancelled' && <line x1="1" y1="7" x2="39" y2="1" stroke="currentColor" strokeWidth="1" />}
      {route === 'returned' && <path d="M36 4 L30 1 M36 4 L30 7" stroke="currentColor" strokeWidth="1.2" transform="rotate(180 33 4)" />}
    </svg>
  );
}
