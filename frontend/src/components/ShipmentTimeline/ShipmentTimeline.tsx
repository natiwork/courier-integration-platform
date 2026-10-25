import { STATUS_LABELS } from '../../lib/labels';
import { buildStages, routeProgress } from '../../lib/shipmentStages';
import type { Order } from '../../types/order';
import styles from './ShipmentTimeline.module.css';

export function ShipmentTimeline({ order }: { order: Order }) {
  const stages = buildStages(order);
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
        {stages.map(({ key, label, icon: Icon, state, tone, time, dateTime }) => (
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
            </span>
          </li>
        ))}
      </ol>

      <p className={styles.note}>
        Exact times for each step will appear once status changes are recorded as events.
      </p>
    </div>
  );
}
