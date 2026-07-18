import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAllFeedback, useApproveVideo, useMarkDownloaded, useScenes, useSchedules, useUnapproveVideo, useUndoReject, useVideos } from '@/lib/queries'
import { useToast } from '@/components/toast'
import { STATUS_LABEL, type Scene, type Video } from '@/lib/types'
import { fmtDate } from '@/lib/time'
import { Badge, Button, Card, Empty, Input, PageHeader, Spinner } from '@/components/ui'
import { Poster } from './Poster'
import { PreviewPlayer } from './PreviewPlayer'
import { SequencePlayer } from './SequencePlayer'
import { BulkRejectModal, Stars } from './FeedbackWidgets'
import {
  GROUP_META, GROUP_ORDER, type WorkflowGroup,
  displayName, downloadScenesZip, rejectedIdSet, starsByVideo, videoNumbers, workflowGroup,
} from './video-utils'

type Tab = WorkflowGroup | 'all'

export function VideoListPage() {
  const { data: videos, isLoading, error } = useVideos()
  const { data: feedback } = useAllFeedback()
  const markDownloaded = useMarkDownloaded()
  const toast = useToast()
  const approve = useApproveVideo()
  const unapprove = useUnapproveVideo()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('f') ?? 'new') as Tab
  const [q, setQ] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkReject, setBulkReject] = useState(false)

  const { data: allSchedules } = useSchedules()
  const ytLive = useMemo(
    () => new Set((allSchedules ?? []).filter((s) => s.state === 'scheduled' || s.state === 'published').map((s) => s.video_id)),
    [allSchedules],
  )
  const numbers = useMemo(() => videoNumbers(videos ?? []), [videos])
  const rejected = useMemo(() => rejectedIdSet(feedback), [feedback])
  const stars = useMemo(() => starsByVideo(feedback), [feedback])
  const groupOf = useMemo(() => {
    const m = new Map<string, WorkflowGroup>()
    for (const v of videos ?? []) m.set(v.id, workflowGroup(v, rejected))
    return m
  }, [videos, rejected])

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: videos?.length ?? 0, new: 0, approved: 0, submitted: 0, scheduled: 0, rejected: 0 }
    for (const g of groupOf.values()) c[g]++
    return c
  }, [videos, groupOf])

  const filtered = useMemo(() => {
    let list = videos ?? []
    if (tab !== 'all') list = list.filter((v) => groupOf.get(v.id) === tab)
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      list = list.filter((v) => v.slug.includes(needle) || (v.title ?? '').toLowerCase().includes(needle))
    }
    return list
  }, [videos, tab, q, groupOf])

  // "new" = never pulled to disk; the bulk button transfers files without passing a verdict
  const undownloaded = useMemo(
    () => (videos ?? []).filter((v) => groupOf.get(v.id) === 'new' && !v.downloaded_at),
    [videos, groupOf],
  )

  /* ————— multi-select ————— */
  const selVideos = useMemo(() => (videos ?? []).filter((v) => selected.has(v.id)), [videos, selected])

  function toggleSel(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const clearSel = () => setSelected(new Set())

  /** Sequentially ZIP each video (one file per video), marking downloaded. Returns how many finished. */
  async function downloadMany(list: Video[], t: number): Promise<number> {
    let done = 0
    for (const v of list) {
      toast.update(t, { detail: `${done + 1}/${list.length} — ${displayName(v, numbers.get(v.id))}` })
      const { data: scenes, error } = await supabase.from('scenes').select('*').eq('video_id', v.id).order('idx')
      if (error) throw new Error(error.message)
      await downloadScenesZip(v, (scenes ?? []) as Scene[], numbers.get(v.id))
      markDownloaded.mutate(v)
      done++
    }
    return done
  }

  async function bulkApprove() {
    const eligible = selVideos.filter((v) => v.status === 'ingested' && !rejected.has(v.id))
    const skipped = selVideos.length - eligible.length
    for (const v of eligible) if (!v.approved_at) approve.mutate(v) // optimistic — cards move now
    clearSel()
    const toDownload = eligible.filter((v) => !v.downloaded_at)
    setBulkBusy(true)
    const t = toast.push({ kind: 'progress', title: `Approving ${eligible.length}…` })
    try {
      const done = await downloadMany(toDownload, t)
      toast.update(t, {
        kind: 'ok',
        title: `Approved ${eligible.length}`,
        detail: [done ? `${done} downloaded` : 'all were already downloaded', skipped ? `${skipped} skipped (not awaiting a verdict)` : '']
          .filter(Boolean).join(' · '),
      })
    } catch (e) {
      toast.update(t, { kind: 'err', title: 'Approved, but a download failed', detail: (e as Error).message })
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkDownload() {
    const list = selVideos.filter((v) => !v.scenes_purged_at)
    const skipped = selVideos.length - list.length
    clearSel()
    setBulkBusy(true)
    const t = toast.push({ kind: 'progress', title: `Downloading ${list.length}…` })
    try {
      const done = await downloadMany(list, t)
      toast.update(t, { kind: 'ok', title: `Downloaded ${done}`, detail: skipped ? `${skipped} skipped (files purged)` : 'Each is its own ZIP.' })
    } catch (e) {
      toast.update(t, { kind: 'err', title: 'Download stopped', detail: (e as Error).message })
    } finally {
      setBulkBusy(false)
    }
  }

  function bulkBackToNew() {
    const eligible = selVideos.filter((v) => v.approved_at && v.status === 'ingested')
    for (const v of eligible) unapprove.mutate(v)
    toast.push({ kind: 'ok', title: `Moved ${eligible.length} back to New` })
    clearSel()
  }

  async function downloadAllNew() {
    setBulkBusy(true)
    const t = toast.push({ kind: 'progress', title: `Downloading ${undownloaded.length} new video${undownloaded.length === 1 ? '' : 's'}…` })
    let done = 0
    try {
      for (const v of undownloaded) {
        toast.update(t, { detail: `${done + 1}/${undownloaded.length} — ${displayName(v, numbers.get(v.id))}` })
        const { data: scenes, error } = await supabase.from('scenes').select('*').eq('video_id', v.id).order('idx')
        if (error) throw new Error(error.message)
        await downloadScenesZip(v, (scenes ?? []) as Scene[], numbers.get(v.id))
        markDownloaded.mutate(v)
        done++
      }
      toast.update(t, { kind: 'ok', title: `Downloaded ${done} video${done === 1 ? '' : 's'}`, detail: 'Each is its own ZIP.' })
    } catch (e) {
      toast.update(t, { kind: 'err', title: `Stopped after ${done}`, detail: (e as Error).message })
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Video Management"
        sub="Every video the factory delivers, organized by where it sits in your workflow."
        actions={
          <div className="flex items-center gap-2">
            {undownloaded.length > 0 && (
              <Button size="sm" variant="primary" disabled={bulkBusy} onClick={() => void downloadAllNew()}>
                {bulkBusy ? <Spinner className="h-3.5 w-3.5 text-[#04211d]" /> : `⬇ Download new (${undownloaded.length})`}
              </Button>
            )}
            <Input placeholder="Search videos…" value={q} onChange={(e) => setQ(e.target.value)} className="w-48" />
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {([...GROUP_ORDER, 'all'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setParams(t === 'new' ? {} : { f: t }, { replace: true })}
            className={[
              'rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-all duration-150 active:scale-95',
              tab === t ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
            ].join(' ')}
          >
            {t === 'all' ? 'All' : GROUP_META[t].short}
            <span className="ml-1.5 text-ink-faint">{counts[t]}</span>
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="sticky top-0 z-30 mb-5 flex flex-wrap items-center gap-2 rounded-(--radius-card) border border-accent/40 bg-surface/95 p-3 shadow-lg shadow-black/30 backdrop-blur animate-[fade-up_.15s_ease-out]">
          <span className="mr-1 text-[13px] font-semibold text-ink">{selected.size} selected</span>
          <Button size="sm" variant="primary" disabled={bulkBusy} onClick={() => void bulkApprove()}>✓ Approve</Button>
          <Button size="sm" disabled={bulkBusy} onClick={() => void bulkDownload()}>⬇ Download</Button>
          <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10" disabled={bulkBusy} onClick={() => setBulkReject(true)}>✕ Reject</Button>
          <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={bulkBackToNew}>↩ Back to New</Button>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(filtered.map((v) => v.id)))}>
            Select all {filtered.length} in view
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSel}>Clear</Button>
        </div>
      )}
      {bulkReject && selVideos.length > 0 && (
        <BulkRejectModal videos={selVideos} onClose={() => setBulkReject(false)} onDone={clearSel} />
      )}

      {isLoading && <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div>}
      {error && <p className="text-danger">Could not load videos: {(error as Error).message}</p>}

      {filtered.length === 0 && !isLoading && !error && (
        <Empty
          title={q ? 'Nothing matches' : tab === 'new' ? 'All caught up' : 'Nothing here'}
          hint={
            q ? 'Try another search.'
            : tab === 'new' ? 'Every delivered video has your verdict — new ones appear here automatically.'
            : 'Videos move here as they advance through your workflow.'
          }
        />
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {filtered.map((v) => (
          <VideoCard
            key={v.id}
            video={v}
            n={numbers.get(v.id)}
            group={groupOf.get(v.id) ?? 'new'}
            stars={stars.get(v.id)}
            isSelected={selected.has(v.id)}
            selectionActive={selected.size > 0}
            onToggleSelect={() => toggleSel(v.id)}
            ytLive={ytLive.has(v.id)}
          />
        ))}
      </div>
    </>
  )
}

const GROUP_BADGE: Record<WorkflowGroup, { tone: 'info' | 'warn' | 'accent' | 'ok' | 'danger'; label: string }> = {
  new: { tone: 'info', label: 'New' },
  approved: { tone: 'ok', label: 'Approved' },
  submitted: { tone: 'warn', label: 'Final uploaded' },
  scheduled: { tone: 'accent', label: 'Scheduled' },
  rejected: { tone: 'danger', label: 'Rejected' },
}

function VideoCard({ video: v, n, group, stars, isSelected, selectionActive, onToggleSelect, ytLive }: {
  video: Video
  n?: number
  group: WorkflowGroup
  stars?: number
  isSelected: boolean
  selectionActive: boolean
  onToggleSelect: () => void
  ytLive: boolean
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const markDownloaded = useMarkDownloaded()
  const unapprove = useUnapproveVideo()
  const undoReject = useUndoReject()
  const [playing, setPlaying] = useState(false)
  const [zipBusy, setZipBusy] = useState(false)
  const [wantScenes, setWantScenes] = useState(false)
  const { data: scenes } = useScenes(wantScenes || playing ? v.id : undefined)

  async function zip() {
    setZipBusy(true)
    const t = toast.push({ kind: 'progress', title: `Downloading ${displayName(v, n)}…` })
    try {
      setWantScenes(true)
      const list = scenes ?? ((await supabase.from('scenes').select('*').eq('video_id', v.id).order('idx')).data as Scene[] | null) ?? []
      await downloadScenesZip(v, list, n, (msg) => toast.update(t, { detail: msg }))
      markDownloaded.mutate(v)
      toast.update(t, { kind: 'ok', title: 'Downloaded', detail: displayName(v, n) })
    } catch (e) {
      toast.update(t, { kind: 'err', title: 'Download failed', detail: (e as Error).message })
    } finally {
      setZipBusy(false)
    }
  }

  const badge = group === 'scheduled' && v.status === 'published' ? { tone: 'ok' as const, label: STATUS_LABEL.published } : GROUP_BADGE[group]

  return (
    <>
      <Card className={[
        'group overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/30',
        isSelected ? 'border-accent/70 ring-1 ring-accent/40' : 'hover:border-line-strong',
      ].join(' ')}>
        <div className="relative block aspect-[9/16] w-full bg-raised" onMouseEnter={() => setWantScenes(true)}>
          <Poster video={v} className="h-full w-full object-cover" />
          <div className="absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {group === 'new' && v.downloaded_at && <Badge tone="muted">Already downloaded</Badge>}
          </div>
          {/* select checkbox — always shown once any selection is active */}
          <button
            aria-label={isSelected ? 'Deselect video' : 'Select video'}
            onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
            className={[
              'absolute right-2 top-2 z-30 flex h-6 w-6 items-center justify-center rounded-md border-2 shadow-sm transition-all duration-150 active:scale-90',
              isSelected
                ? 'border-accent bg-accent text-[#04211d] opacity-100'
                : 'border-white/80 bg-black/45 text-transparent hover:border-white',
              selectionActive || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            ].join(' ')}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </button>
          {/* hover overlay: big centered play, small actions underneath */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/55 opacity-0 backdrop-blur-[1px] transition-opacity duration-200 group-hover:opacity-100">
            <button
              aria-label="Play preview"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-black shadow-lg transition-transform duration-150 hover:scale-110 active:scale-95"
              onClick={() => setPlaying(true)}
            >
              <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
            </button>
            <div className="flex items-center gap-3">
              <button
                aria-label="Open"
                title="Open"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black transition-transform duration-150 hover:scale-110 hover:bg-white active:scale-95"
                onClick={() => navigate(`/videos/${v.slug}`)}
              >
                <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
                </svg>
              </button>
              <button
                aria-label="Download all scenes"
                title="Download all scenes (ZIP)"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black transition-transform duration-150 hover:scale-110 hover:bg-white active:scale-95 disabled:opacity-60"
                onClick={() => void zip()}
                disabled={zipBusy}
              >
                {zipBusy ? (
                  <Spinner className="h-4 w-4 text-black" />
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                )}
              </button>
              {group === 'approved' && (
                <button
                  aria-label="Move back to New"
                  title="Move back to New"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black transition-transform duration-150 hover:scale-110 hover:bg-white active:scale-95"
                  onClick={() => unapprove.mutate(v, { onSuccess: () => toast.push({ kind: 'ok', title: 'Moved back to New', detail: displayName(v, n) }) })}
                >
                  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
                  </svg>
                </button>
              )}
              {group === 'rejected' && (
                <button
                  aria-label="Undo rejection"
                  title="Undo rejection"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black transition-transform duration-150 hover:scale-110 hover:bg-white active:scale-95"
                  onClick={() => undoReject.mutate(v, { onSuccess: () => toast.push({ kind: 'ok', title: 'Rejection undone', detail: displayName(v, n) }) })}
                >
                  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-1 p-3">
          <Link to={`/videos/${v.slug}`} className="block truncate text-[13px] font-semibold text-ink transition-colors hover:text-accent">
            {displayName(v, n)}
          </Link>
          <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <span>{v.scene_count} scenes</span>
            <span>·</span>
            <span>{fmtDate(v.created_at)}</span>
            {stars ? <><span>·</span><Stars value={stars} /></> : null}
            {v.qc?.fail ? <><span>·</span><span className="text-warn">{v.qc.fail} QC flags</span></> : null}
            {(group === 'submitted' || group === 'scheduled') && (
              <span className="ml-auto inline-flex items-center gap-1.5">
                <span title={ytLive ? 'Scheduled on YouTube' : 'Not on YouTube yet'} className={ytLive ? 'text-[#ff4d5e]' : 'text-line-strong'}>
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M23 7.5a4 4 0 0 0-2.8-2.9C18.2 4 12 4 12 4s-6.2 0-8.2.6A4 4 0 0 0 1 7.5 42 42 0 0 0 .5 12 42 42 0 0 0 1 16.5a4 4 0 0 0 2.8 2.9c2 .6 8.2.6 8.2.6s6.2 0 8.2-.6a4 4 0 0 0 2.8-2.9A42 42 0 0 0 23.5 12 42 42 0 0 0 23 7.5zM9.8 15.3V8.7l6 3.3z" /></svg>
                </span>
                <span title={v.meta_scheduled_at ? 'Scheduled on Meta (FB+IG)' : 'Not on Meta yet — open the video to get the caption'} className={v.meta_scheduled_at ? 'text-[#4d94ff]' : 'text-line-strong'}>
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M6.9 5C4 5 1.5 8.2 1.5 12.4c0 2.6 1.2 4.6 3.3 4.6 1.9 0 3.1-1.5 4.6-4.4l1-1.9a58 58 0 0 1 1.2-2.2 41 41 0 0 1 1.3 2.4l1.5 2.8c1.4 2.4 2.6 3.3 4.2 3.3 2.1 0 3.4-1.8 3.4-4.7C22 8.1 19.4 5 16.6 5c-2 0-3.5 1.3-5 3.6C10.2 6.3 8.8 5 6.9 5zm-.2 2.4c1.1 0 2 .8 3.3 2.9-1.7 3.2-2.6 4.6-3.8 4.6-.9 0-1.5-.8-1.5-2.3 0-2.9 1-5.2 2-5.2zm10 0c1.2 0 2.2 2.2 2.2 5.1 0 1.6-.5 2.4-1.4 2.4-.9 0-1.4-.6-2.7-2.8l-1-1.8c1.2-1.9 2-2.9 2.9-2.9z" /></svg>
                </span>
              </span>
            )}
          </p>
        </div>
      </Card>
      {playing && (v.preview_path ? (
        <PreviewPlayer video={v} n={n} onClose={() => setPlaying(false)} />
      ) : (
        scenes && <SequencePlayer video={v} scenes={scenes} n={n} onClose={() => setPlaying(false)} />
      ))}
    </>
  )
}
