import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Package, Plus, Search, X } from 'lucide-react';
import { listOrders } from '../api/orders';
import { Button, ButtonLink } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { OrdersTable } from '../components/OrdersTable/OrdersTable';
import { PageHeader } from '../components/PageHeader/PageHeader';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useStats } from '../context/statsContext';
import { useApi } from '../hooks/useApi';
import { formatNumber } from '../lib/format';
import { STATUS_LABELS } from '../lib/labels';
import { ORDER_STATUSES, type OrderStatus } from '../types/order';
import styles from './ShipmentsPage.module.css';

// The API returns at most 100 rows; pagination comes later.
const PAGE_LIMIT = 100;
const SEARCH_DELAY_MS = 300;

function isOrderStatus(value: string | null): value is OrderStatus {
  return value !== null && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function ShipmentsPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const statusParam = params.get('status');
  const status = isOrderStatus(statusParam) ? statusParam : undefined;
  const stats = useStats();

  // What the user is typing. The URL (and the request) follow after a short pause.
  const [draft, setDraft] = useState(search);
  // If the URL changes from outside (the search in the top bar, back/forward), adopt it.
  const [syncedSearch, setSyncedSearch] = useState(search);
  if (search !== syncedSearch) {
    setSyncedSearch(search);
    setDraft(search);
  }

  useEffect(() => {
    if (draft === search) return;
    const timer = setTimeout(() => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (draft.trim()) next.set('search', draft);
          else next.delete('search');
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, search, setParams]);

  const query = { search: search.trim() || undefined, status, limit: PAGE_LIMIT };
  const orders = useApi((signal) => listOrders(query, signal), JSON.stringify(query));
  const hasFilters = Boolean(query.search || status);

  function changeStatus(value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set('status', value);
      else next.delete('status');
      return next;
    });
  }

  function clearFilters() {
    setDraft('');
    setParams(new URLSearchParams());
  }

  return (
    <>
      <PageHeader
        title="Shipments"
        description="Search by order number, customer or city, and filter by status."
        actions={
          <ButtonLink to="/shipments/new">
            <Plus aria-hidden="true" size={18} /> New shipment
          </ButtonLink>
        }
      />

      <Card title="Orders" icon={<Package size={18} />}>
        <form className={styles.filters} role="search" onSubmit={(event) => event.preventDefault()}>
          <div className={styles.field}>
            <label htmlFor="orders-search" className={styles.label}>
              Search
            </label>
            <span className={styles.inputWrap}>
              <Search aria-hidden="true" size={18} className={styles.inputIcon} />
              <input
                id="orders-search"
                type="search"
                className={styles.input}
                placeholder="ORD-1042, Lena, Berlin…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </span>
          </div>

          <div className={styles.field}>
            <label htmlFor="orders-status" className={styles.label}>
              Status
            </label>
            <select id="orders-status" className={styles.select} value={status ?? ''} onChange={(event) => changeStatus(event.target.value)}>
              <option value="">All statuses</option>
              {ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                  {stats.data ? ` (${formatNumber(stats.data.totals.byStatus[value])})` : ''}
                </option>
              ))}
            </select>
          </div>

          {hasFilters && (
            <Button variant="quiet" size="sm" onClick={clearFilters} className={styles.clear}>
              <X aria-hidden="true" size={16} /> Clear filters
            </Button>
          )}
        </form>

        {/* Announced to screen readers when the result changes */}
        <p className={styles.summary} aria-live="polite">
          {orders.status === 'success' && orders.data && summaryText(orders.data.length, hasFilters)}
        </p>

        {orders.status === 'error' ? (
          <ErrorState headingLevel={3} title="Orders couldn't be loaded" description={orders.error?.message ?? ''} onRetry={orders.reload} />
        ) : !orders.data ? (
          <Skeleton label="Loading orders" lines={Array.from({ length: 8 }, () => ({ height: '2.5rem' }))} />
        ) : orders.data.length === 0 ? (
          hasFilters ? (
            <EmptyState
              size="compact"
              headingLevel={3}
              title="No orders match these filters"
              description={describeFilters(query.search, status)}
              action={
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState size="compact" headingLevel={3} title="No orders yet" description="Orders appear here as soon as they are created." />
          )
        ) : (
          <OrdersTable orders={orders.data} caption="Orders" busy={orders.status === 'loading'} />
        )}
      </Card>
    </>
  );
}

function summaryText(count: number, hasFilters: boolean): string {
  if (count >= PAGE_LIMIT) {
    return `Showing the ${PAGE_LIMIT} newest ${hasFilters ? 'matching ' : ''}orders. Narrow the search to find older ones.`;
  }
  return `${formatNumber(count)} ${count === 1 ? 'order' : 'orders'}${hasFilters ? ' match' : ''}`;
}

function describeFilters(search: string | undefined, status: OrderStatus | undefined): string {
  const parts = [search && `matching “${search}”`, status && `with status ${STATUS_LABELS[status]}`].filter(Boolean);
  return `There are no orders ${parts.join(' ')}. Try a different search or status.`;
}
