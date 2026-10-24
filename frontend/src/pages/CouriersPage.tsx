import { EmptyState } from '../components/EmptyState/EmptyState';
import { PageHeader } from '../components/PageHeader/PageHeader';

export function CouriersPage() {
  return (
    <>
      <PageHeader title="Couriers" />
      <EmptyState
        title="No courier providers connected yet"
        description="Courier providers will be listed here once they're added."
      />
    </>
  );
}
