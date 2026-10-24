import styles from './LoadingState.module.css';

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = 'Loading…' }: LoadingStateProps) {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <p className={styles.label}>{label}</p>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.bar} />
      </div>
    </div>
  );
}
