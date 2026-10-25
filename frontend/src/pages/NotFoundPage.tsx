import { MapPinOff } from 'lucide-react';
import { ButtonLink } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { PageHeader } from '../components/PageHeader/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <Card title="Wrong address" icon={<MapPinOff size={18} />}>
        <EmptyState
          headingLevel={3}
          icon={<MapPinOff size={28} />}
          title="This page doesn't exist"
          description="Check the address, or go back to the overview."
          action={<ButtonLink to="/">Go to overview</ButtonLink>}
        />
      </Card>
    </>
  );
}
