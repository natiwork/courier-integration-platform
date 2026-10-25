import { formatMoney, formatNumber } from '../../lib/format';
import type { OrderItem } from '../../types/order';
import styles from './OrderItemsTable.module.css';

interface OrderItemsTableProps {
  items: OrderItem[];
  // The order total from the API (computed on the server, never re-added here).
  totalCents: number;
}

export function OrderItemsTable({ items, totalCents }: OrderItemsTableProps) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <caption className="visually-hidden">Items in this order</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" className={styles.numeric}>
              Qty
            </th>
            <th scope="col" className={`${styles.numeric} ${styles.unitPrice}`}>
              Unit price
            </th>
            <th scope="col" className={styles.numeric}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.sku}>
              <th scope="row" className={styles.item}>
                <span className={styles.name}>{item.name}</span>
                <span className={styles.sku}>{item.sku}</span>
                {/* Shown instead of the unit price column when the card is narrow */}
                <span className={`${styles.perUnit} tabular`}>
                  {formatNumber(item.quantity)} × {formatMoney(item.unitPriceCents)}
                </span>
              </th>
              <td className={`${styles.numeric} tabular`}>{formatNumber(item.quantity)}</td>
              <td className={`${styles.numeric} ${styles.unitPrice} tabular`}>{formatMoney(item.unitPriceCents)}</td>
              <td className={`${styles.numeric} ${styles.lineTotal} tabular`}>{formatMoney(item.quantity * item.unitPriceCents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            {/* Two columns + an empty unit-price cell, so the row still lines up when that column is hidden */}
            <th scope="row" colSpan={2} className={styles.footLabel}>
              Order total
            </th>
            <td className={styles.unitPrice} aria-hidden="true" />
            <td className={`${styles.numeric} ${styles.grandTotal} tabular`}>{formatMoney(totalCents)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
