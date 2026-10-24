import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="This page doesn't exist" />
      <p>
        <Link to="/">Go to overview</Link>
      </p>
    </>
  );
}
