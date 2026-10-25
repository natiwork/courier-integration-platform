import { Cable, CircleCheck, CircleX, Clock3, Hourglass, RadioTower } from 'lucide-react';
import { getIntegrationActivity, type ProviderActivitySummary } from '../api/integrations';
import { Button } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { OperationsTable } from '../components/OperationsTable/OperationsTable';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { WebhooksTable } from '../components/WebhooksTable/WebhooksTable';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useApi } from '../hooks/useApi';
import { formatDateTime, formatNumber } from '../lib/format';
import { summarizeWebhooks } from '../lib/webhookOutcomes';
import styles from './IntegrationsPage.module.css';

export function IntegrationsPage() {
  const activity = useApi((signal) => getIntegrationActivity(signal), 'integration-activity');
  const refreshing = activity.status === 'loading' && activity.data !== undefined;

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Calls this server made to the courier providers, and the webhooks they sent back. The couriers are mocks and the webhooks come from our simulator, but every call listed here really happened and every signature was really checked."
        actions={
          activity.data && (
            <Button variant="secondary" onClick={activity.reload} loading={refreshing}>
              Refresh
            </Button>
          )
        }
      />

      {activity.status === 'error' && !activity.data ? (
        <ErrorState
          title="Courier activity couldn't be loaded"
          description={activity.error?.message ?? 'Something went wrong.'}
          onRetry={activity.reload}
        />
      ) : !activity.data ? (
        <div className={styles.layout}>
          <div className={styles.summary}>
            <Skeleton label="Loading courier summary" lines={[{ height: '8rem' }]} />
            <Skeleton label="Loading courier summary" lines={[{ height: '8rem' }]} />
          </div>
          <Skeleton label="Loading courier calls" lines={[{ height: '2.5rem' }, { height: '12rem' }]} />
        </div>
      ) : (
        <div className={styles.layout} data-stale={refreshing || undefined}>
          {activity.status === 'error' && (
            <ErrorState
              headingLevel={2}
              title="Couldn't refresh"
              description={`${activity.error?.message ?? 'Something went wrong.'} The list below is from the previous load.`}
              onRetry={activity.reload}
            />
          )}
          <ul role="list" className={styles.summary} aria-label="Calls per courier">
            {activity.data.summary.map((provider) => (
              <SummaryTile key={provider.providerId} provider={provider} />
            ))}
          </ul>

          <Card title="Recent courier calls" subtitle="Newest first, up to 50" icon={<Cable size={18} />}>
            {activity.data.operations.length === 0 ? (
              <EmptyState
                headingLevel={3}
                icon={<Cable size={28} />}
                title="No courier calls yet"
                description="Ship an order from its details page to see the call here. Demo orders were generated, not shipped through couriers, so they don't appear."
              />
            ) : (
              <OperationsTable operations={activity.data.operations} busy={refreshing} />
            )}
          </Card>

          <Card title="Incoming webhooks" subtitle="Sent by our simulator, checked for real" icon={<RadioTower size={18} />}>
            <ul role="list" className={styles.webhookSummary}>
              {activity.data.webhooks.summary.map((provider) => (
                <li key={provider.providerId}>
                  <strong>{provider.providerName}:</strong> {summarizeWebhooks(provider.counts)}
                </li>
              ))}
            </ul>
            {activity.data.webhooks.recent.length === 0 ? (
              <EmptyState
                headingLevel={3}
                icon={<RadioTower size={28} />}
                title="No webhooks received yet"
                description="Send one from a shipped order (Simulate a courier update) or with npm run simulate:webhook in the backend folder."
              />
            ) : (
              <WebhooksTable webhooks={activity.data.webhooks.recent} busy={refreshing} />
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function SummaryTile({ provider }: { provider: ProviderActivitySummary }) {
  const counts = [
    { label: 'Accepted', value: provider.succeeded, icon: CircleCheck },
    { label: 'Rejected', value: provider.rejected, icon: CircleX },
    { label: 'Unavailable', value: provider.unavailable, icon: Clock3 },
    { label: 'Timed out', value: provider.timedOut, icon: Hourglass },
  ];
  return (
    <li className={styles.tile}>
      <h2 className={styles.tileTitle}>{provider.providerName}</h2>
      <dl className={styles.counts}>
        {counts.map(({ label, value, icon: Icon }) => (
          <div key={label} className={styles.count}>
            <dt>
              <Icon size={16} aria-hidden="true" /> {label}
            </dt>
            <dd className="tabular">{formatNumber(value)}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.last}>
        {provider.lastOperationAt ? (
          <>
            Last call <time dateTime={provider.lastOperationAt}>{formatDateTime(provider.lastOperationAt)}</time>
          </>
        ) : (
          'No calls yet'
        )}
      </p>
    </li>
  );
}
