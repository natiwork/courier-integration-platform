import { useRouteError } from 'react-router';
import { ErrorState } from '../components/ErrorState/ErrorState';
import styles from './RouteErrorPage.module.css';

// Shown by the router when rendering a page throws. The real error goes to the console only.
export function RouteErrorPage() {
  const error = useRouteError();
  console.error(error);

  return (
    <main className={styles.page}>
      <ErrorState
        title="This page couldn't be displayed"
        description="Something went wrong while opening this page. Reload it to try again."
        retryLabel="Reload page"
        onRetry={() => window.location.reload()}
      />
    </main>
  );
}
