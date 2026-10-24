import { ButtonLink } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { PageHeader } from '../components/PageHeader/PageHeader';
import styles from './OverviewPage.module.css';

export function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" actions={<ButtonLink to="/shipments/new">New shipment</ButtonLink>} />

      <div className={styles.grid}>
        <section className={styles.summary} aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="visually-hidden">
            Summary
          </h2>
          {/* Becomes a sentence built from real order counts once the dashboard reads the orders API */}
          <p className={styles.headline}>Nothing is on the move yet.</p>
          <p className={styles.lead}>
            Shipment numbers will appear here once the dashboard is connected to the orders API.
          </p>
        </section>

        <aside className={styles.side} aria-label="Status panels">
          <EmptyState
            size="compact"
            headingLevel={2}
            title="Needs attention"
            description="Failed shipments will be listed here."
          />
          <EmptyState
            size="compact"
            headingLevel={2}
            title="Integrations"
            description="Courier integration status will appear here once providers are connected."
          />
        </aside>
      </div>
    </>
  );
}
