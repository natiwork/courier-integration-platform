import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { createOrder } from '../../api/orders';
import type { OrderFormOptions } from '../../api/meta';
import { useStats } from '../../context/statsContext';
import { fieldAria } from '../../lib/fieldAria';
import { countryName } from '../../lib/format';
import {
  fieldId,
  mapServerErrors,
  orderedErrorPaths,
  validateOrderDraft,
  type FieldErrors,
  type ItemDraft,
  type OrderDraft,
} from '../../lib/orderFormValidation';
import type { PaymentStatus } from '../../types/order';
import { FormField } from '../FormField/FormField';
import { OrderItemsEditor, type ItemField } from '../OrderItemsEditor/OrderItemsEditor';
import { OrderSummaryCard } from '../OrderSummaryCard/OrderSummaryCard';
import styles from './CreateOrderForm.module.css';

type TextField = Exclude<keyof OrderDraft, 'items' | 'paymentStatus'>;

let nextItemKey = 1;
const emptyItem = (): ItemDraft => ({ key: nextItemKey++, sku: '', name: '', quantity: '1', unitPrice: '' });

const emptyDraft = (): OrderDraft => ({
  customerName: '',
  customerEmail: '',
  deliveryAddress: '',
  destinationCity: '',
  postalCode: '',
  destinationCountry: '',
  parcelWeightKg: '',
  paymentStatus: 'UNPAID',
  items: [emptyItem()],
});

