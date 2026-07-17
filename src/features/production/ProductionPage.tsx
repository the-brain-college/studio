import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  useCommands, useCreateOrder, useFactoryState, useOrders, useSendCommand, useUpdateOrder, useVideos, uploadReference,
} from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/toast'
import type { Adaptation, Command, Order } from '@/lib/types'
import { fmtDate } from '@/lib/time'
import { Badge, Button, Card, Empty, Input, PageHeader, Spinner, Textarea } from '@/components/ui'

const STALE_MS = 2.5 * 60_000

export function ProductionPage() {
  return (
    <>
      <PageHeader
        title="Production"
        sub="Mission control for the factory: what's running, what's ordered, and the copy pool — all from here."
      />
      <div className="space-y-6">
        <MissionControl />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
          <OrderForm />
          <CopyPool />
        </div>
        <CommandLog />
      </div>
    </>
  )
}

/* ————— mission control ————— */

function MissionControl() {
  const { data: fs } = useFactoryState()
  const send = useSendCommand()
  const toast = useToast()
  const [editingGoals, setEditingGoals] = useState(false)

  const now = Date.now()
  const pcAlive = fs?.heartbeat && now - +new Date(fs.heartbeat.at) < STALE_MS
  const brainAlive = fs?.status && now - +new Date(fs.status.alive_at) < STALE_MS
  const autoRun = fs?.status?.auto_run ?? true
  const pool = fs?.heartbeat?.pool ?? {}
  const sum = (pred: (k: string) => boolean) =>
    Object.entries(pool).filter(([k]) => pred(k)).reduce((a, [, n]) => a + n, 0)
  const queued = sum((k) => k.endsWith(':queued'))
  const executing = sum((k) => k.endsWith(':executing'))
  const rendered = sum((k) => k.endsWith(':generated') || k.endsWith(':fetched'))

  function toggleAuto() {
    const type = autoRun ? 'pause_auto' : 'resume_auto'
    send.mutate({ type }, {
      onSuccess: () => toast.push({ kind: 'ok', title: autoRun ? 'Pause sent' : 'Resume sent', detail: 'The factory confirms on its next check-in (≤2 min).' }),
    })
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex items-center gap-6">
          <StatusDot label="PC" on={!!pcAlive} detail={fs?.heartbeat ? `pulse ${fmtAgo(fs.heartbeat.at)}` : 'no pulse yet'} />
          <StatusDot label="Factory brain" on={!!brainAlive} detail={fs?.status ? `seen ${fmtAgo(fs.status.alive_at)}` : 'Claude not running'} />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[12px] text-ink-muted">Auto-run</span>
          <button
            onClick={toggleAuto}
            disabled={send.isPending}
            aria-label="Toggle auto-run"
            className={[
              'relative h-6 w-11 rounded-full border transition-colors duration-200',
              autoRun ? 'border-ok/50 bg-ok/30' : 'border-line bg-raised',
            ].join(' ')}
          >
            <span className={[
              'absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all duration-200',
              autoRun ? 'left-[calc(100%-1.25rem)]' : 'left-0.5',
            ].join(' ')} />
          </button>
          <Badge tone={autoRun ? 'ok' : 'warn'}>{autoRun ? 'running' : 'paused'}</Badge>
        </div>

        <div className="flex items-center gap-4 text-[12px] text-ink-muted">
          <Gauge label="Queued" value={queued} />
          <Gauge label="Executing" value={executing} tone="text-warn" />
          <Gauge label="Rendered" value={rendered} tone="text-ok" />
          <Gauge label="Scenes today" value={fs?.heartbeat?.produced_scenes_today ?? 0} tone="text-accent" />
        </div>

        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => setEditingGoals((v) => !v)}>
          {editingGoals ? 'Close goals' : '⚙ Daily goals'}
        </Button>
        <Button
          size="sm"
          onClick={() => send.mutate({ type: 'run_feedback_intake' }, { onSuccess: () => toast.push({ kind: 'ok', title: 'Feedback intake requested', detail: 'The factory reads your feedback on its next check-in.' }) })}
        >
          Read my feedback
        </Button>
      </div>

      {fs?.status?.activity && (
        <p className="mt-3 border-t border-line pt-3 text-[13px] text-ink">
          <span className="text-ink-faint">Now: </span>{fs.status.activity}
        </p>
      )}

      {editingGoals && <GoalsEditor onDone={() => setEditingGoals(false)} />}
    </Card>
  )
}

