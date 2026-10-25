import { Cable } from 'lucide-react';
import { Card } from '../components/Card/Card';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { PageHeader } from '../components/PageHeader/PageHeader';

export function IntegrationsPage() {
  return (
    <>
      <PageHeader title="Integrations" description="Connection status and recent operations with courier providers." />
      <Card title="Integration activity" icon={<Cable size={18} />}>
        <EmptyState
          headingLevel={3}
          icon={<Cable size={28} />}
          title="No integration activity yet"
          description="Calls to courier providers and incoming status updates will appear here once providers are connected."
        />
      </Card>
    </>
  );
}
