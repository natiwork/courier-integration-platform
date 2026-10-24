import { useEffect, useRef, type ReactNode } from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

// Page title row with a ruled line underneath. Also sets the tab title and moves focus
// to the heading after navigation, so screen reader users hear which page opened.
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useDocumentTitle(title);

  useEffect(() => {
    headingRef.current?.focus();
  }, [title]);

  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          {title}
        </h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
