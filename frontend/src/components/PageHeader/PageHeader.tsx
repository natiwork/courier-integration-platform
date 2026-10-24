import type { ReactNode } from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

// Page title row with a ruled line underneath. Also sets the browser tab title.
// tabIndex={-1} lets AppLayout move focus here after navigation.
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  useDocumentTitle(title);

  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <h1 tabIndex={-1} className={styles.title}>
          {title}
        </h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
