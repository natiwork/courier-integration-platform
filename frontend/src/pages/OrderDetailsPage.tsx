import { Link } from 'react-router';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { PageHeader } from '../components/PageHeader/PageHeader';

export function OrderDetailsPage() {
  return (
    <>
      <PageHeader title="Shipment details" />
      <EmptyState
        title="Shipment details aren't available yet"
        description="This page isn't connected to the orders API yet."
        action={<Link to="/shipments">Back to shipments</Link>}
      />
    </>
  );
}
