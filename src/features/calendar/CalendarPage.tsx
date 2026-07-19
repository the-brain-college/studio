import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRailwayFeed, useSchedules, useVideos } from '@/lib/queries'
import { fmtLisbonTime, lisbonDateOf } from '@/lib/time'
import type { Platform } from '@/lib/types'
import { Badge, Button, Card, PageHeader } from '@/components/ui'

type Chip = {
  key: string
  date: string // YYYY-MM-DD (Lisbon)
  time: string
  platform: Platform
  title: string
  state: string
  slug?: string
}

const PLATFORM_DOT: Record<Platform, string> = {
  youtube: 'bg-danger',
  instagram: 'bg-info',
  facebook: 'bg-warn',
}

export function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const { data: schedules } = useSchedules()
  const { data: videos } = useVideos()
  const railway = useRailwayFeed()

  const chips = useMemo<Chip[]>(() => {
    const bySlugId = new Map((videos ?? []).map((v) => [v.id, v]))
    const own: Chip[] = (schedules ?? []).map((s) => {
      const v = bySlugId.get(s.video_id)
      return {
        key: `s-${s.id}`,
        date: lisbonDateOf(s.publish_at),
        time: fmtLisbonTime(s.publish_at),
        platform: s.platform,
        title: v?.title || v?.slug || 'video',
        state: s.state,
        slug: v?.slug,
      }
    })
    const legacy: Chip[] = (railway.data ?? []).map((r, i) => ({
      key: `r-${i}`,
      date: lisbonDateOf(r.publish_at),
      time: fmtLisbonTime(r.publish_at),
      platform: r.platform,
      title: r.title ?? r.caption?.slice(0, 40) ?? r.platform,
      state: r.state,
    }))
    return [...own, ...legacy]
  }, [schedules, videos, railway.data])

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const weeks = buildMonthGrid(cursor.y, cursor.m)
  const today = lisbonDateOf(new Date().toISOString())

  return (
    <>
      <PageHeader
        title="Calendar"
        sub="Everything scheduled across YouTube, Instagram and Facebook — one place."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setCursor(prevMonth(cursor))}>←</Button>
            <span className="min-w-36 text-center text-[14px] font-medium">{monthLabel}</span>
            <Button size="sm" onClick={() => setCursor(nextMonth(cursor))}>→</Button>
          </div>
        }
      />

      {railway.isError && (
        <p className="mb-4 rounded-(--radius-control) border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-warn">
          The legacy calendar feed (Railway) is unreachable — showing this app's schedules only.
        </p>
      )}

      {/* phone + tablet: a stacked agenda (the 7-col grid can't fit ~500px of content width) */}
      <div className="lg:hidden">
        <AgendaView chips={chips} y={cursor.y} m={cursor.m} today={today} />
      </div>

      {/* desktop: the full month grid */}
      <Card className="hidden overflow-x-auto lg:block">
        <div className="min-w-[880px]">
          <div className="grid grid-cols-7 border-b border-line">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-line last:border-b-0">
              {week.map((day, di) => {
                const dayChips = day ? chips.filter((c) => c.date === day.iso) : []
                return (
                  <div key={di} className={`min-h-28 border-r border-line/60 p-2 last:border-r-0 ${day?.iso === today ? 'bg-accent/5' : ''}`}>
                    {day && (
                      <>
                        <p className={`mb-1.5 text-[12px] font-medium ${day.iso === today ? 'text-accent' : 'text-ink-faint'}`}>{day.n}</p>
                        <div className="space-y-1">
                          {dayChips
                            .sort((a, b) => a.time.localeCompare(b.time))
                            .map((c) => {
                              const inner = (
                                <span
                                  className={[
                                    'flex w-full items-center gap-1.5 truncate rounded border border-line bg-raised px-1.5 py-1 text-left text-[11px]',
                                    c.slug ? 'hover:border-line-strong' : 'opacity-90',
                                    c.state === 'published' ? 'opacity-60' : '',
                                  ].join(' ')}
                                  title={`${c.platform} · ${c.time} · ${c.title}`}
                                >
                                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PLATFORM_DOT[c.platform]}`} />
                                  <span className="shrink-0 text-ink-faint">{c.time}</span>
                                  <span className="truncate text-ink-muted">{c.title}</span>
                                </span>
                              )
                              return c.slug ? (
                                <Link key={c.key} to={`/videos/${c.slug}`} className="block">{inner}</Link>
                              ) : (
                                <div key={c.key}>{inner}</div>
                              )
                            })}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px] text-ink-muted">
        {(['youtube', 'instagram', 'facebook'] as Platform[]).map((p) => (
          <span key={p} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${PLATFORM_DOT[p]}`} /> {p}
          </span>
        ))}
        <Badge tone="muted">faded = already published</Badge>
      </div>
    </>
  )
}

/** Phone/tablet calendar: the month's scheduled items as a stacked, full-width agenda
 *  (only days that have something), grouped by day — no horizontal scrolling. */
function AgendaView({ chips, y, m, today }: { chips: Chip[]; y: number; m: number; today: string }) {
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}`
  const byDay = new Map<string, Chip[]>()
  for (const c of chips) {
    if (!c.date.startsWith(prefix)) continue
    const arr = byDay.get(c.date) ?? []
    arr.push(c)
    byDay.set(c.date, arr)
  }
  const days = [...byDay.keys()].sort()

  if (days.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-[13px] text-ink-faint">Nothing scheduled this month.</p>
      </Card>
    )
  }

  return (
    <Card className="divide-y divide-line overflow-hidden">
      {days.map((iso) => {
        const dayN = Number(iso.slice(8, 10))
        const weekday = new Date(y, m, dayN).toLocaleDateString('en-GB', { weekday: 'short' })
        const isToday = iso === today
        const dayChips = (byDay.get(iso) ?? []).sort((a, b) => a.time.localeCompare(b.time))
        return (
          <div key={iso} className="p-3 sm:p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className={`text-[13px] font-semibold ${isToday ? 'text-accent' : 'text-ink'}`}>{weekday} {dayN}</span>
              {isToday && <Badge tone="accent">today</Badge>}
            </div>
            <div className="space-y-1.5">
              {dayChips.map((c) => {
                const inner = (
                  <span
                    className={[
                      'flex items-center gap-2 rounded-(--radius-control) border border-line bg-raised px-2.5 py-2',
                      c.state === 'published' ? 'opacity-60' : '',
                    ].join(' ')}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${PLATFORM_DOT[c.platform]}`} />
                    <span className="shrink-0 text-[12px] tabular-nums text-ink-faint">{c.time}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">{c.title}</span>
                    <span className="shrink-0 text-[11px] capitalize text-ink-faint">{c.platform}</span>
                  </span>
                )
                return c.slug ? (
                  <Link key={c.key} to={`/videos/${c.slug}`} className="block">{inner}</Link>
                ) : (
                  <div key={c.key}>{inner}</div>
                )
              })}
            </div>
          </div>
        )
      })}
    </Card>
  )
}

function buildMonthGrid(y: number, m: number): Array<Array<{ n: number; iso: string } | null>> {
  const first = new Date(y, m, 1)
  const startCol = (first.getDay() + 6) % 7 // Monday = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells: Array<{ n: number; iso: string } | null> = [
    ...Array.from({ length: startCol }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      n: i + 1,
      iso: `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
    })),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

const prevMonth = (c: { y: number; m: number }) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })
const nextMonth = (c: { y: number; m: number }) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })
