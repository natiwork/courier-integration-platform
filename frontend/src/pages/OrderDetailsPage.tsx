import { Link, useParams } from 'react-router';
import { ChevronLeft, MapPinned, ReceiptText, Route, UserRound } from 'lucide-react';
import { ApiError } from '../api/client';
import { getOrder } from '../api/orders';
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
import { useApi } from '../hooks/useApi';
import { countryName, formatDateTime, formatNumber } from '../lib/format';
import type { Order } from '../types/order';
import styles from './OrderDetailsPage.module.css';

export function OrderDetailsPage() {
  const { orderId = '' } = useParams();
  const order = useApi((signal) => getOrder(orderId, signal), orderId);
  const notFound = order.error instanceof ApiError && order.error.status === 404;
  const current = order.data?.id === orderId ? order.data : undefined;

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
        <OrderDetails order={current} />
      )}
    </>
  );
}

function OrderDetails({ order }: { order: Order }) {
  return (
    <div className={styles.grid}>
      <Card title="Shipment progress" icon={<Route size={18} />} className={styles.timeline}>
        <ShipmentTimeline order={order} />
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
            <dd>{order.courierProvider ?? 'Not assigned yet'}</dd>
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
