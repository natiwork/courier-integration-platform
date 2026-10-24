import { useState } from 'react';
import type { OverviewStats } from '../../api/types';
import { formatMoney, formatMoneyCompact, formatNumber, monthLabel } from '../../lib/format';
import styles from './MonthlyChart.module.css';

type Metric = 'revenue' | 'orders';

const METRICS: { id: Metric; label: string }[] = [
  { id: 'revenue', label: 'Revenue' },
  { id: 'orders', label: 'Orders' },
];

// Rounds the axis maximum up to 1, 2 or 5 × 10ⁿ, so gridline labels are round numbers.
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

// Revenue or order count per month. One unit at a time: two series with different units
// on one axis would suggest comparisons that don't make sense.
export function MonthlyChart({ monthly }: { monthly: OverviewStats['monthly'] }) {
  const [metric, setMetric] = useState<Metric>('revenue');
  const values = monthly.map((month) => (metric === 'revenue' ? month.revenueCents : month.orders));
  const max = niceMax(Math.max(...values));
  const total = values.reduce((sum, value) => sum + value, 0);
  const formatShort = metric === 'revenue' ? formatMoneyCompact : formatNumber;
  const formatFull = metric === 'revenue' ? formatMoney : formatNumber;
  const unit = metric === 'revenue' ? 'paid revenue' : 'orders';
  const description = monthly
    .map((month, index) => `${monthLabel(month.month, 'long')}: ${formatFull(values[index] ?? 0)}`)
    .join(', ');

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <p className={styles.total}>
          <span className={`${styles.totalValue} tabular`}>{formatFull(total)}</span>
          <span className={styles.totalLabel}>{unit} in the last 9 months</span>
        </p>
        <div className={styles.segmented} role="group" aria-label="Chart metric">
          {METRICS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={styles.segment}
              aria-pressed={metric === id}
              onClick={() => setMetric(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.chart} role="img" aria-label={`${metric === 'revenue' ? 'Paid revenue' : 'Orders'} per month. ${description}`}>
        <div className={styles.grid} aria-hidden="true">
          {[1, 0.5, 0].map((fraction) => (
            <span key={fraction} className={styles.gridLine} style={{ bottom: `${fraction * 100}%` }}>
              <span className={styles.gridLabel}>{formatShort(max * fraction)}</span>
            </span>
          ))}
        </div>
        <ol className={styles.bars} role="list" aria-hidden="true">
          {monthly.map((month, index) => {
            const value = values[index] ?? 0;
            const isCurrent = index === monthly.length - 1;
            return (
              <li key={month.month} className={isCurrent ? `${styles.column} ${styles.current}` : styles.column}>
                <span className={styles.plot}>
                  <span className={styles.value}>{formatShort(value)}</span>
                  <span className={styles.bar} style={{ height: `${(value / max) * 100}%` }} />
                </span>
                <span className={styles.month}>
                  <span className={styles.monthShort}>{monthLabel(month.month, 'short')}</span>
                  <span className={styles.monthNarrow}>{monthLabel(month.month, 'narrow')}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className={styles.legend}>
        <span className={styles.legendSwatch} aria-hidden="true" /> This month (so far)
      </p>
    </div>
  );
}
