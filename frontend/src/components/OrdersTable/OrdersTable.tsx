import { Link } from 'react-router';
import { countryName, formatDate, formatMoney } from '../../lib/format';
import type { Order } from '../../types/order';
import { PaymentBadge } from '../PaymentBadge/PaymentBadge';
import { StatusBadge } from '../StatusBadge/StatusBadge';
import styles from './OrdersTable.module.css';

interface OrdersTableProps {
  orders: Order[];
  // Read by screen readers as the table's name.
  caption: string;
  // True while newer results are loading: rows stay visible but are dimmed.
  busy?: boolean;
  // The Overview's "Recent orders" hides the date: those orders are all from the last hours.
  showCreated?: boolean;
}

// A real <table> on wide containers; each row becomes a card when the container is narrow.
export function OrdersTable({ orders, caption, busy = false, showCreated = true }: OrdersTableProps) {
  return (
    <div className={styles.wrapper} aria-busy={busy || undefined}>
      <table className={busy ? `${styles.table} ${styles.busy}` : styles.table}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Customer</th>
            <th scope="col">Destination</th>
            <th scope="col">Status</th>
            <th scope="col">Payment</th>
            <th scope="col" className={styles.numeric}>
              Total
            </th>
            {showCreated && (
              <th scope="col" className={styles.numeric}>
                Created
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <th scope="row" className={styles.orderCell}>
                <Link to={`/shipments/${order.id}`} className={`${styles.orderLink} tabular`}>
                  {order.orderNumber}
                </Link>
              </th>
              <td data-label="Customer">{order.customerName}</td>
              <td data-label="Destination">
                {order.destinationCity}, <abbr title={countryName(order.destinationCountry)}>{order.destinationCountry}</abbr>
              </td>
              <td data-label="Status">
                <StatusBadge status={order.status} />
              </td>
              <td data-label="Payment">
                <PaymentBadge status={order.paymentStatus} />
              </td>
              <td data-label="Total" className={`${styles.numeric} ${styles.total} tabular`}>
                {formatMoney(order.totalCents)}
              </td>
              {showCreated && (
                <td data-label="Created" className={`${styles.numeric} ${styles.muted} tabular`}>
                  <time dateTime={order.createdAt}>{formatDate(order.createdAt)}</time>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
