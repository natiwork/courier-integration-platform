import type { OverviewStats } from '../../api/types';
import { formatMoney, formatNumber } from '../../lib/format';
import styles from './TopProducts.module.css';

// Best sellers by units in paid orders. Ranked, so the numbers really are a sequence.
export function TopProducts({ products }: { products: OverviewStats['topProducts'] }) {
  return (
    <ol className={styles.grid}>
      {products.map((product, index) => (
        <li key={product.sku} className={styles.tile}>
          <span className={styles.rank} aria-hidden="true">
            {index + 1}
          </span>
          <p className={styles.name}>{product.name}</p>
          <p className={styles.sku}>{product.sku}</p>
          <p className={`${styles.revenue} tabular`}>{formatMoney(product.revenueCents)}</p>
          <p className={`${styles.sold} tabular`}>{formatNumber(product.quantity)} sold</p>
        </li>
      ))}
    </ol>
  );
}
