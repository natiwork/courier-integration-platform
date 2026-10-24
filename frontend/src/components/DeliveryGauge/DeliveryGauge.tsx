import { formatNumber, formatPercent } from '../../lib/format';
import styles from './DeliveryGauge.module.css';

interface DeliveryGaugeProps {
  // 0..1, from stats.rates.deliveryPerformance
  ratio: number;
  delivered: number;
  failed: number;
  returned: number;
}

// A half-circle gauge drawn with SVG. pathLength="100" lets the arc length be set directly in percent.
export function DeliveryGauge({ ratio, delivered, failed, returned }: DeliveryGaugeProps) {
  const percent = Math.round(ratio * 1000) / 10;
  const label = `${formatPercent(ratio)} of finished orders were delivered: ${formatNumber(delivered)} delivered, ${formatNumber(failed)} failed, ${formatNumber(returned)} returned.`;

  return (
    <div className={styles.gauge}>
      <div className={styles.dial} role="img" aria-label={label}>
        <svg viewBox="0 0 200 112" aria-hidden="true">
          <path className={styles.track} d="M 20 100 A 80 80 0 0 1 180 100" pathLength={100} />
          <path
            className={styles.value}
            d="M 20 100 A 80 80 0 0 1 180 100"
            pathLength={100}
            strokeDasharray={`${percent} 100`}
          />
        </svg>
        <p className={styles.reading} aria-hidden="true">
          <span className={`${styles.percent} tabular`}>{formatPercent(ratio)}</span>
          <span className={styles.caption}>delivered</span>
        </p>
      </div>
      <ul role="list" className={styles.legend}>
        <li>
          <span className={`${styles.dot} ${styles.delivered}`} aria-hidden="true" />
          Delivered <strong className="tabular">{formatNumber(delivered)}</strong>
        </li>
        <li>
          <span className={`${styles.dot} ${styles.failed}`} aria-hidden="true" />
          Failed <strong className="tabular">{formatNumber(failed)}</strong>
        </li>
        <li>
          <span className={`${styles.dot} ${styles.returned}`} aria-hidden="true" />
          Returned <strong className="tabular">{formatNumber(returned)}</strong>
        </li>
      </ul>
    </div>
  );
}
