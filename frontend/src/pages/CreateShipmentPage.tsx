import { PackagePlus } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '../components/Card/Card';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { PageHeader } from '../components/PageHeader/PageHeader';

export function CreateShipmentPage() {
  return (
    <>
      <PageHeader title="New shipment" description="Create an order and choose how it will be shipped." />
      <Card title="Shipment form" icon={<PackagePlus size={18} />}>
        <EmptyState
          headingLevel={3}
          icon={<PackagePlus size={28} />}
          title="The shipment form isn't built yet"
          description="You'll be able to create a shipment here soon. Existing orders are in the shipments list."
          action={<Link to="/shipments">Go to shipments</Link>}
        />
      </Card>
    </>
  );
}
