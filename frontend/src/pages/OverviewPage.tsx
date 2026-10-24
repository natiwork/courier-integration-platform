import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { Activity, BadgePercent, Gauge, Globe, Package, Plus, RefreshCw, ShoppingBag, TriangleAlert, Undo2, ChartColumn } from 'lucide-react';
import { listOrders } from '../api/orders';
import { Button, ButtonLink } from '../components/Button/Button';
import { ActivityBars } from '../components/ActivityBars/ActivityBars';
import { Card } from '../components/Card/Card';
import { DeliveryGauge } from '../components/DeliveryGauge/DeliveryGauge';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { HeroRevenueCard } from '../components/HeroRevenueCard/HeroRevenueCard';
import { KpiCard, KpiFooter, KpiNote, KpiValue } from '../components/KpiCard/KpiCard';
import { MiniBars } from '../components/MiniBars/MiniBars';
import { MonthlyChart } from '../components/MonthlyChart/MonthlyChart';
import { NeedsAttentionList } from '../components/NeedsAttentionList/NeedsAttentionList';
import { OrdersTable } from '../components/OrdersTable/OrdersTable';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { StatsBoundary } from '../components/StatsBoundary/StatsBoundary';
import { TopDestinations } from '../components/TopDestinations/TopDestinations';
import { TopProducts } from '../components/TopProducts/TopProducts';
import { TrendBadge } from '../components/TrendBadge/TrendBadge';
import { useStats } from '../context/statsContext';
import { useApi } from '../hooks/useApi';
import { formatMoney, formatNumber, formatPercent, formatTime } from '../lib/format';
import styles from './OverviewPage.module.css';

const RECENT_LIMIT = 6;

const kpiSkeleton = (label: string) => (
  <Skeleton label={label} lines={[{ height: '2.25rem', width: '60%' }, { height: '0.9rem', width: '80%' }, { height: '2.25rem' }]} />
);

