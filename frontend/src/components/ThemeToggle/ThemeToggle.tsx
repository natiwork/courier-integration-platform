import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import styles from './ThemeToggle.module.css';

// A toggle button: the label stays the same and aria-pressed says whether dark theme is on.
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={isDark}
      onClick={toggleTheme}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {isDark ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
      <span className="visually-hidden">Dark theme</span>
    </button>
  );
}
