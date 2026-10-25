import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router';
import { getOrderFormOptions } from '../api/meta';
import { CreateOrderForm } from '../components/CreateOrderForm/CreateOrderForm';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useApi } from '../hooks/useApi';
import styles from './CreateShipmentPage.module.css';

export function CreateShipmentPage() {
  // Countries and limits come from the backend, so the form never hard-codes them.
  const options = useApi((signal) => getOrderFormOptions(signal), 'order-form-options');

  return (
    <>
      <Link to="/shipments" className={styles.back}>
        <ChevronLeft aria-hidden="true" size={18} /> Back to shipments
      </Link>
      <PageHeader title="New shipment" />
      <p id="form-intro" className={styles.intro}>
        The order starts as Pending. A courier is chosen when it ships.
      </p>

      {options.status === 'error' ? (
        <ErrorState
          title="The form couldn't be loaded"
          description={`${options.error?.message ?? ''} The list of countries and limits comes from the server.`}
          onRetry={options.reload}
        />
      ) : !options.data ? (
        <Skeleton label="Loading the form" lines={[{ height: '9rem' }, { height: '12rem' }, { height: '10rem' }]} />
      ) : (
        <CreateOrderForm options={options.data} />
      )}
    </>
  );
}
