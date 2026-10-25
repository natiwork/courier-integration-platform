import { Truck } from 'lucide-react';
import { Card } from '../components/Card/Card';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { PageHeader } from '../components/PageHeader/PageHeader';

export function CouriersPage() {
  return (
    <>
      <PageHeader title="Couriers" description="Courier providers that can ship your orders." />
      <Card title="Courier providers" icon={<Truck size={18} />}>
        <EmptyState
          headingLevel={3}
          icon={<Truck size={28} />}
          title="No courier providers connected yet"
          description="Providers will be listed here once their integrations are added. The demo orders name the fictional couriers SwiftParcel and NordCargo, but they aren't connected."
        />
      </Card>
    </>
  );
}
