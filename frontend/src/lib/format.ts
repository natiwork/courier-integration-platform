// All number, money and date formatting goes through Intl, so the output is consistent everywhere.

const moneyFormat = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const moneyCompactFormat = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const numberFormat = new Intl.NumberFormat('en-IE');
const percentFormat = new Intl.NumberFormat('en-IE', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

// Amounts are integer cents from the API. €1,234.50
export function formatMoney(cents: number): string {
  return moneyFormat.format(cents / 100);
}

// €9K — for chart labels only.
export function formatMoneyCompact(cents: number): string {
  return moneyCompactFormat.format(cents / 100);
}

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

// 0.068 → "6.8%"
export function formatPercent(ratio: number): string {
  return percentFormat.format(ratio);
}

// 4 → "+4.0%", -1.7 → "−1.7%" (a real minus sign, easier to read than a hyphen)
export function formatChange(changePercent: number): string {
  const sign = changePercent > 0 ? '+' : changePercent < 0 ? '−' : '';
  return `${sign}${Math.abs(changePercent).toFixed(1)}%`;
}

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

// "2 hours ago", "yesterday", "5 days ago"
export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 3600],
    ['month', 30 * 24 * 3600],
    ['week', 7 * 24 * 3600],
    ['day', 24 * 3600],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

// "DE" → "Germany"
export function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

// "2026-02" → "Feb" / "F" / "February"; months are UTC so the label never shifts by timezone.
export function monthLabel(month: string, style: 'short' | 'narrow' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat('en-GB', { month: style, timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
}

export function formatLongDate(date: Date, style: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: style,
    day: 'numeric',
    month: style,
    year: style === 'long' ? 'numeric' : undefined,
  }).format(date);
}
