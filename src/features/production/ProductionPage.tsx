import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  useCommands, useCreateOrder, useFactoryState, useOrders, useSendCommand, useUpdateOrder, useVideos, uploadReference, uploadScheduleVideo,
} from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/toast'
import type { Adaptation, Command, Order } from '@/lib/types'
import { fmtDate } from '@/lib/time'
import { Badge, Button, Card, Empty, Input, PageHeader, Spinner, Textarea } from '@/components/ui'

const ONLINE_MS = 10 * 60_000        // Filipe's rule: factory seen < 10 min ago = ONLINE, else OFFLINE
const GRACE_MS = 2 * 60_000

export function ProductionPage() {
  return (
    <>
      <PageHeader
        title="Production"
        sub="Mission control for the factory: what's running, and the FIFO of videos to make — all from here."
      />
      <div className="space-y-6">
        <MissionControl />
        <SectionHeading title="Chat" sub="Talk to Claude on the factory PC — questions, orders, course corrections." />
        <ChatPanel />
        <SectionHeading title="Video Requests" sub="Ask the factory to make a video — from scratch or copying a winner." />
        <InjectBar />
        <Queue />
        <SectionHeading title="Videos to Schedule" sub="Finished videos you made yourself — the factory takes them from here." />
        <SchedulePool />
        <CommandLog />
      </div>
    </>
  )
}

function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-1">
      <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-muted">{title}</h2>
      {sub && <span className="text-[11px] text-ink-faint">{sub}</span>}
      <span className="h-px min-w-10 flex-1 self-center bg-line" />
    </div>
  )
}

/* ————— mission control ————— */

