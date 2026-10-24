import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatChange } from '../../lib/format';
import styles from './TrendBadge.module.css';

interface TrendBadgeProps {
  changePercent: number | null;
  // On the dark hero card all directions use the light text colour; the arrow carries the direction.
  onDark?: boolean;
}

// "+4.0%" with an arrow. The sign and the arrow say the direction, so colour is never the only signal.
export function TrendBadge({ changePercent, onDark = false }: TrendBadgeProps) {
  if (changePercent === null) {
    return <span className={`${styles.trend} ${styles.none} ${onDark ? styles.onDark : ''}`}>No data for the previous period</span>;
  }
  const direction = changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'flat';
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  const spoken = direction === 'up' ? 'increase' : direction === 'down' ? 'decrease' : 'no change';
  return (
    <span className={`${styles.trend} ${styles[direction]} ${onDark ? styles.onDark : ''}`}>
      <Icon aria-hidden="true" size={16} strokeWidth={2.5} />
      <span className="tabular">{formatChange(changePercent)}</span>
      <span className="visually-hidden"> {spoken}</span>
    </span>
  );
}