// Controlled form: every input's value lives in `draft`, so validation, the live total and the
// payload all read the same state. Validation runs on submit; fixing a field clears its message.
export function CreateOrderForm({ options }: { options: OrderFormOptions }) {
  const navigate = useNavigate();
  const stats = useStats();
  const { limits } = options;

  const [draft, setDraft] = useState<OrderDraft>(emptyDraft);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [summaryErrors, setSummaryErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<Error | null>(null);
  // Bumped after a failed submit: the effect below moves focus to the error summary once it has rendered.
  const [summaryFocusTick, setSummaryFocusTick] = useState(0);
  // A field to focus after the item list changed (new row, removed row).
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);

  const countries = [...options.countries].sort((a, b) => countryName(a).localeCompare(countryName(b)));

  useEffect(() => {
    if (summaryFocusTick > 0) summaryRef.current?.focus();
  }, [summaryFocusTick]);

  useEffect(() => {
    if (focusPath) document.getElementById(fieldId(focusPath))?.focus();
  }, [focusPath]);

  function clearError(path: string) {
    if (!errors[path]) return;
    setErrors((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });
  }

  function setField(field: TextField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    clearError(field);
  }

  function setItemField(index: number, field: ItemField, value: string) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));
    clearError(`items.${index}.${field === 'unitPrice' ? 'unitPriceCents' : field}`);
  }

  // Row indexes shift when the list changes, so per-item messages would point at the wrong row:
  // drop them; they come back on the next submit if still relevant.
  function withoutItemErrors(current: FieldErrors): FieldErrors {
    return Object.fromEntries(Object.entries(current).filter(([path]) => !path.startsWith('items')));
  }

  function addItem() {
    const index = draft.items.length;
    setDraft((current) => ({ ...current, items: [...current.items, emptyItem()] }));
    setErrors(withoutItemErrors);
    setFocusPath(`items.${index}.sku`);
  }

  function removeItem(index: number) {
    setDraft((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }));
    setErrors(withoutItemErrors);
    // Focus the row that moved into this place, or the new last row.
    setFocusPath(`items.${Math.min(index, draft.items.length - 2)}.sku`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Checked and set synchronously, before any await: a double click fires two submit events in
    // the same tick, before React has re-rendered the disabled button. The ref stops the second one.
    if (submittingRef.current) return;
    setSubmitError(null);

    const result = validateOrderDraft(draft, limits, options.countries);
    if (!result.ok) {
      setErrors(result.errors);
      setSummaryErrors([]);
      setSummaryFocusTick((tick) => tick + 1);
      return;
    }

    submittingRef.current = true;
    setErrors({});
    setSummaryErrors([]);
    setSubmitting(true);
    try {
      const order = await createOrder(result.payload);
      stats.reload(); // the dashboard numbers now include this order
      navigate(`/shipments/${order.id}`, { state: { createdOrderNumber: order.orderNumber } });
    } catch (error) {
      submittingRef.current = false;
      setSubmitting(false);
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR' && error.details.length > 0) {
        // The server is the authority: show its messages next to the same fields as client errors.
        const { fieldErrors, otherErrors } = mapServerErrors(error.details, draft.items.length);
        setErrors(fieldErrors);
        setSummaryErrors(otherErrors);
        setSummaryFocusTick((tick) => tick + 1);
      } else {
        setSubmitError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  const errorPaths = orderedErrorPaths(errors, draft.items.length);
  const problemCount = errorPaths.length + summaryErrors.length;

  const field = (name: TextField, label: string, props: Record<string, unknown> = {}, hint?: string) => (
    <FormField id={fieldId(name)} label={label} error={errors[name]} hint={hint}>
      <input
        {...fieldAria(fieldId(name), errors[name], hint)}
        value={draft[name]}
        onChange={(event) => setField(name, event.target.value)}
        {...props}
      />
    </FormField>
  );

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-describedby="form-intro">
      {problemCount > 0 && (
        <div ref={summaryRef} className={styles.errorSummary} tabIndex={-1} aria-labelledby="error-summary-title">
          <h2 id="error-summary-title" className={styles.errorSummaryTitle}>
            Fix {problemCount} {problemCount === 1 ? 'problem' : 'problems'} to create the shipment
          </h2>
          <ul className={styles.errorList}>
            {errorPaths.map((path) => (
              <li key={path}>
                <a
                  href={`#${fieldId(path)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(fieldId(path))?.focus();
                  }}
                >
                  {errors[path]}
                </a>
              </li>
            ))}
            {summaryErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.section} aria-labelledby="section-customer">
            <h2 id="section-customer" className={styles.sectionTitle}>
              <span className={styles.step} aria-hidden="true">1</span> Customer
            </h2>
            <div className={styles.grid2}>
              {field('customerName', 'Full name', { autoComplete: 'name' })}
              {field('customerEmail', 'Email', { type: 'email', autoComplete: 'email', inputMode: 'email', spellCheck: false })}
            </div>
          </section>

          <section className={styles.section} aria-labelledby="section-delivery">
            <h2 id="section-delivery" className={styles.sectionTitle}>
              <span className={styles.step} aria-hidden="true">2</span> Delivery
            </h2>
            <div className={styles.grid1}>{field('deliveryAddress', 'Street address', { autoComplete: 'street-address' })}</div>
            <div className={styles.grid3}>
              {field('destinationCity', 'City', { autoComplete: 'address-level2' })}
              {field('postalCode', 'Postal code', { autoComplete: 'postal-code', spellCheck: false })}
              <FormField id={fieldId('destinationCountry')} label="Country" error={errors.destinationCountry}>
                <select
                  {...fieldAria(fieldId('destinationCountry'), errors.destinationCountry)}
                  value={draft.destinationCountry}
                  onChange={(event) => setField('destinationCountry', event.target.value)}
                  autoComplete="country"
                >
                  <option value="">Choose a country</option>
                  {countries.map((code) => (
                    <option key={code} value={code}>
                      {countryName(code)}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className={styles.grid3}>
              {field(
                'parcelWeightKg',
                'Parcel weight (kg)',
                { inputMode: 'decimal', placeholder: 'e.g. 1.5' },
                `Up to ${limits.parcelWeightKgMax} kg`,
              )}
            </div>
          </section>

          <section className={styles.section} aria-labelledby="section-items">
            <h2 id="section-items" className={styles.sectionTitle}>
              <span className={styles.step} aria-hidden="true">3</span> Items
            </h2>
            <OrderItemsEditor
              items={draft.items}
              errors={errors}
              limits={limits}
              onChange={setItemField}
              onAdd={addItem}
              onRemove={removeItem}
            />
          </section>
        </div>

        <aside className={styles.aside} aria-label="Order summary and submit">
          <OrderSummaryCard
            items={draft.items}
            paymentStatus={draft.paymentStatus}
            onPaymentStatusChange={(status: PaymentStatus) => setDraft((current) => ({ ...current, paymentStatus: status }))}
            submitting={submitting}
            submitError={submitError}
          />
        </aside>
      </div>
    </form>
  );
}
