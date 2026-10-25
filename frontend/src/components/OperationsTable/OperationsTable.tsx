import { Link } from 'react-router';
import { CircleCheck, CircleX, Clock3 } from 'lucide-react';
import type { OperationOutcome, ProviderOperation } from '../../api/integrations';
import { formatDateTime } from '../../lib/format';
import styles from './OperationsTable.module.css';

const OUTCOMES: Record<OperationOutcome, { label: string; icon: typeof CircleCheck }> = {
  succeeded: { label: 'Accepted', icon: CircleCheck },
  rejected: { label: 'Rejected', icon: CircleX },
  unavailable: { label: 'Unavailable', icon: Clock3 },
};

// Courier calls, newest first. A real <table> on wide containers, cards on narrow ones.
export function OperationsTable({ operations, busy = false }: { operations: ProviderOperation[]; busy?: boolean }) {
  return (
    <div className={styles.wrapper} aria-busy={busy || undefined}>
      <table className={busy ? `${styles.table} ${styles.busy}` : styles.table}>
        <caption className="visually-hidden">Recent courier calls, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Courier</th>
            <th scope="col">Result</th>
            <th scope="col">Order</th>
            <th scope="col">What the courier said</th>
          </tr>
        </thead>
        <tbody>
          {operations.map((operation) => {
            const { label, icon: Icon } = OUTCOMES[operation.outcome];
            return (
              <tr key={operation.id}>
                <td data-label="Time" className={`${styles.time} tabular`}>
                  <time dateTime={operation.createdAt}>{formatDateTime(operation.createdAt)}</time>
                </td>
                <td data-label="Courier" className={styles.courier}>
                  {operation.providerName}
                </td>
                <td data-label="Result">
                  <span className={`${styles.outcome} ${styles[operation.outcome]}`}>
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </span>
                </td>
                <td data-label="Order">
                  {operation.orderNumber ? (
                    <Link to={`/shipments/${operation.orderId}`} className={styles.orderLink}>
                      {operation.orderNumber}
                    </Link>
                  ) : (
                    <span className={styles.muted}>Order removed</span>
                  )}
                </td>
                <td data-label="Courier answer" className={styles.message}>
                  {operation.message}
                  {operation.code && <span className={styles.code}>Code {operation.code}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
