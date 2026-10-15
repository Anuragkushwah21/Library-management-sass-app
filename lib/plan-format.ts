// lib/plan-format.ts — shared by the home page, lock screen and admin pages

export function formatPrice(price: number, currency = 'INR'): string {
  if (price === 0) return 'Free';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: price % 1 === 0 ? 0 : 2,
    }).format(price);
  } catch {
    // Unknown currency code typed by the admin
    return `${currency} ${price}`;
  }
}

export function formatDuration(days: number): string {
  if (days === 30) return 'month';
  if (days === 365) return 'year';
  if (days % 365 === 0) return `${days / 365} years`;
  if (days % 30 === 0) return `${days / 30} months`;
  return days === 1 ? 'day' : `${days} days`;
}

export function daysLeft(until: string | Date): number {
  const ms = new Date(until).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
