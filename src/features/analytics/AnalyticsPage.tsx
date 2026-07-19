import { useMemo } from 'react'
import { useAnalytics, useAppState, useVideos } from '@/lib/queries'
import { fmtBytes } from '@/lib/time'
import { Card, PageHeader, StatTile } from '@/components/ui'

export function AnalyticsPage() {
  const { data: a } = useAnalytics()
  const { data: videos } = useVideos()
  const { data: storage } = useAppState('storage')

  const qc = useMemo(() => {
    let pass = 0
    let fail = 0
    const classes: Record<string, number> = {}
    for (const v of videos ?? []) {
      pass += v.qc?.pass ?? 0
      fail += v.qc?.fail ?? 0
      for (const [k, n] of Object.entries(v.qc?.failure_classes ?? {})) classes[k] = (classes[k] ?? 0) + n
    }
    const total = pass + fail
    return { pass, fail, rate: total ? Math.round((pass / total) * 100) : null, classes }
  }, [videos])

  const weekly = useMemo(() => {
    const buckets = new Map<string, number>()
    for (const v of videos ?? []) {
      const d = new Date(v.created_at)
      const monday = new Date(d)
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const key = monday.toISOString().slice(0, 10)
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
    return [...buckets.entries()].sort((x, y) => x[0].localeCompare(y[0])).slice(-8)
  }, [videos])

  const used = Number(storage?.used_bytes ?? 0)
  const usedPct = Math.min(100, Math.round((used / (1024 ** 3)) * 100))
  const maxWeek = Math.max(1, ...weekly.map(([, n]) => n))

  return (
    <>
      <PageHeader title="Analytics" sub="Production throughput, quality, and resource budget." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Ready to edit" value={a?.ingested ?? '–'} />
        <StatTile label="Final uploaded" value={a?.edited ?? '–'} tone="warn" />
        <StatTile label="Scheduled" value={a?.scheduled ?? '–'} tone="accent" />
        <StatTile label="Published" value={a?.published ?? '–'} tone="ok" />
        <StatTile label="Last 30 days" value={a?.videos_30d ?? '–'} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold">QC pass rate</h2>
          {qc.rate === null ? (
            <p className="text-[13px] text-ink-faint">No QC data yet.</p>
          ) : (
            <>
              <p className="font-display text-[40px] leading-none text-ok">{qc.rate}%</p>
              <p className="mt-1 text-[12px] text-ink-faint">{qc.pass} checks passed · {qc.fail} flagged</p>
              {Object.keys(qc.classes).length > 0 && (
                <div className="mt-4 space-y-1.5">
                  {Object.entries(qc.classes)
                    .sort((x, y) => y[1] - x[1])
                    .map(([k, n]) => (
                      <p key={k} className="flex justify-between text-[12px]">
                        <span className="text-ink-muted">{k}</span>
                        <span className="text-warn">{n}</span>
                      </p>
                    ))}
                </div>
              )}
            </>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Videos per week</h2>
          {weekly.length === 0 ? (
            <p className="text-[13px] text-ink-faint">Nothing delivered yet.</p>
          ) : (
            <div className="flex h-40 items-end gap-2">
              {weekly.map(([week, n]) => (
                <div key={week} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[11px] text-ink-muted">{n}</span>
                  <div className="w-full rounded-t bg-accent/70" style={{ height: `${(n / maxWeek) * 100}%` }} />
                  <span className="text-[11px] text-ink-faint">{week.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Storage budget</h2>
          <p className="font-display text-[28px] leading-none">{fmtBytes(used)}</p>
          <p className="mt-1 text-[12px] text-ink-faint">of 1 GB free tier</p>
          <div className="mt-3 h-2 w-full rounded-full bg-raised">
            <div className={`h-full rounded-full ${usedPct > 80 ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${usedPct}%` }} />
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
            Scene files purge 2 days after scheduling; finals purge 7 days after publishing. Masters stay on
            the factory PC; published finals live on YouTube.
          </p>
        </Card>
      </div>
    </>
  )
}
