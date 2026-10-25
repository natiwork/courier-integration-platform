import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import type { Courier } from '../api/couriers';
import { Button } from '../components/Button/Button';
import { ConfirmationDialog } from '../components/ConfirmationDialog/ConfirmationDialog';
import { CourierCard, CourierCardSkeleton } from '../components/CourierCard/CourierCard';
import { DeliveryGauge } from '../components/DeliveryGauge/DeliveryGauge';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { KpiCard, KpiFooter, KpiNote, KpiValue } from '../components/KpiCard/KpiCard';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { MiniBars } from '../components/MiniBars/MiniBars';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { PaymentBadge } from '../components/PaymentBadge/PaymentBadge';
import { ShipmentTimeline } from '../components/ShipmentTimeline/ShipmentTimeline';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { StatusBadge } from '../components/StatusBadge/StatusBadge';
import { TrendBadge } from '../components/TrendBadge/TrendBadge';
import { ORDER_STATUSES, PAYMENT_STATUSES, type Order, type OrderEvent, type OrderStatus } from '../types/order';
import styles from './StyleguidePage.module.css';

const DEMO_DELAY_MS = 1500;

// Sample orders for the timeline specimens. Development-only page: these never reach real screens.
function sampleOrder(status: OrderStatus): Order {
  const handedOver = ['SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'FAILED'].includes(status);
  return {
    id: `sample-${status}`,
    orderNumber: 'SAMPLE-1',
    customerName: 'Sample customer',
    customerEmail: 'sample@example.com',
    deliveryAddress: 'Sample street 1',
    destinationCity: 'Sample city',
    postalCode: '00000',
    destinationCountry: 'DE',
    parcelWeightKg: 1,
    items: [],
    totalCents: 0,
    currency: 'EUR',
    paymentStatus: 'PAID',
    courierProvider: handedOver ? 'Sample courier' : null,
    status,
    trackingNumber: null,
    createdAt: '2026-01-05T09:30:00.000Z',
    updatedAt: '2026-01-07T16:45:00.000Z',
  };
}

const SAMPLE_COUNTRIES = ['AT', 'BE', 'DE', 'DK', 'FI', 'FR', 'NL', 'NO', 'PL', 'SE'];

// A sample courier for the card specimens: the real ones come from /api/couriers.
function sampleCourier(status: 'up' | 'down'): Courier {
  return {
    id: `sample-${status}`,
    name: status === 'up' ? 'Sample courier' : 'Sample courier, no answer',
    mock: true,
    capabilities: {
      maxParcelWeightKg: status === 'up' ? 100 : 30,
      supportedCountries: status === 'up' ? SAMPLE_COUNTRIES : ['DE', 'DK', 'SE'],
      services: [
        { id: 'standard', name: 'Standard' },
        { id: 'economy', name: 'Economy' },
      ],
      addressValidation: status === 'down',
    },
    health: {
      status,
      latencyMs: status === 'up' ? 42 : 187,
      checkedAt: '2026-01-07T16:45:00.000Z',
      simulated: true,
      note: 'Simulated check: mock provider, no external service is contacted.',
    },
  };
}

// A plausible history for each sample order, one hour per step.
const SAMPLE_PATHS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PENDING'],
  PROCESSING: ['PENDING', 'PROCESSING'],
  SHIPPED: ['PENDING', 'PROCESSING', 'SHIPPED'],
  IN_TRANSIT: ['PENDING', 'PROCESSING', 'SHIPPED', 'IN_TRANSIT'],
  DELIVERED: ['PENDING', 'PROCESSING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'],
  FAILED: ['PENDING', 'PROCESSING', 'SHIPPED', 'FAILED'],
  CANCELLED: ['PENDING', 'CANCELLED'],
  RETURNED: ['PENDING', 'PROCESSING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED'],
};

function sampleEvents(status: OrderStatus): OrderEvent[] {
  const path = SAMPLE_PATHS[status];
  return path.map((to, index) => ({
    id: `sample-${status}-${index}`,
    orderId: `sample-${status}`,
    type: index === 0 ? 'ORDER_CREATED' : to === 'SHIPPED' ? 'SHIPMENT_CREATED' : 'STATUS_CHANGED',
    fromStatus: index === 0 ? null : path[index - 1]!,
    toStatus: to,
    source: to === 'SHIPPED' ? 'provider' : 'api',
    message: to === 'SHIPPED' ? 'Sample courier accepted the parcel, tracking number SAMPLE-1' : 'Sample step',
    providerId: null,
    code: null,
    attempts: null,
    createdAt: new Date(Date.parse('2026-01-05T09:30:00.000Z') + index * 3_600_000).toISOString(),
  }));
}

// Simulates a request so loading states can be seen.
function useDemoRequest(): [boolean, () => void] {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(false), DEMO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending]);
  return [pending, () => setPending(true)];
}

