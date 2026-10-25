import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import styles from './FormField.module.css';

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  // Extra class for the label, e.g. to hide it visually in table-like rows (it stays readable).
  labelClassName?: string;
  className?: string;
  // The control itself; spread fieldAria(id, error, hint) from lib/fieldAria onto it.
  children: ReactNode;
}

// Label above, control, then hint and error below. The error is announced with the field on focus.
export function FormField({ id, label, error, hint, labelClassName, className, children }: FormFieldProps) {
  return (
    <div className={[styles.field, error && styles.invalid, className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={[styles.label, labelClassName].filter(Boolean).join(' ')}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          <CircleAlert aria-hidden="true" size={14} />
          {error}
        </p>
      )}
    </div>
  );
}
