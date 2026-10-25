import type { ReactNode } from 'react';
import { CircleCheck } from 'lucide-react';
import styles from './SuccessBanner.module.css';

interface SuccessBannerProps {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}

// Confirms that an action worked. role="status" makes screen readers announce it without moving focus.
export function SuccessBanner({ title, children, actions }: SuccessBannerProps) {
  return (
    <div className={styles.banner} role="status">
      <CircleCheck aria-hidden="true" size={22} className={styles.icon} />
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {children && <p className={styles.text}>{children}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
