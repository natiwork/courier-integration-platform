import { EmptyState } from '../components/EmptyState/EmptyState';
import { PageHeader } from '../components/PageHeader/PageHeader';

export function CreateShipmentPage() {
  return (
    <>
      <PageHeader title="New shipment" />
      <EmptyState
        title="The shipment form isn't built yet"
        description="You'll be able to create a shipment here soon."
      />
    </>
  );
}