function StatusDot({ label, on, detail }: { label: string; on: boolean; detail: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-ok shadow-[0_0_6px] shadow-ok/60' : 'bg-line-strong'}`} />
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <span className="text-[11px] text-ink-faint">{detail}</span>
    </span>
  )
}

function Gauge({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <span>
      <span className={`text-[15px] font-semibold ${tone ?? 'text-ink'}`}>{value}</span>
      <span className="ml-1 text-ink-faint">{label}</span>
    </span>
  )
}

function fmtAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - +new Date(iso)) / 1000))
  if (s < 90) return `${s}s ago`
  if (s < 5400) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

/* ————— daily goals ————— */

const GOAL_FORMATS = [
  { key: 'copy', label: 'Copies' },
  { key: 'scratch_A', label: 'Scratch — Format A' },
  { key: 'scratch_B', label: 'Scratch — Format B' },
  { key: 'scratch_callout', label: 'Scratch — Callout' },
]

function GoalsEditor({ onDone }: { onDone: () => void }) {
  const { data: fs } = useFactoryState()
  const send = useSendCommand()
  const toast = useToast()
  const [vals, setVals] = useState<Record<string, number>>(() => ({ ...(fs?.goals?.per_format ?? {}) }))

  function save() {
    const per_format = Object.fromEntries(Object.entries(vals).filter(([, n]) => n > 0))
    send.mutate(
      { type: 'set_goal', payload: { date: new Date().toISOString().slice(0, 10), per_format } },
      { onSuccess: () => { toast.push({ kind: 'ok', title: 'Goals sent', detail: 'Applied on the factory’s next check-in.' }); onDone() } },
    )
  }

  return (
    <div className="mt-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-end gap-4">
        {GOAL_FORMATS.map((f) => (
          <label key={f.key} className="text-[12px] text-ink-muted">
            {f.label}
            <Input
              type="number" min={0} max={10}
              className="mt-1 w-24"
              value={vals[f.key] ?? 0}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: Math.max(0, Number(e.target.value) || 0) }))}
            />
          </label>
        ))}
        <Button size="sm" variant="primary" disabled={send.isPending} onClick={save}>Save goals</Button>
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">Ceiling ≈ 10 reels/day (Flow's render limit). The copy quota drives the sufficiency check below.</p>
    </div>
  )
}

/* ————— order form ————— */

