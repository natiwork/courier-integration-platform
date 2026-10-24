import styles from './DemoBadge.module.css';

// Shown whenever the backend reports that its orders come from the demo seed.
export function DemoBadge() {
  return (
    <span className={styles.badge} title="Orders are generated demo data, not real customers">
      Demo data
    </span>
  );
}
