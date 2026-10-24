import type { OrderStatus } from '../../types/order';
import styles from './StatusBadge.module.css';

const ROUTE_STOPS = 5;

interface StatusInfo {
  label: string;
  // Position on the delivery route (1–5), or a special shape for statuses off the route.
  route: number | 'broken' | 'cancelled';
  description: string;
}

const STATUS_INFO: Record<OrderStatus, StatusInfo> = {
  PENDING: { label: 'Pending', route: 1, description: 'Waiting to be processed' },
  PROCESSING: { label: 'Processing', route: 2, description: 'Being prepared for the courier' },
  SHIPPED: { label: 'Shipped', route: 3, description: 'Handed over to the courier' },
  IN_TRANSIT: { label: 'In transit', route: 4, description: 'On the way to the customer' },
  DELIVERED: { label: 'Delivered', route: 5, description: 'Delivered to the customer' },
  FAILED: { label: 'Failed', route: 'broken', description: 'Delivery failed and needs attention' },
  CANCELLED: { label: 'Cancelled', route: 'cancelled', description: 'Cancelled, will not be shipped' },
};

// Text is the status itself; the route marker is a visual aid, so color is never the only signal.
export function StatusBadge({ status }: { status: OrderStatus }) {
  const info = STATUS_INFO[status];
  return (
    <span className={`${styles.badge} ${styles[status]}`} title={info.description}>
      <RouteMarker route={info.route} />
      <span>{info.label}</span>
    </span>
  );
}

function RouteMarker({ route }: { route: StatusInfo['route'] }) {
  const stops = Array.from({ length: ROUTE_STOPS }, (_, index) => 4 + index * 8);
  const reached = typeof route === 'number' ? route : 0;

  return (
    <svg className={styles.route} viewBox="0 0 40 8" width="40" height="8" aria-hidden="true">
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
    </svg>
  );
}
