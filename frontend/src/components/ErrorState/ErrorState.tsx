import { Button } from '../Button/Button';
import styles from './ErrorState.module.css';

interface ErrorStateProps {
  title: string;
  // Say what to do next, not just that something failed.
  description: string;
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
  headingLevel?: 2 | 3;
}

export function ErrorState({
  title,
  description,
  onRetry,
  retrying = false,
  retryLabel = 'Try again',
  headingLevel = 2,
}: ErrorStateProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={styles.error} role="alert">
      <Heading className={styles.title}>{title}</Heading>
      <p className={styles.description}>{description}</p>
      {onRetry && (
        <div className={styles.action}>
          <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying}>
            {retryLabel}
          </Button>
        </div>
      )}
    </section>
  );
}
