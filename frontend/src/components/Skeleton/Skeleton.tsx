import styles from './Skeleton.module.css';

interface SkeletonProps {
  // Each entry is one placeholder bar: a CSS height and an optional width.
  lines: { height: string; width?: string }[];
  // What is loading, for screen readers.
  label: string;
}

// Grey placeholders in the shape of the content that is loading.
export function Skeleton({ lines, label }: SkeletonProps) {
  return (
    <div className={styles.skeleton} role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {lines.map((line, index) => (
        <span key={index} className={styles.bar} style={{ height: line.height, width: line.width ?? '100%' }} aria-hidden="true" />
      ))}
    </div>
  );
}
