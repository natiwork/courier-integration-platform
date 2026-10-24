import { STATUS_LABELS } from '../../lib/labels';
import { formatNumber } from '../../lib/format';
import type { OrderStatus } from '../../types/order';
import styles from './ActivityBars.module.css';

// Statuses an order can move into during the day. PENDING is left out: new orders are counted as "created".
const SHOWN: OrderStatus[] = ['PROCESSING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED'];

interface ActivityBarsProps {
  activity: Record<OrderStatus, number>;
  createdToday: number;
}

export function ActivityBars({ activity, createdToday }: ActivityBarsProps) {
  const max = Math.max(...SHOWN.map((status) => activity[status]), 1);
  return (
    <div className={styles.activity}>
      <p className={styles.created}>
        <strong className="tabular">{formatNumber(createdToday)}</strong> orders created today
      </p>
      <ul role="list" className={styles.list}>
        {SHOWN.map((status) => (
          <li key={status} className={styles.row}>
            <span className={styles.label}>{STATUS_LABELS[status]}</span>
            <span className={styles.track} aria-hidden="true">
              <span className={`${styles.bar} ${styles[status]}`} style={{ width: `${(activity[status] / max) * 100}%` }} />
            </span>
            <span className={`${styles.count} tabular`}>{formatNumber(activity[status])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
