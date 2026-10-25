import { Plus, X } from 'lucide-react';
import type { OrderLimits } from '../../api/meta';
import { fieldAria } from '../../lib/fieldAria';
import { formatMoney } from '../../lib/format';
import { fieldId, itemPath, lineTotalCents, type FieldErrors, type ItemDraft } from '../../lib/orderFormValidation';
import { Button } from '../Button/Button';
import { FormField } from '../FormField/FormField';
import styles from './OrderItemsEditor.module.css';

export type ItemField = 'sku' | 'name' | 'quantity' | 'unitPrice';

interface OrderItemsEditorProps {
  items: ItemDraft[];
  errors: FieldErrors;
  limits: OrderLimits;
  onChange: (index: number, field: ItemField, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

// Item rows: a table-like grid on wide cards, one small card per item on narrow ones (container query).
// Each row is a <fieldset> with a hidden "Item 2" legend, so screen readers know which item a field belongs to.
export function OrderItemsEditor({ items, errors, limits, onChange, onAdd, onRemove }: OrderItemsEditorProps) {
  const listError = errors.items;
  const atLimit = items.length >= limits.itemsMax;

  return (
    <div className={styles.editor}>
      <div className={styles.header} aria-hidden="true">
        <span>SKU</span>
        <span>Item name</span>
        <span className={styles.numeric}>Qty</span>
        <span className={styles.numeric}>Unit price</span>
        <span className={styles.numeric}>Line total</span>
        <span />
      </div>

      <ol className={styles.rows}>
        {items.map((item, index) => {
          const number = index + 1;
          const lineTotal = lineTotalCents(item);
          const paths = {
            sku: itemPath(index, 'sku'),
            name: itemPath(index, 'name'),
            quantity: itemPath(index, 'quantity'),
            unitPrice: itemPath(index, 'unitPriceCents'),
          };
          return (
            <li key={item.key}>
              <fieldset className={styles.row}>
                <legend className="visually-hidden">Item {number}</legend>
                <FormField id={fieldId(paths.sku)} label="SKU" error={errors[paths.sku]} labelClassName={styles.cellLabel}>
                  <input
                    {...fieldAria(fieldId(paths.sku), errors[paths.sku])}
                    value={item.sku}
                    onChange={(event) => onChange(index, 'sku', event.target.value)}
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder="e.g. KIT-POUR-01"
                  />
                </FormField>
                <FormField id={fieldId(paths.name)} label="Item name" error={errors[paths.name]} labelClassName={styles.cellLabel}>
                  <input
                    {...fieldAria(fieldId(paths.name), errors[paths.name])}
                    value={item.name}
                    onChange={(event) => onChange(index, 'name', event.target.value)}
                  />
                </FormField>
                <FormField id={fieldId(paths.quantity)} label="Quantity" error={errors[paths.quantity]} labelClassName={styles.cellLabel}>
                  <input
                    {...fieldAria(fieldId(paths.quantity), errors[paths.quantity])}
                    className={styles.numericInput}
                    value={item.quantity}
                    onChange={(event) => onChange(index, 'quantity', event.target.value)}
                    inputMode="numeric"
                  />
                </FormField>
                <FormField id={fieldId(paths.unitPrice)} label="Unit price (€)" error={errors[paths.unitPrice]} labelClassName={styles.cellLabel}>
                  <input
                    {...fieldAria(fieldId(paths.unitPrice), errors[paths.unitPrice])}
                    className={styles.numericInput}
                    value={item.unitPrice}
                    onChange={(event) => onChange(index, 'unitPrice', event.target.value)}
                    inputMode="decimal"
                    placeholder="e.g. 12.50"
                  />
                </FormField>
                <p className={styles.line}>
                  <span className={styles.cellLabel}>Line total</span>
                  <output className="tabular" aria-label={`Line total for item ${number}`}>
                    {lineTotal === null ? '—' : formatMoney(lineTotal)}
                  </output>
                </p>
                <div className={styles.remove}>
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => onRemove(index)}
                    disabled={items.length === 1}
                    title={items.length === 1 ? 'An order needs at least one item' : `Remove item ${number}`}
                  >
                    <X aria-hidden="true" size={18} />
                    <span className="visually-hidden">Remove item {number}</span>
                  </Button>
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>

      <div className={styles.footer}>
        {/* id="field-items": list-level errors (e.g. too many items) point here */}
        <Button
          id={fieldId('items')}
          variant="secondary"
          onClick={onAdd}
          disabled={atLimit}
          aria-describedby={[listError && `${fieldId('items')}-error`, atLimit && 'items-limit'].filter(Boolean).join(' ') || undefined}
        >
          <Plus aria-hidden="true" size={18} /> Add item
        </Button>
        {atLimit && (
          <p id="items-limit" className={styles.note}>
            An order can have at most {limits.itemsMax} items.
          </p>
        )}
        {listError && (
          <p id={`${fieldId('items')}-error`} className={styles.listError}>
            {listError}
          </p>
        )}
      </div>
    </div>
  );
}
