import { useEffect, useState } from 'react';
import { Button } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { StatusBadge } from '../components/StatusBadge/StatusBadge';
import { ORDER_STATUSES } from '../types/order';
import styles from './StyleguidePage.module.css';

const DEMO_DELAY_MS = 1500;

// Simulates a request so the loading state of a button can be seen. Development only.
function useDemoRequest(): [boolean, () => void] {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(false), DEMO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending]);
  return [pending, () => setPending(true)];
}

// Development-only page that shows every base component and state. Not real data.
export function StyleguidePage() {
  const [saving, startSaving] = useDemoRequest();
  const [retrying, startRetry] = useDemoRequest();
  const [retryCount, setRetryCount] = useState(0);

  return (
    <>
      <PageHeader
        title="Component preview"
        description="Development only. Every base component with sample text, so states can be checked without real data."
      />

      <div className={styles.sections}>
        <section className={styles.section} aria-labelledby="sg-status">
          <h2 id="sg-status" className={styles.heading}>Status badge</h2>
          <ul role="list" className={styles.row}>
            {ORDER_STATUSES.map((status) => (
              <li key={status}>
                <StatusBadge status={status} />
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="sg-buttons">
          <h2 id="sg-buttons" className={styles.heading}>Buttons</h2>
          <div className={styles.row}>
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="quiet">Quiet</Button>
            <Button variant="danger">Danger</Button>
          </div>
          <div className={styles.row}>
            <Button size="sm">Small primary</Button>
            <Button size="sm" variant="secondary">
              Small secondary
            </Button>
            <Button disabled>Disabled</Button>
            <Button loading={saving} onClick={startSaving}>
              {saving ? 'Saving shipment' : 'Save shipment (simulated)'}
            </Button>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="sg-loading">
          <h2 id="sg-loading" className={styles.heading}>Loading state</h2>
          <LoadingState label="Loading shipments…" />
        </section>

        <section className={styles.section} aria-labelledby="sg-empty">
          <h2 id="sg-empty" className={styles.heading}>Empty state</h2>
          <EmptyState
            headingLevel={3}
            title="No shipments to show yet"
            description="Shipments appear here as soon as the first order is created."
          />
          <EmptyState
            size="compact"
            headingLevel={3}
            title="Needs attention"
            description="Compact variant for side panels."
          />
        </section>

        <section className={styles.section} aria-labelledby="sg-error">
          <h2 id="sg-error" className={styles.heading}>Error state</h2>
          <ErrorState
            headingLevel={3}
            title="Shipments couldn't be loaded"
            description={`The server didn't respond. Check that the backend is running, then try again. Retried ${retryCount} times (simulated).`}
            retrying={retrying}
            onRetry={() => {
              setRetryCount((count) => count + 1);
              startRetry();
            }}
          />
        </section>
      </div>
    </>
  );
}
