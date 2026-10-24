import styles from './MiniBars.module.css';

interface MiniBarsProps {
  values: number[];
  // The last bar (the current month) is highlighted.
  highlightLast?: boolean;
  tone?: 'chart' | 'onDark';
}

// A tiny bar sparkline. Decorative: the same numbers are available in the monthly chart.
export function MiniBars({ values, highlightLast = true, tone = 'chart' }: MiniBarsProps) {
  const max = Math.max(...values, 1);
  return (
    <div className={`${styles.bars} ${styles[tone]}`} aria-hidden="true">
      {values.map((value, index) => (
        <span
          key={index}
          className={highlightLast && index === values.length - 1 ? `${styles.bar} ${styles.last}` : styles.bar}
          style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
