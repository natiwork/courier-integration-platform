import { PAYMENT_LABELS } from '../../lib/labels';
import type { PaymentStatus } from '../../types/order';
import styles from './PaymentBadge.module.css';

// Quieter than StatusBadge on purpose: payment is secondary information in tables.
export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className={`${styles.payment} ${styles[status]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {PAYMENT_LABELS[status]}
    </span>
  );
}