function MissionControl() {
  const { data: fs } = useFactoryState()
  const send = useSendCommand()
  const toast = useToast()
  const [editingGoals, setEditingGoals] = useState(false)

  const online = !!fs?.status && Date.now() - +new Date(fs.status.alive_at) < ONLINE_MS
  const pool = fs?.heartbeat?.pool ?? {}
  const sum = (pred: (k: string) => boolean) =>
    Object.entries(pool).filter(([k]) => pred(k)).reduce((a, [, n]) => a + n, 0)
  const queued = sum((k) => k.endsWith(':queued'))
  const executing = sum((k) => k.endsWith(':executing'))
  const rendered = sum((k) => k.endsWith(':generated') || k.endsWith(':fetched'))

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div>
          <span
            className={[
              'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[14px] font-bold uppercase tracking-widest',
              online ? 'border-ok/50 bg-ok/15 text-ok' : 'border-danger/50 bg-danger/15 text-danger',
            ].join(' ')}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-ok shadow-[0_0_8px] shadow-ok/70' : 'bg-danger'}`} />
            {online ? 'Online' : 'Offline'}
          </span>
          <p className="mt-1.5 text-[11px] text-ink-faint">
            {fs?.status ? `factory seen ${fmtAgo(fs.status.alive_at)}` : 'factory never seen'}
            {fs?.heartbeat ? ` · PC pulse ${fmtAgo(fs.heartbeat.at)}` : ''}
          </p>
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

/* ————— inject bar ————— */

function InjectBar() {
  const create = useCreateOrder()
  const qc = useQueryClient()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [refUrl, setRefUrl] = useState('')
  const [note, setNote] = useState('')
  const [adaptation, setAdaptation] = useState<Adaptation>('bridge')
  const [busy, setBusy] = useState(false)

  function injectScratch() {
    create.mutate({ kind: 'scratch', status: 'queued' }, {
      onSuccess: () => toast.push({ kind: 'ok', title: 'Scratch video injected', detail: 'The Story Artist invents it. Cancelable for 2 minutes.' }),
      onError: (e) => toast.push({ kind: 'err', title: 'Inject failed', detail: (e as Error).message }),
    })
  }

  async function injectCopy() {
    if (!file) return
    setBusy(true)
    try {
      await uploadReference(file, { notes: note, adaptation, reference_url: refUrl })
      void qc.invalidateQueries({ queryKey: ['orders'] })
      toast.push({ kind: 'ok', title: 'Copy injected into the queue', detail: 'Cancelable for 2 minutes.' })
      setFile(null); setRefUrl(''); setNote(''); setAdaptation('bridge'); setCopyOpen(false)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      toast.push({ kind: 'err', title: 'Inject failed', detail: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={create.isPending} onClick={injectScratch}>
          + From scratch
        </Button>
        <Button variant="secondary" onClick={() => setCopyOpen((v) => !v)}>
          {copyOpen ? 'Close' : '+ Copy a winner'}
        </Button>
        <span className="ml-2 text-[12px] text-ink-faint">Injects at the tail of the FIFO — cancelable for 2 minutes.</span>
      </div>

      {copyOpen && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_auto]">
            <label className="block cursor-pointer rounded-(--radius-control) border border-dashed border-line-strong bg-raised/50 p-3 text-center transition-colors hover:border-accent/60">
              <input ref={fileRef} type="file" accept="video/mp4,video/quicktime" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="text-[13px] font-medium text-ink">{file ? file.name : 'Drop the winner video here (.mp4)'}</p>
              <p className="mt-0.5 text-[11px] text-ink-faint">≤ 50 MB — TikTok/Reels downloads fit easily</p>
            </label>
            <div className="space-y-2">
              <Input placeholder="Original link (optional)" value={refUrl} onChange={(e) => setRefUrl(e.target.value)} />
              <Input placeholder="Note for the copy (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex flex-col items-start gap-2">
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
              <Button variant="primary" disabled={!file || busy} onClick={() => void injectCopy()}>
                {busy ? <Spinner className="h-4 w-4" /> : 'Inject copy'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

/* ————— the queue (FIFO) ————— */

const ACTIVE_STATUSES: Order['status'][] = ['queued', 'in_production']
const HISTORY_STATUSES: Order['status'][] = ['produced', 'failed', 'canceled']

/** Newest first — history reads like a log. */
function historyOf(orders: Order[] | undefined, schedule: boolean): Order[] {
  return (orders ?? [])
    .filter((o) => (o.kind === 'schedule') === schedule && HISTORY_STATUSES.includes(o.status))
    .sort((a, b) => +new Date(b.produced_at ?? b.created_at) - +new Date(a.produced_at ?? a.created_at))
}

function Queue() {
  const { data: orders, isLoading } = useOrders()
  const { data: videos } = useVideos()
  const { data: fs } = useFactoryState()
  const update = useUpdateOrder()
  const toast = useToast()

  const queue = useMemo(() =>
    (orders ?? [])
      .filter((o) => o.kind !== 'schedule' && ACTIVE_STATUSES.includes(o.status))
      .sort((a, b) => (b.priority - a.priority) || (+new Date(a.created_at) - +new Date(b.created_at))),
  [orders])

  const history = useMemo(() => historyOf(orders, false), [orders])

  const held = useMemo(() =>
    (orders ?? [])
      .filter((o) => o.kind !== 'schedule' && o.status === 'pool')
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
  [orders])

  const slugById = useMemo(() => new Map((videos ?? []).map((v) => [v.id, v.slug])), [videos])

  const queuedCopies = queue.filter((o) => o.kind === 'copy' && o.status === 'queued').length
  const copyGoal = fs?.goals?.per_format?.copy ?? 0
  const short = Math.max(0, copyGoal - queuedCopies)

  function cancel(o: Order) {
    update.mutate({ id: o.id, patch: { status: 'canceled' } }, {
      onSuccess: () => toast.push({ kind: 'ok', title: 'Canceled', detail: 'Removed from the queue.' }),
    })
  }

  function injectHeld(o: Order) {
    update.mutate({ id: o.id, patch: { status: 'queued', created_at: new Date().toISOString() } }, {
      onSuccess: () => toast.push({ kind: 'ok', title: 'Injected into the queue', detail: 'Cancelable for 2 minutes.' }),
    })
  }

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">The queue</h2>
        <span className="text-[12px] text-ink-faint">{queuedCopies} cop{queuedCopies === 1 ? 'y' : 'ies'} queued · copy goal {copyGoal}/day</span>
      </div>

      {short > 0 && (
        <p className="mb-3 rounded-(--radius-control) border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-warn">
          Inject at least {short} more cop{short === 1 ? 'y' : 'ies'} to hit today's copy goal.
        </p>
      )}

      {isLoading && <div className="flex justify-center py-10"><Spinner className="h-5 w-5" /></div>}
      {!isLoading && queue.length === 0 && held.length === 0 && (
        <Empty title="The queue is clear" hint="Inject a video above — from scratch or a winner to copy. The factory works the FIFO head first." />
      )}

      <ul className="divide-y divide-line">
        {queue.map((o, i) => (
          <QueueRow
            key={o.id}
            order={o}
            position={i + 1}
            producedSlug={o.video_id ? slugById.get(o.video_id) ?? null : null}
            onCancel={() => cancel(o)}
          />
        ))}
      </ul>

      {held.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] uppercase tracking-wider text-ink-faint">Held — not queued</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <ul className="divide-y divide-line">
            {held.map((o) => (
              <HeldRow key={o.id} order={o} onInject={() => injectHeld(o)} />
            ))}
          </ul>
        </div>
      )}

      <OrderHistory orders={history} slugById={slugById} />
    </Card>
  )
}

/* ————— history: finished orders leave the queue but stay one click away ————— */

function OrderHistory({ orders, slugById }: { orders: Order[]; slugById: Map<string, string> }) {
  const [open, setOpen] = useState(false)
  if (orders.length === 0) return null
  return (
    <div className="mt-4 border-t border-line pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-[12px] font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <span className={`inline-block transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>▸</span>
        History
        <span className="text-ink-faint">({orders.length})</span>
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-line">
          {orders.map((o) => (
            <HistoryRow key={o.id} order={o} producedSlug={o.video_id ? slugById.get(o.video_id) ?? null : null} />
          ))}
        </ul>
      )}
    </div>
  )
}

function HistoryRow({ order: o, producedSlug }: { order: Order; producedSlug: string | null }) {
  return (
    <li className="flex items-center gap-3 py-2.5 opacity-90">
      <span className="w-7 shrink-0" />
      <OrderThumb order={o} />
      <Badge tone={KIND_BADGE[o.kind].tone}>{KIND_BADGE[o.kind].label}</Badge>
      {o.notes && <span className="hidden max-w-60 truncate text-[11px] text-ink-muted sm:inline">{o.notes}</span>}
      <span className="text-[11px] text-ink-faint">{fmtDate(o.produced_at ?? o.created_at)}</span>
      <span className="flex-1" />
      {o.status === 'produced' && producedSlug && (
        <Link className="text-[12px] text-accent hover:underline" to={`/videos/${producedSlug}`}>Open →</Link>
      )}
      {o.status === 'produced' && <Badge tone="ok">produced</Badge>}
      {o.status === 'failed' && <Badge tone="danger">failed</Badge>}
      {o.status === 'canceled' && <Badge tone="muted">canceled</Badge>}
    </li>
  )
}

const KIND_BADGE: Record<Order['kind'], { tone: 'info' | 'accent' | 'ok'; label: string }> = {
  copy: { tone: 'info', label: 'copy' },
  scratch: { tone: 'accent', label: 'scratch' },
  schedule: { tone: 'ok', label: 'schedule' },
}

function OrderThumb({ order }: { order: Order }) {
  const { data: url } = usePlayableReference(order.kind !== 'scratch' ? order.reference_path : null)
  return (
    <div className="aspect-[9/16] w-10 shrink-0 overflow-hidden rounded-[6px] border border-line bg-black">
      {order.kind !== 'scratch' ? (
        url
          ? <video src={url} preload="metadata" muted playsInline className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center">{order.reference_path ? <Spinner className="h-3 w-3" /> : <span className="text-[9px] text-ink-faint">no file</span>}</div>
      ) : (
        <div className="flex h-full items-center justify-center bg-raised">
          <SparkleIcon />
        </div>
      )}
    </div>
  )
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-accent" fill="currentColor" aria-label="from scratch">
      <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2L12 2z" />
      <path d="M19 15l1.1 2.9L23 19l-2.9 1.1L19 23l-1.1-2.9L15 19l2.9-1.1L19 15z" className="opacity-70" />
    </svg>
  )
}

/** Grace-window countdown, isolated here so the tick re-renders only this row. */
function useGraceRemaining(createdAt: string, active: boolean): number {
  const compute = () => GRACE_MS - (Date.now() - +new Date(createdAt))
  const [remaining, setRemaining] = useState(compute)
  useEffect(() => {
    if (!active) return
    setRemaining(compute())
    const t = setInterval(() => {
      const r = compute()
      setRemaining(r)
      if (r <= 0) clearInterval(t)
    }, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdAt, active])
  return remaining
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function QueueRow({ order: o, position, producedSlug, onCancel }: {
  order: Order
  position: number
  producedSlug: string | null
  onCancel: () => void
}) {
  const remaining = useGraceRemaining(o.created_at, o.status === 'queued')
  const inGrace = o.status === 'queued' && remaining > 0

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="w-7 shrink-0 text-right font-display text-[15px] text-ink-faint">#{position}</span>
      <OrderThumb order={o} />
      <Badge tone={KIND_BADGE[o.kind].tone}>{KIND_BADGE[o.kind].label}</Badge>
      {o.notes && <span className="hidden max-w-60 truncate text-[11px] text-ink-muted sm:inline">{o.notes}</span>}
      <span className="text-[11px] text-ink-faint">{fmtDate(o.created_at)}</span>
      <span className="flex-1" />
      {o.status === 'produced' && producedSlug && (
        <Link className="text-[12px] text-accent hover:underline" to={`/videos/${producedSlug}`}>Open →</Link>
      )}
      {o.status === 'queued' && (inGrace
        ? <Badge tone="warn">cancelable {fmtCountdown(remaining)}</Badge>
        : <Badge tone="accent">queued</Badge>)}
      {o.status === 'in_production' && <Badge tone="warn">in production</Badge>}
      {o.status === 'produced' && <Badge tone="ok">produced</Badge>}
      {o.status === 'failed' && <Badge tone="danger">failed</Badge>}
      {o.status === 'queued' && (
        <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={onCancel}>Cancel</Button>
      )}
    </li>
  )
}

function HeldRow({ order: o, onInject }: { order: Order; onInject: () => void }) {
  return (
    <li className="flex items-center gap-3 py-2.5 opacity-80">
      <span className="w-7 shrink-0" />
      <OrderThumb order={o} />
      <Badge tone={KIND_BADGE[o.kind].tone}>{KIND_BADGE[o.kind].label}</Badge>
      {o.notes && <span className="hidden max-w-60 truncate text-[11px] text-ink-muted sm:inline">{o.notes}</span>}
      <span className="text-[11px] text-ink-faint">{fmtDate(o.created_at)}</span>
      <span className="flex-1" />
      <Button size="sm" variant="secondary" onClick={onInject}>Inject</Button>
    </li>
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

/* ————— videos to schedule (finished videos → analyze + schedule) ————— */

function SchedulePool() {
  const { data: orders, isLoading } = useOrders()
  const { data: videos } = useVideos()
  const update = useUpdateOrder()
  const qc = useQueryClient()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const pool = useMemo(() =>
    (orders ?? [])
      .filter((o) => o.kind === 'schedule' && ACTIVE_STATUSES.includes(o.status))
      .sort((a, b) => (b.priority - a.priority) || (+new Date(a.created_at) - +new Date(b.created_at))),
  [orders])

  const history = useMemo(() => historyOf(orders, true), [orders])

  const slugById = useMemo(() => new Map((videos ?? []).map((v) => [v.id, v.slug])), [videos])

  async function upload(file: File | null | undefined) {
    if (!file || busy) return
    if (!/\.(mp4|mov)$/i.test(file.name) && !/video\//.test(file.type)) {
      toast.push({ kind: 'err', title: 'Not a video', detail: 'Drop an .mp4 file.' })
      return
    }
    setBusy(true)
    try {
      await uploadScheduleVideo(file)
      void qc.invalidateQueries({ queryKey: ['orders'] })
      toast.push({ kind: 'ok', title: 'Video queued for scheduling', detail: 'Cancelable for 2 minutes.' })
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      toast.push({ kind: 'err', title: 'Upload failed', detail: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  function cancel(o: Order) {
    update.mutate({ id: o.id, patch: { status: 'canceled' } }, {
      onSuccess: () => toast.push({ kind: 'ok', title: 'Canceled', detail: 'Removed from the schedule pool.' }),
    })
  }

  return (
    <Card className="p-5">
      <label
        className={[
          'block cursor-pointer rounded-(--radius-control) border border-dashed bg-raised/50 p-4 text-center transition-colors',
          dragOver ? 'border-accent bg-accent/5' : 'border-line-strong hover:border-accent/60',
        ].join(' ')}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void upload(e.dataTransfer.files?.[0]) }}
      >
        <input ref={fileRef} type="file" accept="video/mp4" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
        {busy
          ? <span className="flex items-center justify-center gap-2 text-[13px] text-ink"><Spinner className="h-4 w-4" /> Uploading…</span>
          : <p className="text-[13px] font-medium text-ink">Upload finished video</p>}
        <p className="mt-0.5 text-[11px] text-ink-faint">Drag & drop or click — .mp4, ready to publish</p>
      </label>
      <p className="mt-2 text-[12px] text-ink-faint">The factory analyzes the script, writes the caption, and schedules to YouTube.</p>

      {isLoading && <div className="flex justify-center py-8"><Spinner className="h-5 w-5" /></div>}
      {!isLoading && pool.length === 0 && (
        <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-faint">Nothing waiting — upload a finished video above.</p>
      )}
      {pool.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {pool.map((o, i) => (
            <QueueRow
              key={o.id}
              order={o}
              position={i + 1}
              producedSlug={o.video_id ? slugById.get(o.video_id) ?? null : null}
              onCancel={() => cancel(o)}
            />
          ))}
        </ul>
      )}

      <OrderHistory orders={history} slugById={slugById} />
    </Card>
  )
}

/* ————— chat: the website talks to Claude on the factory PC ————— */

interface ChatMessage {
  id: string
  sender: 'filipe' | 'claude'
  text: string
  created_at: string
  read_at: string | null
}

function ChatPanel() {
  const qc = useQueryClient()
  const toast = useToast()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const { data: messages } = useQuery({
    queryKey: ['chat-messages'],
    refetchInterval: 5_000, // polling floor — the realtime subscription below makes it instant when enabled
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data, error } = await supabase
        .from('chat_messages').select('*')
        .order('created_at', { ascending: false }).limit(200)
      if (error) return [] // table ships with migration 0013 — stay quiet if it isn't there yet
      return (data as ChatMessage[]).reverse()
    },
  })

  useEffect(() => {
    const ch = supabase
      .channel('chat-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        () => void qc.invalidateQueries({ queryKey: ['chat-messages'] }))
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [qc])

  const count = messages?.length ?? 0
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [count])

  async function sendMsg() {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    try {
      const { error } = await supabase.from('chat_messages').insert({ sender: 'filipe', text: t })
      if (error) throw new Error(error.message)
      setText('')
      void qc.invalidateQueries({ queryKey: ['chat-messages'] })
    } catch (e) {
      toast.push({ kind: 'err', title: 'Message not sent', detail: (e as Error).message })
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="p-5">
      <div ref={listRef} className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
        {count === 0 && (
          <p className="py-6 text-center text-[12px] text-ink-faint">No messages yet — say something to the factory.</p>
        )}
        {(messages ?? []).map((m) => (
          <div key={m.id} className={`flex ${m.sender === 'filipe' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={[
                'max-w-[75%] rounded-(--radius-control) border px-3 py-2',
                m.sender === 'filipe' ? 'border-accent/30 bg-accent/10' : 'border-line bg-raised',
              ].join(' ')}
            >
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{m.text}</p>
              <p className="mt-1 text-right text-[10px] text-ink-faint">
                {m.sender === 'filipe' ? 'you' : 'Claude'} · {fmtDate(m.created_at)}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-end gap-2 border-t border-line pt-3">
        <Textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMsg() }
          }}
          placeholder="Message the factory…"
          className="flex-1"
        />
        <Button variant="primary" disabled={!text.trim() || sending} onClick={() => void sendMsg()}>
          {sending ? <Spinner className="h-4 w-4" /> : 'Send'}
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">Claude replies from the factory PC — usually under a minute.</p>
    </Card>
  )
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
