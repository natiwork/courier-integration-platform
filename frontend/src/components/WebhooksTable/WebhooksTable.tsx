import { Link } from 'react-router';
import type { IncomingWebhook } from '../../api/integrations';
import { formatDateTime } from '../../lib/format';
import { STATUS_LABELS } from '../../lib/labels';
import { WEBHOOK_OUTCOMES } from '../../lib/webhookOutcomes';
// Same table and card layout as the courier calls next to it.
import table from '../OperationsTable/OperationsTable.module.css';
import styles from './WebhooksTable.module.css';

// Webhooks received from couriers, newest first, including the ones we refused.
export function WebhooksTable({ webhooks, busy = false }: { webhooks: IncomingWebhook[]; busy?: boolean }) {
  return (
    <div className={table.wrapper} aria-busy={busy || undefined}>
      <table className={busy ? `${table.table} ${table.busy}` : table.table}>
        <caption className="visually-hidden">Webhooks received from couriers, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Courier</th>
            <th scope="col">Result</th>
            <th scope="col">Order</th>
            <th scope="col">Courier status</th>
          </tr>
        </thead>
        <tbody>
          {webhooks.map((webhook) => {
            const { label, tone } = WEBHOOK_OUTCOMES[webhook.outcome];
            return (
              <tr key={webhook.id}>
                <td data-label="Time" className={`${table.time} tabular`}>
                  <time dateTime={webhook.receivedAt}>{formatDateTime(webhook.receivedAt)}</time>
                </td>
                <td data-label="Courier" className={table.courier}>
                  {webhook.providerName}
                </td>
                <td data-label="Result">
                  <span className={`${styles.outcome} ${styles[tone]}`}>{label}</span>
                </td>
                <td data-label="Order">
                  {webhook.orderId && webhook.orderNumber ? (
                    <Link to={`/shipments/${webhook.orderId}`} className={table.orderLink}>
                      {webhook.orderNumber}
                    </Link>
                  ) : (
                    <span className={table.muted}>
                      {!webhook.eventId ? 'Not trusted' : webhook.outcome === 'duplicate' ? 'Already handled' : 'No matching order'}
                    </span>
                  )}
                </td>
                <td data-label="Courier status" className={table.message}>
                  {webhook.externalStatus ? (
                    <>
                      <span className={styles.code}>{webhook.externalStatus}</span>
                      {webhook.status && <> means {STATUS_LABELS[webhook.status]}</>}
                    </>
                  ) : (
                    <span className={table.muted}>The body is not read until the signature checks out</span>
                  )}
                  {webhook.eventId && <span className={table.code}>Event {webhook.eventId}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
