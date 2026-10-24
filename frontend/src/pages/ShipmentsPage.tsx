import { ButtonLink } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { PageHeader } from '../components/PageHeader/PageHeader';

export function ShipmentsPage() {
  return (
    <>
      <PageHeader title="Shipments" actions={<ButtonLink to="/shipments/new">New shipment</ButtonLink>} />
      <EmptyState title="No shipments to show yet" description="This list isn't connected to the orders API yet." />
    </>
  );
}