function OrderForm() {
  const create = useCreateOrder()
  const send = useSendCommand()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<'copy' | 'scratch'>('copy')
  const [file, setFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const [refUrl, setRefUrl] = useState('')
  const [adaptation, setAdaptation] = useState<Adaptation>('bridge')
  const [format, setFormat] = useState('A')
  const [produceNow, setProduceNow] = useState(true)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      let order: Order
      if (kind === 'copy') {
        if (!file) throw new Error('Pick the reference video file first.')
        order = await uploadReference(file, { notes, adaptation, reference_url: refUrl })
      } else {
        order = await create.mutateAsync({ kind: 'scratch', format, notes: notes || null, status: 'pool' })
      }
      if (produceNow) {
        await send.mutateAsync({ type: 'order_produce', payload: { order_id: order.id } })
        toast.push({ kind: 'ok', title: 'Order sent to the factory', detail: 'Production starts on its next check-in (≤2 min).' })
      } else {
        toast.push({ kind: 'ok', title: kind === 'copy' ? 'Added to the copy pool' : 'Order saved' })
      }
      setFile(null); setNotes(''); setRefUrl('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      toast.push({ kind: 'err', title: 'Order failed', detail: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="h-fit p-5">
      <h2 className="mb-4 text-[15px] font-semibold">Order a video</h2>

      <div className="mb-4 flex gap-1.5">
        {(['copy', 'scratch'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={[
              'rounded-full border px-4 py-1.5 text-[12px] font-medium capitalize transition-all duration-150 active:scale-95',
              kind === k ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
            ].join(' ')}
          >
            {k === 'copy' ? 'Copy a winner' : 'From scratch'}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {kind === 'copy' ? (
          <>
            <label className="block cursor-pointer rounded-(--radius-control) border border-dashed border-line-strong bg-raised/50 p-4 text-center transition-colors hover:border-accent/60">
              <input ref={fileRef} type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="text-[13px] font-medium text-ink">{file ? file.name : 'Drop the winner video here (.mp4)'}</p>
              <p className="mt-1 text-[11px] text-ink-faint">≤ 50 MB — TikTok/Reels downloads fit easily</p>
            </label>
            <Input placeholder="Original link (optional)" value={refUrl} onChange={(e) => setRefUrl(e.target.value)} />
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">Speech adaptation</label>
              <div className="flex gap-1.5">
                {([['bridge', 'Brain bridge'], ['verbatim', 'Verbatim'], ['full', 'Full rewrite']] as const).map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setAdaptation(v)}
                    className={[
                      'rounded-full border px-3 py-1 text-[11px] font-medium transition-all duration-150 active:scale-95',
                      adaptation === v ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-ink-muted hover:text-ink',
                    ].join(' ')}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">Format</label>
            <div className="flex flex-wrap gap-1.5">
              {[['A', 'A — food combo'], ['B', 'B — comparison'], ['callout', 'Direct callout'], ['debunk', 'Debunk'], ['location', 'Absurd location']].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setFormat(v)}
                  className={[
                    'rounded-full border px-3 py-1 text-[11px] font-medium transition-all duration-150 active:scale-95',
                    format === v ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-ink-muted hover:text-ink',
                  ].join(' ')}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

        <Textarea rows={2} placeholder={kind === 'copy' ? 'Direction for the copy (optional)…' : 'Concept / direction (optional — the Story Artist invents otherwise)…'} value={notes} onChange={(e) => setNotes(e.target.value)} />

        <label className="flex items-center gap-2 text-[12px] text-ink-muted">
          <input type="checkbox" checked={produceNow} onChange={(e) => setProduceNow(e.target.checked)} className="accent-(--color-accent)" />
          Produce now (otherwise it just joins the pool)
        </label>

        <Button variant="primary" className="w-full" disabled={busy || (kind === 'copy' && !file)} onClick={() => void submit()}>
          {busy ? <Spinner className="h-4 w-4" /> : produceNow ? '▶ Order production' : '+ Add to pool'}
        </Button>
      </div>
    </Card>
  )
}

/* ————— copy pool ————— */

function CopyPool() {
  const { data: orders, isLoading } = useOrders()
  const { data: videos } = useVideos()
  const { data: fs } = useFactoryState()
  const update = useUpdateOrder()
  const send = useSendCommand()
  const toast = useToast()

  const copies = useMemo(() => (orders ?? []).filter((o) => o.kind === 'copy' && o.status !== 'canceled'), [orders])
  const available = copies.filter((o) => o.status === 'pool').length
  const copyGoal = fs?.goals?.per_format?.copy ?? 0
  const short = Math.max(0, copyGoal - available)
  const videoBySlugId = useMemo(() => new Map((videos ?? []).map((v) => [v.id, v])), [videos])

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Videos to copy</h2>
        <span className="text-[12px] text-ink-faint">{available} available · goal {copyGoal}/day</span>
      </div>

      {short > 0 && (
        <p className="mb-3 rounded-(--radius-control) border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-warn">
          Today's copy goal is {copyGoal} but only {available} un-copied reference{available === 1 ? '' : 's'} in the pool — add at least {short} more.
        </p>
      )}

      {isLoading && <div className="flex justify-center py-10"><Spinner className="h-5 w-5" /></div>}
      {!isLoading && copies.length === 0 && (
        <Empty title="The copy pool is empty" hint="Upload winner videos with the order form — the factory copies them with Louis." />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {copies.map((o) => (
          <ReferenceCard
            key={o.id}
            order={o}
            producedVideo={o.video_id ? videoBySlugId.get(o.video_id) ?? null : null}
            onProduce={() => send.mutate({ type: 'order_produce', payload: { order_id: o.id } }, {
              onSuccess: () => { update.mutate({ id: o.id, patch: { status: 'queued' } }); toast.push({ kind: 'ok', title: 'Sent to the factory' }) },
            })}
            onCancel={() => update.mutate({ id: o.id, patch: { status: 'canceled' } }, { onSuccess: () => toast.push({ kind: 'ok', title: 'Removed from pool' }) })}
          />
        ))}
      </div>
    </Card>
  )
}

const ORDER_BADGE: Record<Order['status'], { tone: 'info' | 'warn' | 'accent' | 'ok' | 'danger' | 'muted'; label: string }> = {
  pool: { tone: 'info', label: 'In pool' },
  queued: { tone: 'accent', label: 'Queued' },
  in_production: { tone: 'warn', label: 'In production' },
  produced: { tone: 'ok', label: 'Produced' },
  failed: { tone: 'danger', label: 'Failed' },
  canceled: { tone: 'muted', label: 'Canceled' },
}

function ReferenceCard({ order: o, producedVideo, onProduce, onCancel }: {
  order: Order
  producedVideo: { slug: string } | null
  onProduce: () => void
  onCancel: () => void
}) {
  const { data: url } = usePlayableReference(o.reference_path)
  const badge = ORDER_BADGE[o.status]

  return (
    <div className="overflow-hidden rounded-(--radius-control) border border-line bg-raised transition-all duration-200 hover:border-line-strong">
      <div className="aspect-[9/16] w-full bg-black">
        {url ? (
          <video src={url} controls preload="metadata" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-ink-faint">{o.reference_path ? <Spinner /> : 'no file'}</div>
        )}
      </div>
      <div className="space-y-1.5 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          <span className="text-[10px] text-ink-faint">{fmtDate(o.created_at)}</span>
        </div>
        {o.notes && <p className="line-clamp-2 text-[11px] text-ink-muted">{o.notes}</p>}
        <div className="flex items-center gap-2">
          {o.status === 'pool' && (
            <>
              <Button size="sm" variant="primary" onClick={onProduce}>▶ Produce</Button>
              <Button size="sm" variant="ghost" onClick={onCancel}>Remove</Button>
            </>
          )}
          {o.status === 'produced' && producedVideo && (
            <Link className="text-[12px] text-accent hover:underline" to={`/videos/${producedVideo.slug}`}>Open the copy →</Link>
          )}
        </div>
      </div>
    </div>
  )
}

function usePlayableReference(path: string | null) {
  return useQuery({
    queryKey: ['reference-url', path],
    enabled: !!path,
    staleTime: 45 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('media').createSignedUrl(path!, 3600)
      if (error) throw new Error(error.message)
      return data.signedUrl
    },
  })
}

/* ————— command log ————— */

function CommandLog() {
  const { data: commands } = useCommands()
  if (!commands?.length) return null
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-[15px] font-semibold">Command log</h2>
      <ul className="space-y-1.5">
        {commands.map((c) => <CommandRow key={c.id} c={c} />)}
      </ul>
    </Card>
  )
}

function CommandRow({ c }: { c: Command }) {
  const tone = c.status === 'done' ? 'ok' : c.status === 'failed' ? 'danger' : c.status === 'picked_up' ? 'warn' : 'muted'
  const label = c.status === 'pending' ? 'sent' : c.status === 'picked_up' ? 'picked up' : c.status
  return (
    <li className="flex flex-wrap items-center gap-2 text-[12px]">
      <Badge tone={tone}>{label}</Badge>
      <span className="font-medium text-ink">{c.type.replace(/_/g, ' ')}</span>
      <span className="text-ink-faint">{fmtDate(c.created_at)}</span>
      {c.result && <span className="text-ink-muted">— {c.result}</span>}
    </li>
  )
}
