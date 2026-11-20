const DAY_MS = 86_400_000

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** "today", "yesterday", "3 days ago", then a short date. */
export function formatWhen(value: string, locale: string) {
  const then = new Date(value)
  const now = new Date()
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS)
  if (days >= 0 && days < 7) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day')
  const options: Intl.DateTimeFormatOptions = then.getFullYear() === now.getFullYear()
    ? { month: 'short', day: 'numeric' }
    : { year: 'numeric', month: 'short', day: 'numeric' }
  return new Intl.DateTimeFormat(locale, options).format(then)
}

export function formatClock(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
