const LISBON = 'Europe/Lisbon'

export function fmtLisbon(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: LISBON,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  }).format(new Date(iso))
}

export function fmtLisbonTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: LISBON, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/** Date + wall-clock time to the second, e.g. "18 Jul 2026, 15:07:25" (Lisbon). */
export function fmtLisbonSeconds(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: LISBON,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(iso))
}

export function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}

/** Local (Lisbon) calendar date string YYYY-MM-DD for an instant. */
export function lisbonDateOf(iso: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: LISBON, year: 'numeric', month: '2-digit', day: '2-digit' })
  return p.format(new Date(iso))
}

export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
