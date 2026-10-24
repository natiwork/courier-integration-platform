import { Euro } from 'lucide-react';
import type { OverviewStats } from '../../api/types';
import type { ApiState } from '../../hooks/useApi';
import { formatMoney } from '../../lib/format';
import { MiniBars } from '../MiniBars/MiniBars';
import { Skeleton } from '../Skeleton/Skeleton';
import { StatsBoundary } from '../StatsBoundary/StatsBoundary';
import { TrendBadge } from '../TrendBadge/TrendBadge';
import styles from './HeroRevenueCard.module.css';

// The one bold element of the dashboard: paid revenue for the last 30 days on a dark-green gradient.
export function HeroRevenueCard({ stats }: { stats: ApiState<OverviewStats> }) {
  return (
    <section className={styles.hero} aria-labelledby="hero-revenue-title">
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          <Euro size={18} />
        </span>
        <h2 id="hero-revenue-title" className={styles.title}>
          Revenue
        </h2>
        <span className={styles.period}>Last 30 days</span>
      </header>

      <StatsBoundary
        stats={stats}
        errorTitle="Revenue couldn't be loaded"
        skeleton={<Skeleton label="Loading revenue" lines={[{ height: '3.5rem', width: '70%' }, { height: '1rem', width: '50%' }]} />}
      >
        {({ last30Days, today, monthly }) => (
          <>
            <p className={styles.amount}>
              <span className="tabular">{formatMoney(last30Days.revenueCents.current)}</span>
            </p>
            <p className={styles.comparison}>
              <TrendBadge changePercent={last30Days.revenueCents.changePercent} onDark />
              <span>vs {formatMoney(last30Days.revenueCents.previous)} in the previous 30 days</span>
            </p>
            <div className={styles.footer}>
              <p className={styles.today}>
                <strong className="tabular">+{formatMoney(today.revenueCents)}</strong> paid today
              </p>
              <MiniBars values={monthly.map((month) => month.revenueCents)} tone="onDark" />
            </div>
          </>
        )}
      </StatsBoundary>
    </section>
  );
}
