import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  Cable,
  LayoutDashboard,
  Menu,
  Package,
  Search,
  SwatchBook,
  TriangleAlert,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useStats } from '../../context/statsContext';
import { formatLongDate } from '../../lib/format';
import { DemoBadge } from '../DemoBadge/DemoBadge';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import styles from './AppLayout.module.css';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/shipments', label: 'Shipments', icon: Package },
  { to: '/couriers', label: 'Couriers', icon: Truck },
  { to: '/integrations', label: 'Integrations', icon: Cable },
  // The component preview exists only in development builds.
  ...(import.meta.env.DEV ? [{ to: '/styleguide', label: 'Component preview', icon: SwatchBook }] : []),
];

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const previousPathname = useRef(pathname);

  // After in-app navigation, move focus to the new page heading so screen reader users hear
  // which page opened. Not on the first load: there the first Tab must reach "Skip to content".
  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    document.querySelector<HTMLElement>('#main h1')?.focus();
  }, [pathname]);

  // Escape closes the mobile menu and returns focus to the button that opened it.
  useEffect(() => {
    if (!menuOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>

      <div className={styles.sidebar}>
        <div className={styles.brandRow}>
          <NavLink to="/" className={styles.brand} onClick={() => setMenuOpen(false)}>
            <span className={styles.brandMark} aria-hidden="true" />
            <span className={styles.brandName}>LogiFlow</span>
          </NavLink>
          <button
            ref={menuButtonRef}
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
            <span>{menuOpen ? 'Close' : 'Menu'}</span>
          </button>
        </div>

        <nav id="main-nav" aria-label="Main" className={styles.nav} data-open={menuOpen}>
          <ul role="list" className={styles.navList}>
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  title={label}
                  className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon aria-hidden="true" size={20} className={styles.navIcon} />
                  <span className={styles.navLabel}>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className={styles.content}>
        <TopBar />
        {/* tabIndex={-1}: the skip link can move focus here */}
        <main id="main" tabIndex={-1} className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function currentDate(): Date {
  return new Date();
}

function TopBar() {
  const navigate = useNavigate();
  const stats = useStats();
  const [query, setQuery] = useState('');
  // Read once when the layout mounts; the page doesn't need to tick at midnight.
  const [today] = useState(currentDate);
  const attentionCount = stats.data?.needsAttention.total;

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const search = query.trim();
    navigate(search ? `/shipments?search=${encodeURIComponent(search)}` : '/shipments');
  }

  return (
    <header className={styles.topbar}>
      <p className={styles.date}>
        <time dateTime={today.toISOString().slice(0, 10)}>
          <span className={styles.dateLong}>{formatLongDate(today)}</span>
          <span className={styles.dateShort} aria-hidden="true">
            {formatLongDate(today, 'short')}
          </span>
        </time>
      </p>

      <form role="search" className={styles.search} onSubmit={handleSearch}>
        <label htmlFor="global-search" className="visually-hidden">
          Search orders
        </label>
        <Search aria-hidden="true" size={18} className={styles.searchIcon} />
        <input
          id="global-search"
          type="search"
          className={styles.searchInput}
          placeholder="Search orders, customers, cities"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>

      <div className={styles.actions}>
        {stats.data?.demoData && <DemoBadge />}
        {attentionCount !== undefined && (
          <Link to={{ pathname: '/', hash: 'needs-attention' }} className={styles.attention} title="Orders that need attention">
            <TriangleAlert aria-hidden="true" size={18} />
            <span className="tabular">{attentionCount}</span>
            <span className="visually-hidden"> orders need attention</span>
          </Link>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
