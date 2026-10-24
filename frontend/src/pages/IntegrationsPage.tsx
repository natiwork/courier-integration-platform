import { EmptyState } from '../components/EmptyState/EmptyState';
import { PageHeader } from '../components/PageHeader/PageHeader';

export function IntegrationsPage() {
  return (
    <>
      <PageHeader title="Integrations" />
      <EmptyState
        title="No integration activity yet"
        description="Integration status and recent operations will appear here."
      />
    </>
  );
}
