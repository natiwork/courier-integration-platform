import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import styles from './AppLayout.module.css';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', end: true },
  { to: '/shipments', label: 'Shipments' },
  { to: '/couriers', label: 'Couriers' },
  { to: '/integrations', label: 'Integrations' },
];

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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

      <header className={styles.sidebar}>
        <div className={styles.bar}>
          <NavLink to="/" className={styles.brand} onClick={() => setMenuOpen(false)}>
            Courier Integration <span className={styles.brandLine}>Platform</span>
          </NavLink>
          <button
            ref={menuButtonRef}
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? 'Close menu' : 'Menu'}
          </button>
        </div>

        <nav id="main-nav" aria-label="Main" className={styles.nav} data-open={menuOpen}>
          <ul role="list" className={styles.navList}>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? `${styles.navLink} ${styles.active}` : styles.navLink)}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
