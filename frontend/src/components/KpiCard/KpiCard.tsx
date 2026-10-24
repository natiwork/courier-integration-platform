import { useId, type ReactNode } from 'react';
import styles from './KpiCard.module.css';

interface KpiCardProps {
  title: string;
  icon: ReactNode;
  // Pastel background; every tone keeps text contrast above 11:1 in both themes.
  tone: 'lime' | 'mint' | 'sand' | 'rose';
  children: ReactNode;
}

// A pastel tile with one big number. The content (value, trend, indicator) comes from the caller.
export function KpiCard({ title, icon, tone, children }: KpiCardProps) {
  const headingId = useId();
  return (
    <section className={`${styles.kpi} ${styles[tone]}`} aria-labelledby={headingId}>
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
        <h2 id={headingId} className={styles.title}>
          {title}
        </h2>
      </header>
      {children}
    </section>
  );
}

// Building blocks for the card body, so every KPI is laid out the same way.
export function KpiValue({ children }: { children: ReactNode }) {
  return <p className={`${styles.value} tabular`}>{children}</p>;
}

export function KpiNote({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}

export function KpiFooter({ children }: { children: ReactNode }) {
  return <div className={styles.footer}>{children}</div>;
}
