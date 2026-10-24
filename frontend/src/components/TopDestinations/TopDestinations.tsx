import type { OverviewStats } from '../../api/types';
import { countryName, formatMoney, formatNumber } from '../../lib/format';
import styles from './TopDestinations.module.css';

// Ranked countries with a bar for the share of orders. We have no coordinates, so no map:
// dots on a map would be invented data.
export function TopDestinations({ destinations }: { destinations: OverviewStats['topDestinations'] }) {
  const max = Math.max(...destinations.map((destination) => destination.orders), 1);
  return (
    <ol className={styles.list}>
      {destinations.map((destination) => (
        <li key={destination.country} className={styles.row}>
          <span className={styles.code} aria-hidden="true">
            {destination.country}
          </span>
          <span className={styles.body}>
            <span className={styles.line}>
              <span className={styles.name}>{countryName(destination.country)}</span>
              <span className={`${styles.orders} tabular`}>{formatNumber(destination.orders)} orders</span>
            </span>
            <span className={styles.track} aria-hidden="true">
              <span className={styles.bar} style={{ width: `${(destination.orders / max) * 100}%` }} />
            </span>
            <span className={`${styles.revenue} tabular`}>{formatMoney(destination.revenueCents)} paid revenue</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