export function OverviewPage() {
  const stats = useStats();
  const recent = useApi((signal) => listOrders({ limit: RECENT_LIMIT }, signal), `recent-${RECENT_LIMIT}`);
  const { hash } = useLocation();
  const refreshing = stats.status === 'loading' || recent.status === 'loading';

  // "/#needs-attention" (the counter in the top bar) scrolls to the panel once it has rendered.
  useEffect(() => {
    if (hash !== '#needs-attention' || !stats.data) return;
    const panel = document.getElementById('needs-attention');
    panel?.scrollIntoView({ block: 'start' });
    panel?.focus({ preventScroll: true });
  }, [hash, stats.data]);

  function refresh() {
    stats.reload();
    recent.reload();
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          stats.data ? `Orders, revenue and deliveries. Updated at ${formatTime(stats.data.generatedAt)}.` : 'Orders, revenue and deliveries.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={refresh} loading={refreshing}>
              <RefreshCw aria-hidden="true" size={16} /> Refresh
            </Button>
            <ButtonLink to="/shipments/new">
              <Plus aria-hidden="true" size={18} /> New shipment
            </ButtonLink>
          </>
        }
      />

      <div className={styles.kpiRow}>
        <HeroRevenueCard stats={stats} />

        <KpiCard title="Orders in the last 30 days" tone="lime" icon={<Package size={16} />}>
          <StatsBoundary stats={stats} errorTitle="Orders couldn't be loaded" skeleton={kpiSkeleton('Loading orders')}>
            {({ last30Days, monthly }) => (
              <>
                <KpiValue>{formatNumber(last30Days.orders.current)}</KpiValue>
                <KpiNote>
                  <TrendBadge changePercent={last30Days.orders.changePercent} />
                  <span>vs previous 30 days</span>
                </KpiNote>
                <KpiFooter>
                  <MiniBars values={monthly.map((month) => month.orders)} />
                </KpiFooter>
              </>
            )}
          </StatsBoundary>
        </KpiCard>

        <KpiCard title="Average order value" tone="mint" icon={<BadgePercent size={16} />}>
          <StatsBoundary stats={stats} errorTitle="Average order value couldn't be loaded" skeleton={kpiSkeleton('Loading average order value')}>
            {({ last30Days }) =>
              last30Days.averageOrderValueCents.current === 0 ? (
                <KpiNote>No paid orders in the last 30 days.</KpiNote>
              ) : (
                <>
                  <KpiValue>{formatMoney(last30Days.averageOrderValueCents.current)}</KpiValue>
                  <KpiNote>
                    <TrendBadge changePercent={last30Days.averageOrderValueCents.changePercent} />
                    <span>vs previous 30 days</span>
                  </KpiNote>
                  <KpiFooter>
                    <KpiNote>Paid orders, last 30 days</KpiNote>
                  </KpiFooter>
                </>
              )
            }
          </StatsBoundary>
        </KpiCard>

        <KpiCard title="Return rate" tone="sand" icon={<Undo2 size={16} />}>
          <StatsBoundary stats={stats} errorTitle="Return rate couldn't be loaded" skeleton={kpiSkeleton('Loading return rate')}>
            {({ rates, totals }) =>
              rates.returnRate === null ? (
                <KpiNote>No delivered orders yet.</KpiNote>
              ) : (
                <>
                  <KpiValue>{formatPercent(rates.returnRate)}</KpiValue>
                  <KpiNote>
                    {formatNumber(totals.byStatus.RETURNED)} of {formatNumber(totals.byStatus.DELIVERED + totals.byStatus.RETURNED)} delivered orders
                  </KpiNote>
                  <KpiFooter>
                    {/* Delivered and returned side by side: the violet part is the return rate */}
                    <span className={styles.ratioTrack} aria-hidden="true">
                      <span className={styles.ratioDelivered} style={{ width: `${(1 - rates.returnRate) * 100}%` }} />
                      <span className={styles.ratioReturned} style={{ width: `${rates.returnRate * 100}%` }} />
                    </span>
                    <span className={styles.ratioLegend} aria-hidden="true">
                      <span>Kept</span>
                      <span>Returned</span>
                    </span>
                  </KpiFooter>
                </>
              )
            }
          </StatsBoundary>
        </KpiCard>
      </div>

      <div className={styles.grid}>
        <Card title="Revenue and orders by month" icon={<ChartColumn size={18} />} className={styles.chart}>
          <StatsBoundary
            stats={stats}
            errorTitle="The monthly chart couldn't be loaded"
            skeleton={<Skeleton label="Loading monthly chart" lines={[{ height: '2rem', width: '40%' }, { height: '14rem' }]} />}
          >
            {({ monthly }) =>
              monthly.every((month) => month.orders === 0) ? (
                <EmptyState size="compact" headingLevel={3} title="No orders in the last 9 months" description="The chart fills in as orders come in." />
              ) : (
                <MonthlyChart monthly={monthly} />
              )
            }
          </StatsBoundary>
        </Card>

        <Card
          id="needs-attention"
          title="Needs attention"
          icon={<TriangleAlert size={18} />}
          className={styles.attention}
          action={stats.data && <span className={styles.countChip}>{formatNumber(stats.data.needsAttention.total)}</span>}
        >
          <StatsBoundary
            stats={stats}
            errorTitle="The attention list couldn't be loaded"
            skeleton={<Skeleton label="Loading orders that need attention" lines={[{ height: '5rem' }, { height: '5rem' }, { height: '5rem' }]} />}
          >
            {({ needsAttention }) =>
              needsAttention.total === 0 ? (
                <EmptyState size="compact" headingLevel={3} title="Nothing needs attention" description="Failed deliveries, pending refunds and overdue payments will show up here." />
              ) : (
                <NeedsAttentionList items={needsAttention.items} total={needsAttention.total} />
              )
            }
          </StatsBoundary>
        </Card>

        <Card title="Updated today" subtitle="UTC" icon={<Activity size={18} />} className={styles.activity}>
          <StatsBoundary
            stats={stats}
            errorTitle="Today's activity couldn't be loaded"
            skeleton={<Skeleton label="Loading today's activity" lines={[{ height: '2rem', width: '50%' }, { height: '9rem' }]} />}
          >
            {({ today }) =>
              today.orders === 0 && Object.values(today.activity).every((count) => count === 0) ? (
                <EmptyState size="compact" headingLevel={3} title="No activity yet today" description="Orders that are created or change status today will be counted here." />
              ) : (
                <ActivityBars activity={today.activity} createdToday={today.orders} />
              )
            }
          </StatsBoundary>
        </Card>

        <Card title="Delivery performance" subtitle="All finished orders" icon={<Gauge size={18} />} className={styles.gauge}>
          <StatsBoundary
            stats={stats}
            errorTitle="Delivery performance couldn't be loaded"
            skeleton={<Skeleton label="Loading delivery performance" lines={[{ height: '8rem' }, { height: '1rem', width: '70%' }]} />}
          >
            {({ rates, totals }) =>
              rates.deliveryPerformance === null ? (
                <EmptyState size="compact" headingLevel={3} title="No finished deliveries yet" description="The share of delivered orders appears once orders are delivered, failed or returned." />
              ) : (
                <DeliveryGauge
                  ratio={rates.deliveryPerformance}
                  delivered={totals.byStatus.DELIVERED}
                  failed={totals.byStatus.FAILED}
                  returned={totals.byStatus.RETURNED}
                />
              )
            }
          </StatsBoundary>
        </Card>

        <Card
          title="Recent orders"
          icon={<Package size={18} />}
          className={styles.recent}
          action={<Link to="/shipments">View all shipments</Link>}
        >
          {recent.status === 'error' ? (
            <ErrorState headingLevel={3} title="Recent orders couldn't be loaded" description={recent.error?.message ?? ''} onRetry={recent.reload} />
          ) : !recent.data ? (
            <Skeleton label="Loading recent orders" lines={Array.from({ length: RECENT_LIMIT }, () => ({ height: '2.25rem' }))} />
          ) : recent.data.length === 0 ? (
            <EmptyState size="compact" headingLevel={3} title="No orders yet" description="New orders will appear here first." />
          ) : (
            <OrdersTable orders={recent.data} caption="Most recent orders" busy={recent.status === 'loading'} showCreated={false} />
          )}
        </Card>

        <Card title="Top destinations" subtitle="By orders" icon={<Globe size={18} />} className={styles.destinations}>
          <StatsBoundary
            stats={stats}
            errorTitle="Top destinations couldn't be loaded"
            skeleton={<Skeleton label="Loading top destinations" lines={Array.from({ length: 5 }, () => ({ height: '2.5rem' }))} />}
          >
            {({ topDestinations }) =>
              topDestinations.length === 0 ? (
                <EmptyState size="compact" headingLevel={3} title="No destinations yet" description="Countries appear here once orders are placed." />
              ) : (
                <TopDestinations destinations={topDestinations} />
              )
            }
          </StatsBoundary>
        </Card>

        <Card title="Top products" subtitle="Units sold in paid orders" icon={<ShoppingBag size={18} />} className={styles.products}>
          <StatsBoundary
            stats={stats}
            errorTitle="Top products couldn't be loaded"
            skeleton={<Skeleton label="Loading top products" lines={[{ height: '9rem' }]} />}
          >
            {({ topProducts }) =>
              topProducts.length === 0 ? (
                <EmptyState size="compact" headingLevel={3} title="No products sold yet" description="Best sellers appear here once orders are paid." />
              ) : (
                <TopProducts products={topProducts} />
              )
            }
          </StatsBoundary>
        </Card>
      </div>
    </>
  );
}
