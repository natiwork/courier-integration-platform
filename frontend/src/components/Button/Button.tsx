import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
type Size = 'md' | 'sm';

interface StyleProps {
  variant?: Variant;
  size?: Size;
  // Stretch to the full width of the container.
  block?: boolean;
}

function buttonClassName({ variant = 'primary', size = 'md', block = false }: StyleProps, extra?: string): string {
  return [styles.button, styles[variant], styles[size], block && styles.block, extra].filter(Boolean).join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, StyleProps {
  // While true the button is disabled, so a request cannot be sent twice.
  loading?: boolean;
}

export function Button({ variant, size, block, loading = false, disabled, type = 'button', className, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={buttonClassName({ variant, size, block }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
    >
      {/* The label stays in place (and readable for screen readers) so the width does not jump */}
      <span className={styles.label}>{children}</span>
      {loading && <span className={styles.spinner} aria-hidden="true" />}
    </button>
  );
}

type ButtonLinkProps = LinkProps & StyleProps;

// A navigation link that looks like a button. Use it when the action opens another page.
export function ButtonLink({ variant, size, block, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link {...rest} className={buttonClassName({ variant, size, block }, className as string | undefined)}>
      <span className={styles.label}>{children}</span>
    </Link>
  );
}
