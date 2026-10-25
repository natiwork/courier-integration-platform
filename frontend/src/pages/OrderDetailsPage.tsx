import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ChevronLeft, MapPinned, ReceiptText, Route, UserRound } from 'lucide-react';
import { ApiError } from '../api/client';
import { getOrder, getOrderEvents } from '../api/orders';
import { Button, ButtonLink } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { OrderItemsTable } from '../components/OrderItemsTable/OrderItemsTable';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { PaymentBadge } from '../components/PaymentBadge/PaymentBadge';
import { RouteSchematic } from '../components/RouteSchematic/RouteSchematic';
import { ShipmentTimeline } from '../components/ShipmentTimeline/ShipmentTimeline';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { StatusBadge } from '../components/StatusBadge/StatusBadge';
import { SuccessBanner } from '../components/SuccessBanner/SuccessBanner';
import { useCourierName } from '../context/couriersContext';
import { useApi, type ApiState } from '../hooks/useApi';
import { countryName, formatDateTime, formatNumber } from '../lib/format';
import type { Order, OrderEvent } from '../types/order';
import styles from './OrderDetailsPage.module.css';

export function OrderDetailsPage() {
  const { orderId = '' } = useParams();
  const order = useApi((signal) => getOrder(orderId, signal), orderId);
  const events = useApi((signal) => getOrderEvents(orderId, signal), orderId);
  const notFound = order.error instanceof ApiError && order.error.status === 404;
  const current = order.data?.id === orderId ? order.data : undefined;

  // Set by the create form. Read once into local state, then removed from the history entry,
  // so a reload or coming back later doesn't show "created" again.
  const location = useLocation();
  const navigate = useNavigate();
  const [createdOrderNumber, setCreatedOrderNumber] = useState<string | null>(
    () => (location.state as { createdOrderNumber?: string } | null)?.createdOrderNumber ?? null,
  );
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  return (
    <>
      <Link to="/shipments" className={styles.back}>
        <ChevronLeft aria-hidden="true" size={18} /> Back to shipments
      </Link>

      <PageHeader
        title={current?.orderNumber ?? (notFound ? 'Order not found' : 'Shipment details')}
        description={current ? `Created ${formatDateTime(current.createdAt)}, last updated ${formatDateTime(current.updatedAt)}` : undefined}
        actions={
          current && (
            <>
              <StatusBadge status={current.status} />
              <PaymentBadge status={current.paymentStatus} />
            </>
          )
        }
      />

      {current && createdOrderNumber === current.orderNumber && (
        <SuccessBanner
          title={`Shipment ${current.orderNumber} created`}
          actions={
            <>
              <ButtonLink to="/shipments/new" variant="secondary" size="sm">
                Create another shipment
              </ButtonLink>
              <Button variant="quiet" size="sm" onClick={() => setCreatedOrderNumber(null)}>
                Dismiss
              </Button>
            </>
          }
        >
          It is pending and already counted on the Overview and in the shipments list.
        </SuccessBanner>
      )}

      {notFound ? (
        <EmptyState
          title="This order doesn't exist"
          description="It may have been removed, or the link is wrong. Find it in the shipments list instead."
          action={<Link to="/shipments">Go to shipments</Link>}
        />
      ) : order.status === 'error' ? (
        <ErrorState title="This order couldn't be loaded" description={order.error?.message ?? ''} onRetry={order.reload} />
      ) : !current ? (
        <div className={styles.grid}>
          <Skeleton label="Loading order" lines={[{ height: '22rem' }]} />
          <Skeleton label="Loading route" lines={[{ height: '22rem' }]} />
        </div>
      ) : (
        <OrderDetails order={current} events={events} />
      )}
    </>
  );
}

function OrderDetails({ order, events }: { order: Order; events: ApiState<OrderEvent[]> }) {
  const courierName = useCourierName();
  // Events of another order may still be on screen for a moment after navigating: only use matching ones.
  const history = events.data?.every((event) => event.orderId === order.id) ? events.data : undefined;
  return (
    <div className={styles.grid}>
      <Card title="Shipment progress" icon={<Route size={18} />} className={styles.timeline}>
        {events.status === 'error' ? (
          <ErrorState
            headingLevel={3}
            title="The shipment history couldn't be loaded"
            description={events.error?.message ?? 'Something went wrong.'}
            onRetry={events.reload}
          />
        ) : history ? (
          <ShipmentTimeline order={order} events={history} />
        ) : (
          <Skeleton label="Loading shipment history" lines={[{ height: '2rem', width: '50%' }, { height: '18rem' }]} />
        )}
      </Card>

      <Card title="Route" subtitle="Schematic" icon={<MapPinned size={18} />} className={styles.route}>
        <RouteSchematic order={order} />
      </Card>

      <Card title="Items" icon={<ReceiptText size={18} />} className={styles.items}>
        <OrderItemsTable items={order.items} totalCents={order.totalCents} />
      </Card>

      <Card title="Customer and delivery" icon={<UserRound size={18} />} className={styles.customer}>
        <dl className={styles.facts}>
          <div>
            <dt>Customer</dt>
            <dd>{order.customerName}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${order.customerEmail}`}>{order.customerEmail}</a>
            </dd>
          </div>
          <div>
            <dt>Delivery address</dt>
            <dd>
              {order.deliveryAddress}
              <br />
              {order.postalCode} {order.destinationCity}
              <br />
              {countryName(order.destinationCountry)}
            </dd>
          </div>
          <div>
            <dt>Parcel weight</dt>
            <dd className="tabular">{formatNumber(order.parcelWeightKg)} kg</dd>
          </div>
          <div>
            <dt>Courier</dt>
            <dd>{order.courierProvider ? courierName(order.courierProvider) : 'Not assigned yet'}</dd>
          </div>
          <div>
            <dt>Tracking number</dt>
            <dd className="tabular">{order.trackingNumber ?? 'Not issued yet'}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
