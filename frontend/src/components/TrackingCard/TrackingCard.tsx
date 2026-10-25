import { useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { getTracking, type TrackingReport } from '../../api/orders';
import { useCourierName } from '../../context/couriersContext';
import { trackingErrorMessage, type ErrorMessage } from '../../lib/apiErrorMessages';
import { isDemoShipment } from '../../lib/courierEligibility';
import { formatDateTime, formatTime } from '../../lib/format';
import { STATUS_LABELS } from '../../lib/labels';
import type { Order } from '../../types/order';
import { Button } from '../Button/Button';
import styles from './TrackingCard.module.css';

type Check = { kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; report: TrackingReport } | { kind: 'error'; message: ErrorMessage };

// The courier and tracking number of an order, with copy and "ask the courier".
export function TrackingCard({ order }: { order: Order }) {
  const courierName = useCourierName();
  const [copyStatus, setCopyStatus] = useState('');
  const [check, setCheck] = useState<Check>({ kind: 'idle' });
  const numberRef = useRef<HTMLSpanElement>(null);

  if (!order.trackingNumber || !order.courierProvider) {
    return <p className={styles.muted}>Not handed to a courier yet.</p>;
  }
  const trackingNumber = order.trackingNumber;
  const name = courierName(order.courierProvider);
  const demo = isDemoShipment(order);

  // The Clipboard API exists only in secure contexts (https, localhost) and can be blocked, e.g. inside an
  // iframe without the clipboard-write permission. Then the number is selected, so one shortcut copies it.
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API not available');
      await navigator.clipboard.writeText(trackingNumber);
      setCopyStatus('Copied');
    } catch {
      selectNumber();
      setCopyStatus("Copying isn't allowed here. The number is selected: press Ctrl+C (⌘C on Mac) to copy it.");
    }
  }

  function selectNumber() {
    const element = numberRef.current;
    const selection = window.getSelection();
    if (!element || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function ask() {
    setCheck({ kind: 'loading' });
    try {
      setCheck({ kind: 'done', report: await getTracking(order.id) });
    } catch (error) {
      setCheck({ kind: 'error', message: trackingErrorMessage(error) });
    }
  }

  return (
    <div className={styles.tracking}>
      <dl className={styles.facts}>
        <div>
          <dt>Courier</dt>
          <dd className={styles.courier}>{name}</dd>
        </div>
        <div>
          <dt>Tracking number</dt>
          <dd className={styles.numberRow}>
            <span ref={numberRef} className={`${styles.number} tabular`}>
              {trackingNumber}
            </span>
            <Button variant="secondary" size="sm" onClick={copy} aria-label={`Copy tracking number ${trackingNumber}`}>
              <Copy size={16} aria-hidden="true" /> Copy
            </Button>
            <span className={styles.copyStatus} role="status">
              {copyStatus}
            </span>
          </dd>
        </div>
      </dl>

      {demo ? (
        <p className={styles.muted}>
          Demo tracking number: it was generated with the demo data, so {name} has no record of it to check.
        </p>
      ) : (
        <div className={styles.check}>
          <Button variant="secondary" onClick={ask} loading={check.kind === 'loading'}>
            Ask {name} for the latest status
          </Button>
          <div aria-live="polite">
            {check.kind === 'done' && (
              <p className={styles.report}>
                {name} reports <strong>{check.report.externalStatus}</strong>, which means{' '}
                <strong>{STATUS_LABELS[check.report.status]}</strong>, since {formatDateTime(check.report.updatedAt)}. Checked at{' '}
                {formatTime(check.report.checkedAt)}. Shown for information: the order status is not changed here.
              </p>
            )}
            {check.kind === 'error' && (
              <p className={styles.reportError}>
                <strong>{check.message.title}.</strong> {check.message.text}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
