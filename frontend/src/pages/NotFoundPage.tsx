import { Link } from 'react-router';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { PageHeader } from '../components/PageHeader/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <EmptyState
        title="This page doesn't exist"
        description="Check the address, or go back to the overview."
        action={<Link to="/">Go to overview</Link>}
      />
    </>
  );
}
