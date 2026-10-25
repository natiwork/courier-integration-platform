import { Truck } from 'lucide-react';
import { getOrderFormOptions } from '../api/meta';
import { Button } from '../components/Button/Button';
import { CourierCard, CourierCardSkeleton } from '../components/CourierCard/CourierCard';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { useCouriers } from '../context/couriersContext';
import { useApi } from '../hooks/useApi';
import styles from './CouriersPage.module.css';

export function CouriersPage() {
  const couriers = useCouriers();
  // The platform's own countries and weight limit, so each courier can be compared against them.
  const platform = useApi((signal) => getOrderFormOptions(signal), 'order-form-options');
  const checking = couriers.status === 'loading' && couriers.data !== undefined;

  function retry() {
    if (couriers.status === 'error') couriers.reload();
    if (platform.status === 'error') platform.reload();
  }

  let content;
  const failed = couriers.status === 'error' ? couriers : platform.status === 'error' ? platform : null;
  if (failed) {
    content = (
      <ErrorState
        title="Couriers couldn't be loaded"
        description={failed.error?.message ?? 'Something went wrong.'}
        onRetry={retry}
      />
    );
  } else if (!couriers.data || !platform.data) {
    content = (
      <div className={styles.grid}>
        <CourierCardSkeleton />
        <CourierCardSkeleton />
      </div>
    );
  } else if (couriers.data.length === 0) {
    content = (
      <EmptyState
        icon={<Truck size={28} />}
        title="No courier providers registered"
        description="Couriers appear here once the backend registers a provider integration."
      />
    );
  } else {
    const { countries, limits } = platform.data;
    content = (
      // Dimmed while "Check again" runs, so the previous results stay readable.
      <div className={styles.grid} data-stale={checking || undefined}>
        {couriers.data.map((courier) => (
          <CourierCard
            key={courier.id}
            courier={courier}
            platformCountries={countries}
            platformMaxWeightKg={limits.parcelWeightKgMax}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Couriers"
        description="The fictional mock couriers this demo ships with, what each one accepts, and whether it answers a simulated health check."
        actions={
          couriers.data && (
            <Button variant="secondary" onClick={couriers.reload} loading={checking}>
              Check again
            </Button>
          )
        }
      />
      {content}
    </>
  );
}
