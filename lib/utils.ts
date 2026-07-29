import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(dateString: string | Date): string {
  const date = toDate(dateString)
  if (!date) return '—'

  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** "28 Jul 2026, 11:53 pm" — hover/tooltip me exact time dikhane ke liye. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'

  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * "just now" / "5 min ago" / "3 hours ago" / "2 days ago", aur ek hafte se
 * purani cheezon par actual date. Activity feeds ke liye — wahan raw ISO
 * string ("2026-07-28T19:23:08.225Z") padhne layak nahi hoti.
 */
export function formatRelativeTime(
  value: string | Date | null | undefined
): string {
  const date = toDate(value)
  if (!date) return '—'

  const seconds = Math.round((Date.now() - date.getTime()) / 1000)

  // Clock skew ya future-dated entry
  if (seconds < 0) return formatDate(date)
  if (seconds < 45) return 'just now'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`

  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`

  return formatDate(date)
}
