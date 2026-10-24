import { useId, type ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  title: string;
  // Short context next to the title, e.g. "Last 30 days".
  subtitle?: string;
  icon?: ReactNode;
  // Controls on the right of the header (links, segmented buttons).
  action?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
}

// A titled section on a raised surface. Every dashboard widget is one of these.
export function Card({ title, subtitle, icon, action, id, className, children }: CardProps) {
  const headingId = useId();
  return (
    // A card with an id can be a link target (e.g. "/#needs-attention"), so it must be focusable.
    <section
      id={id}
      tabIndex={id ? -1 : undefined}
      className={[styles.card, className].filter(Boolean).join(' ')}
      aria-labelledby={headingId}
    >
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          {icon && (
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
          )}
          <h2 id={headingId} className={styles.title}>
            {title}
          </h2>
          {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
        </div>
        {action && <div className={styles.action}>{action}</div>}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
