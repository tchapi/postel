import type { Addr } from '../types'

const DAY = 86_400_000

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** List date: 14:32 · Yesterday · Tue · Oct 17 · 17/10/2025 */
export function relativeDate(iso: string, locale: string, now = new Date()): string {
  const d = new Date(iso)
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY)
  if (days <= 0)
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d)
  if (days === 1) {
    const s = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-1, 'day')
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  if (days < 7) return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d)
  if (d.getFullYear() === now.getFullYear())
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d)
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(d)
}

/** Tooltip date: Friday 23 October 2026 at 09:47 */
export function absoluteDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

/** "12 sec. ago" style, for the draft hint. */
export function timeAgo(from: number, locale: string, now = Date.now()): string {
  const secs = Math.max(0, Math.round((now - from) / 1000))
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
  if (secs < 60) return rtf.format(-secs, 'second')
  const mins = Math.round(secs / 60)
  if (mins < 60) return rtf.format(-mins, 'minute')
  return rtf.format(-Math.round(mins / 60), 'hour')
}

export function formatSize(bytes: number, locale: string): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: units[i],
    unitDisplay: 'short',
    maximumFractionDigits: value < 10 && i > 0 ? 1 : 0,
  }).format(value)
}

export function displayName(a: Addr): string {
  return a.name?.trim() || a.email
}

export function initials(a: Addr): string {
  const source = a.name?.trim() || a.email.split('@')[0] || '?'
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  const letters =
    parts.length > 1
      ? (parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')
      : source.slice(0, 2)
  return letters.toUpperCase()
}

export function formatAddrList(list: Addr[]): string {
  return list.map(displayName).join(', ')
}
