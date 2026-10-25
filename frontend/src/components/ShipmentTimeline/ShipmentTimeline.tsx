import { formatDateTime } from '../../lib/format';
import { STATUS_LABELS } from '../../lib/labels';
import { buildStages, routeProgress, SOURCE_LABELS } from '../../lib/shipmentStages';
import type { Order, OrderEvent } from '../../types/order';
import styles from './ShipmentTimeline.module.css';

interface ShipmentTimelineProps {
  order: Order;
  // The order's recorded history, oldest first.
  events: OrderEvent[];
}

export function ShipmentTimeline({ order, events }: ShipmentTimelineProps) {
  const stages = buildStages(order, events);
  const progress = routeProgress(order.status);

  return (
    <div className={styles.timeline}>
      <div className={styles.summary}>
        <p className={styles.currentStatus}>
          <span className={styles.currentLabel}>Current status</span>
          <strong>{STATUS_LABELS[order.status]}</strong>
        </p>
        {progress !== null && (
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="Delivery progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <span className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>

      <ol className={styles.stages}>
        {stages.map(({ key, label, icon: Icon, state, tone, time, dateTime, detail }) => (
          <li
            key={key}
            // Not every tone has a class ("default" has none), so missing ones are dropped instead of printing "undefined".
            className={[styles.stage, styles[state], styles[tone]].filter(Boolean).join(' ')}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className={styles.icon} aria-hidden="true">
              <Icon size={20} />
            </span>
            <span className={styles.text}>
              <span className={styles.label}>
                {label}
                <span className="visually-hidden">
                  {state === 'done' ? ' (completed)' : state === 'current' ? ' (current step)' : ' (not reached yet)'}
                </span>
              </span>
              {dateTime ? (
                <time className={styles.time} dateTime={dateTime}>
                  {time}
                </time>
              ) : (
                <span className={styles.time}>{time}</span>
              )}
              {detail && <span className={styles.detail}>{detail}</span>}
            </span>
          </li>
        ))}
      </ol>

      {events.length > 0 && <OrderHistory events={events} />}
    </div>
  );
}

// Every recorded step, including failed attempts before a retry. Collapsed by default: the stages above
// answer "where is it now"; this answers "what exactly happened".
function OrderHistory({ events }: { events: OrderEvent[] }) {
  return (
    <details className={styles.history}>
      <summary className={styles.historySummary}>Full history ({events.length})</summary>
      <ol className={styles.historyList}>
        {[...events].reverse().map((event) => (
          <li key={event.id} className={styles.historyItem}>
            <time className={styles.time} dateTime={event.createdAt}>
              {formatDateTime(event.createdAt)}
            </time>
            <span className={styles.historyTitle}>
              {event.type === 'ORDER_CREATED'
                ? 'Order placed'
                : event.type === 'PAYMENT_RECORDED'
                  ? 'Payment recorded'
                  : event.type === 'WEBHOOK_IGNORED'
                    ? 'Courier update ignored'
                    : STATUS_LABELS[event.toStatus]}
            </span>
            <span className={styles.historyMessage}>{event.message}</span>
            <span className={styles.historyMeta}>
              From {SOURCE_LABELS[event.source]}
              {event.code && <>, code {event.code}</>}
              {event.attempts !== null && event.attempts > 1 && <>, after {event.attempts} attempts</>}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
