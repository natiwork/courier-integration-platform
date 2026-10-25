import { ReceiptText } from 'lucide-react';
import { ApiError } from '../../api/client';
import { formatMoney, formatNumber } from '../../lib/format';
import { parseEuroToCents } from '../../lib/money';
import { lineTotalCents, type ItemDraft } from '../../lib/orderFormValidation';
import type { PaymentStatus } from '../../types/order';
import { Button } from '../Button/Button';
import { ErrorState } from '../ErrorState/ErrorState';
import styles from './OrderSummaryCard.module.css';

interface OrderSummaryCardProps {
  items: ItemDraft[];
  paymentStatus: PaymentStatus;
  onPaymentStatusChange: (status: PaymentStatus) => void;
  submitting: boolean;
  submitError: Error | null;
}

const PAYMENT_OPTIONS: { value: PaymentStatus; label: string; hint: string }[] = [
  { value: 'UNPAID', label: 'Unpaid', hint: 'The customer pays later' },
  { value: 'PAID', label: 'Paid', hint: 'Payment already received' },
];

function unitCents(item: ItemDraft): number {
  const price = parseEuroToCents(item.unitPrice);
  return price.ok ? price.cents : 0;
}

// The "receipt" next to the form: live line totals, an estimated total and the submit button.
// It sits inside the <form>, so the button submits it.
export function OrderSummaryCard({ items, paymentStatus, onPaymentStatusChange, submitting, submitError }: OrderSummaryCardProps) {
  const lines = items.map((item) => ({ item, total: lineTotalCents(item) }));
  const counted = lines.filter((line) => line.total !== null);
  const totalCents = counted.reduce((sum, line) => sum + (line.total ?? 0), 0);
  const units = counted.reduce((sum, line) => sum + Number(line.item.quantity), 0);
  const incomplete = counted.length < lines.length;

  return (
    <section className={styles.summary} aria-labelledby="order-summary-title">
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          <ReceiptText size={18} />
        </span>
        <h2 id="order-summary-title" className={styles.title}>
          Order summary
        </h2>
      </header>

      <ul role="list" className={styles.lines}>
        {lines.map(({ item, total }, index) => (
          <li key={item.key} className={styles.line}>
            <span className={styles.lineName}>{item.name.trim() || `Item ${index + 1}`}</span>
            <span className={`${styles.lineDetail} tabular`}>
              {total === null ? 'Quantity or price missing' : `${item.quantity.trim()} × ${formatMoney(unitCents(item))}`}
            </span>
            <span className={`${styles.lineTotal} tabular`}>{total === null ? '—' : formatMoney(total)}</span>
          </li>
        ))}
      </ul>

      <div className={styles.tear} aria-hidden="true" />

      <div className={styles.total}>
        <p className={styles.totalLabel}>
          Total <span className={styles.estimate}>(estimate)</span>
          <span className={styles.units}>
            {formatNumber(counted.length)} {counted.length === 1 ? 'item' : 'items'}, {formatNumber(units)} {units === 1 ? 'unit' : 'units'}
          </span>
        </p>
        <p className={`${styles.totalValue} tabular`}>{formatMoney(totalCents)}</p>
      </div>
      <p className={styles.note}>
        The server calculates the final total when the shipment is created.
        {incomplete && ' Items without a valid quantity and price aren’t counted yet.'}
      </p>

      <fieldset className={styles.payment}>
        <legend className={styles.paymentLegend}>Payment</legend>
        <div className={styles.paymentOptions}>
          {PAYMENT_OPTIONS.map((option) => (
            <label key={option.value} className={styles.paymentOption}>
              <input
                type="radio"
                name="paymentStatus"
                value={option.value}
                checked={paymentStatus === option.value}
                onChange={() => onPaymentStatusChange(option.value)}
              />
              <span>
                <span className={styles.paymentLabel}>{option.label}</span>
                <span className={styles.paymentHint}>{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" block loading={submitting}>
        Create shipment
      </Button>

      {submitError && (
        <ErrorState
          headingLevel={3}
          title="The shipment wasn’t created"
          description={`${submitError.message} Your entries are kept.${
            submitError instanceof ApiError && submitError.requestId ? ` Request ID: ${submitError.requestId}` : ''
          }`}
        />
      )}
    </section>
  );
}
