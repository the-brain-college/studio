import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, Empty, Spinner } from '@/components/ui'

interface Stage {
  id: number
  role: string
  task: string | null
  started_at: string
  finished_at: string
  summary: string | null
}

const ROLE_META: Record<string, { label: string; color: string }> = {
  'story-artist': { label: 'Story Artist', color: 'bg-info' },
  'screenwriter-frames': { label: 'Screenwriter · Frames', color: 'bg-accent' },
  'screenwriter-video': { label: 'Screenwriter · Video', color: 'bg-accent-deep' },
  pooler: { label: 'Pooler', color: 'bg-ink-faint' },
  executor: { label: 'Executor', color: 'bg-warn' },
  qa: { label: 'QA', color: 'bg-ok' },
  'webapp-publisher': { label: 'Webapp Publisher', color: 'bg-danger' },
}

function fmtDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 90_000) return `${(ms / 1000).toFixed(0)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function fmtClock(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(iso))
}

export function PipelinePanel({ videoId }: { videoId: string }) {
  const { data: stages, isLoading } = useQuery({
    queryKey: ['stages', videoId],
    queryFn: async (): Promise<Stage[]> => {
      const { data, error } = await supabase.from('stages').select('*').eq('video_id', videoId).order('started_at')
      if (error) throw new Error(error.message)
      return data as Stage[]
    },
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
  if (!stages?.length) {
    return <Empty title="No pipeline data yet" hint="Stage timings arrive with the factory's next ingest of this video." />
  }

  const t0 = Math.min(...stages.map((s) => +new Date(s.started_at)))
  const t1 = Math.max(...stages.map((s) => +new Date(s.finished_at)))
  const span = Math.max(1, t1 - t0)

  // group visual lanes by role, chronological inside each
  const roles = [...new Set(stages.map((s) => s.role))]

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center gap-x-10 gap-y-3 p-5">
        <Stat label="Pipeline started" value={fmtClock(new Date(t0).toISOString())} />
        <Stat label="Pipeline finished" value={fmtClock(new Date(t1).toISOString())} />
        <Stat label="Total wall time" value={fmtDur(span)} accent />
        <Stat label="Work recorded" value={fmtDur(stages.reduce((a, s) => a + (+new Date(s.finished_at) - +new Date(s.started_at)), 0))} />
        <Stat label="Stages" value={String(stages.length)} />
      </Card>

      <Card className="overflow-x-auto p-5">
        <div className="min-w-[720px] space-y-3">
          {roles.map((role) => {
            const meta = ROLE_META[role] ?? { label: role, color: 'bg-line-strong' }
            const own = stages.filter((s) => s.role === role)
            return (
              <div key={role} className="grid grid-cols-[180px_1fr] items-center gap-3">
                <p className="truncate text-[12px] font-semibold text-ink-muted">{meta.label}</p>
                <div className="relative h-6 rounded bg-raised">
                  {own.map((s) => {
                    const left = ((+new Date(s.started_at) - t0) / span) * 100
                    const width = Math.max(0.7, ((+new Date(s.finished_at) - +new Date(s.started_at)) / span) * 100)
                    return (
                      <div
                        key={s.id}
                        className={`absolute top-1 h-4 rounded-sm ${meta.color} opacity-80 hover:opacity-100`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${s.task ?? role} · ${fmtDur(+new Date(s.finished_at) - +new Date(s.started_at))}\n${fmtClock(s.started_at)} → ${fmtClock(s.finished_at)}\n${s.summary ?? ''}`}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-4 text-[11px] text-ink-faint">Bars share one time axis — overlapping bars ran in parallel. Hover any bar for exact times and output.</p>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[12px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="px-4 py-2.5">Team member</th>
              <th className="px-4 py-2.5">Task</th>
              <th className="px-4 py-2.5">Started</th>
              <th className="px-4 py-2.5">Duration</th>
              <th className="px-4 py-2.5">Output</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s.id} className="border-b border-line/50 last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 font-medium text-ink">{(ROLE_META[s.role] ?? { label: s.role }).label}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{s.task ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-faint">{fmtClock(s.started_at)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink">{fmtDur(+new Date(s.finished_at) - +new Date(s.started_at))}</td>
                <td className="px-4 py-2.5 text-ink-muted">{s.summary ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-ink-faint">{label}</p>
      <p className={`mt-0.5 text-[15px] font-semibold ${accent ? 'text-accent' : 'text-ink'}`}>{value}</p>
    </div>
  )
}