// Development-only page: every base component and state, in both themes side by side. Sample text, not real data.
export function StyleguidePage() {
  return (
    <>
      <PageHeader
        title="Component preview"
        description="Development only. Every component and state with sample text, in the light and the dark theme."
      />
      <div className={styles.themes}>
        <section data-theme="light" className={styles.panel} aria-labelledby="sg-light">
          <h2 id="sg-light" className={styles.panelTitle}>
            Light theme
          </h2>
          <Specimens theme="light" />
        </section>
        <section data-theme="dark" className={styles.panel} aria-labelledby="sg-dark">
          <h2 id="sg-dark" className={styles.panelTitle}>
            Dark theme
          </h2>
          <Specimens theme="dark" />
        </section>
      </div>
    </>
  );
}

function Specimens({ theme }: { theme: 'light' | 'dark' }) {
  const [saving, startSaving] = useDemoRequest();
  const [retrying, startRetry] = useDemoRequest();
  const [retryCount, setRetryCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmingDialog, startConfirmingDialog] = useDemoRequest();
  const id = (name: string) => `sg-${theme}-${name}`;

  return (
    <div className={styles.sections}>
      <section className={styles.section} aria-labelledby={id('status')}>
        <h3 id={id('status')} className={styles.heading}>
          Status and payment badges
        </h3>
        <ul role="list" className={styles.row}>
          {ORDER_STATUSES.map((status) => (
            <li key={status}>
              <StatusBadge status={status} />
            </li>
          ))}
        </ul>
        <ul role="list" className={styles.row}>
          {PAYMENT_STATUSES.map((status) => (
            <li key={status}>
              <PaymentBadge status={status} />
            </li>
          ))}
        </ul>
        <ul role="list" className={styles.row}>
          {[12.4, -3.1, 0, null].map((change, index) => (
            <li key={index}>
              <TrendBadge changePercent={change} />
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby={id('buttons')}>
        <h3 id={id('buttons')} className={styles.heading}>
          Buttons
        </h3>
        <div className={styles.row}>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div className={styles.row}>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
          <Button loading={saving} onClick={startSaving}>
            Save shipment (simulated)
          </Button>
        </div>
      </section>

      <section className={styles.section} aria-labelledby={id('data')}>
        <h3 id={id('data')} className={styles.heading}>
          KPI tile, gauge, sparkline
        </h3>
        <div className={styles.dataRow}>
          <KpiCard title="Sample KPI" tone="lime" icon={<Package size={16} />}>
            <KpiValue>1,234</KpiValue>
            <KpiNote>
              <TrendBadge changePercent={4.6} />
              <span>vs previous 30 days</span>
            </KpiNote>
            <KpiFooter>
              <MiniBars values={[3, 5, 4, 6, 7, 6, 8, 9, 7]} />
            </KpiFooter>
          </KpiCard>
          <div className={styles.surface}>
            <DeliveryGauge ratio={0.9} delivered={900} failed={40} returned={60} />
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby={id('dialog')}>
        <h3 id={id('dialog')} className={styles.heading}>
          Confirmation dialog
        </h3>
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Open sample dialog
          </Button>
        </div>
        <ConfirmationDialog
          open={dialogOpen}
          title="Ship SAMPLE-1 with Sample courier?"
          confirmLabel="Confirm (simulated)"
          busy={confirmingDialog}
          onConfirm={() => {
            startConfirmingDialog();
            setTimeout(() => setDialogOpen(false), DEMO_DELAY_MS);
          }}
          onCancel={() => setDialogOpen(false)}
        >
          <p>Focus starts on Cancel, Tab stays inside, Escape closes. While confirming, it can't be dismissed.</p>
        </ConfirmationDialog>
      </section>

      <section className={styles.section} aria-labelledby={id('courier')}>
        <h3 id={id('courier')} className={styles.heading}>
          Courier card: responding, not responding, loading
        </h3>
        <CourierCard courier={sampleCourier('up')} platformCountries={SAMPLE_COUNTRIES} platformMaxWeightKg={100} />
        <CourierCard courier={sampleCourier('down')} platformCountries={SAMPLE_COUNTRIES} platformMaxWeightKg={100} />
        <CourierCardSkeleton />
      </section>

      <section className={styles.section} aria-labelledby={id('timeline')}>
        <h3 id={id('timeline')} className={styles.heading}>
          Shipment timeline, one per status
        </h3>
        <div className={styles.timelines}>
          {ORDER_STATUSES.map((status) => (
            <div key={status} className={styles.surface}>
              <ShipmentTimeline order={sampleOrder(status)} events={sampleEvents(status)} />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby={id('states')}>
        <h3 id={id('states')} className={styles.heading}>
          Loading, empty and error states
        </h3>
        <div className={styles.surface}>
          <Skeleton label="Loading sample" lines={[{ height: '1.5rem', width: '50%' }, { height: '4rem' }]} />
        </div>
        <LoadingState label="Loading shipments…" />
        <EmptyState headingLevel={3} icon={<Package size={28} />} title="No shipments to show yet" description="Default size, with an icon." />
        <EmptyState size="compact" headingLevel={3} title="Nothing needs attention" description="Compact size for dashboard widgets." />
        <ErrorState
          headingLevel={3}
          title="Shipments couldn't be loaded"
          description={`The server didn't respond. Check that the backend is running, then try again. Retried ${retryCount} times (simulated).`}
          retrying={retrying}
          onRetry={() => {
            setRetryCount((count) => count + 1);
            startRetry();
          }}
        />
      </section>
    </div>
  );
}
