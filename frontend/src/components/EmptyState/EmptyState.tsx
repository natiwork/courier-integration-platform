import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  title: string;
  description: string;
  // Only pass an action that really works (e.g. a link to an existing page).
  action?: ReactNode;
  headingLevel?: 2 | 3;
  size?: 'default' | 'compact';
}

export function EmptyState({ title, description, action, headingLevel = 2, size = 'default' }: EmptyStateProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={`${styles.empty} ${styles[size]}`}>
      <Heading className={styles.title}>{title}</Heading>
      <p className={styles.description}>{description}</p>
      {action && <div className={styles.action}>{action}</div>}
    </section>
  );
}
