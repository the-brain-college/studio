import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAddFeedback, useAllFeedback, useApproveVideo, useMarkDownloaded, useUnapproveVideo, useUndoReject } from '@/lib/queries'
import { useToast } from '@/components/toast'
import type { Feedback, Scene, Video } from '@/lib/types'
import { fmtDate } from '@/lib/time'
import { Badge, Button, Card, Textarea } from '@/components/ui'
import { displayName, downloadScenesZip } from './video-utils'

/* ————— the approve flow: verdict lands instantly, the download follows in a toast ————— */

export function useApproveFlow() {
  const toast = useToast()
  const approve = useApproveVideo()
  const markDl = useMarkDownloaded()

  return async (video: Video, n?: number) => {
    approve.mutate(video) // optimistic — the card moves to Approved right now
    if (video.downloaded_at) {
      toast.push({ kind: 'ok', title: 'Approved', detail: `${displayName(video, n)} — already downloaded` })
      return
    }
    const t = toast.push({ kind: 'progress', title: `Downloading ${displayName(video, n)}…` })
    try {
      const { data: scenes, error } = await supabase.from('scenes').select('*').eq('video_id', video.id).order('idx')
      if (error) throw new Error(error.message)
      await downloadScenesZip(video, (scenes ?? []) as Scene[], n, (msg) => toast.update(t, { detail: msg }))
      markDl.mutate(video)
      toast.update(t, { kind: 'ok', title: 'Approved & downloaded', detail: displayName(video, n) })
    } catch (e) {
      toast.update(t, { kind: 'err', title: 'Download failed — still approved', detail: (e as Error).message })
    }
  }
}

/* ————— stars ————— */

export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className ?? ''}`} title={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon key={i} filled={i <= value} className="h-3.5 w-3.5" />
      ))}
    </span>
  )
}

/** Interactive 1–5 rating. 1 star = "passes, but not that good". */
export function StarRating({ video, current }: { video: Video; current?: number }) {
  const add = useAddFeedback()
  const [hover, setHover] = useState(0)
  const shown = hover || current || 0
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          aria-label={`Rate ${i} of 5`}
          title={i === 1 ? '1 — passes, but not that good' : `${i} of 5`}
          disabled={add.isPending}
          onMouseEnter={() => setHover(i)}
          onClick={() => add.mutate({ video_id: video.id, kind: 'rating', stars: i })}
          className="p-0.5 transition-transform duration-100 hover:scale-110 active:scale-95"
        >
          <StarIcon filled={i <= shown} className="h-5 w-5" />
        </button>
      ))}
      {current ? <span className="ml-1 text-[11px] text-ink-faint">{current}/5</span> : <span className="ml-1 text-[11px] text-ink-faint">rate</span>}
    </div>
  )
}

function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className ?? ''} transition-colors duration-100 ${filled ? 'text-warn' : 'text-line-strong'}`} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  )
}

/* ————— reject + undo ————— */

export function RejectControl({ video, rejected }: { video: Video; rejected: boolean }) {
  const [open, setOpen] = useState(false)
  const undo = useUndoReject()
  const toast = useToast()
  if (rejected) {
    return (
      <span className="inline-flex items-center gap-2">
        <Badge tone="danger">Rejected</Badge>
        <Button
          size="sm" variant="ghost"
          disabled={undo.isPending}
          onClick={() => undo.mutate(video, { onSuccess: () => toast.push({ kind: 'ok', title: 'Rejection undone', detail: displayName(video) }) })}
        >
          ↩ Undo
        </Button>
      </span>
    )
  }
  return (
    <>
      <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10" onClick={() => setOpen(true)}>
        ✕ Reject
      </Button>
      {open && <RejectModal video={video} onClose={() => setOpen(false)} />}
    </>
  )
}

function RejectModal({ video, onClose }: { video: Video; onClose: () => void }) {
  const add = useAddFeedback()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function submit() {
    if (!reason.trim()) {
      setErr('Say why — the reason is what the factory learns from.')
      return
    }
    add.mutate({ video_id: video.id, kind: 'reject', comment: reason.trim() })
    toast.push({ kind: 'ok', title: 'Rejected', detail: `${displayName(video)} — the factory will read your reason` })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <Card className="w-full max-w-lg p-6 animate-[fade-up_.18s_ease-out]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-semibold">Reject this video</h2>
        <p className="mb-4 mt-1 text-[12px] leading-relaxed text-ink-muted">
          Explain what is wrong. This goes straight into the factory's feedback store — the team reads it,
          verifies understanding with you, and fixes the system so it never happens again. You can undo a
          rejection at any time.
        </p>
        <Textarea
          autoFocus
          rows={5}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What's wrong with it? Be as specific as you like — scene numbers, what you expected, what you got…"
        />
        {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={add.isPending} onClick={submit}>
            Reject video
          </Button>
        </div>
      </Card>
    </div>
  )
}

/** One reason, many videos — bulk rejection from the multi-select bar. */
export function BulkRejectModal({ videos, onClose, onDone }: { videos: Video[]; onClose: () => void; onDone?: () => void }) {
  const add = useAddFeedback()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function submit() {
    if (!reason.trim()) {
      setErr('Say why — the reason is what the factory learns from.')
      return
    }
    for (const v of videos) add.mutate({ video_id: v.id, kind: 'reject', comment: reason.trim() })
    toast.push({ kind: 'ok', title: `Rejected ${videos.length} video${videos.length === 1 ? '' : 's'}`, detail: 'The factory will read your reason' })
    onDone?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <Card className="w-full max-w-lg p-6 animate-[fade-up_.18s_ease-out]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[16px] font-semibold">Reject {videos.length} video{videos.length === 1 ? '' : 's'}</h2>
        <p className="mb-4 mt-1 text-[12px] leading-relaxed text-ink-muted">
          One reason, applied to every selected video. It goes straight into the factory's feedback store.
          You can undo any rejection later.
        </p>
        <Textarea
          autoFocus
          rows={5}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What's wrong with them? Be as specific as you like…"
        />
        {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={add.isPending} onClick={submit}>
            Reject {videos.length}
          </Button>
        </div>
      </Card>
    </div>
  )
}

/* ————— verdict bar: lives inside the players — watch, then decide ————— */

export function VerdictBar({ video, n }: { video: Video; n?: number }) {
  const approveFlow = useApproveFlow()
  const unapprove = useUnapproveVideo()
  const toast = useToast()
  const { data: feedback } = useAllFeedback()
  const rejected = (feedback ?? []).some((f) => f.video_id === video.id && f.kind === 'reject' && !f.retracted_at)
  const verdictable = video.status === 'ingested'

  if (!verdictable) return null
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2.5">
      {rejected ? (
        <RejectControl video={video} rejected />
      ) : video.approved_at ? (
        <span className="inline-flex items-center gap-2">
          <Badge tone="ok">Approved</Badge>
          {video.downloaded_at && <Badge tone="muted">Already downloaded</Badge>}
          <Button
            size="sm" variant="ghost"
            onClick={() => unapprove.mutate(video, { onSuccess: () => toast.push({ kind: 'ok', title: 'Moved back to New', detail: displayName(video, n) }) })}
          >
            ↩ Back to New
          </Button>
        </span>
      ) : (
        <>
          <Button size="sm" variant="primary" onClick={() => void approveFlow(video, n)}>
            ✓ Approve{video.downloaded_at ? '' : ' & download'}
          </Button>
          <span className="inline-flex items-center gap-2">
            {video.downloaded_at && <Badge tone="muted">Already downloaded</Badge>}
            <RejectControl video={video} rejected={false} />
          </span>
        </>
      )}
    </div>
  )
}

/* ————— per-video feedback panel (detail page) ————— */

export function FeedbackCard({ video, n, feedback }: { video: Video; n?: number; feedback: Feedback[] }) {
  const add = useAddFeedback()
  const [note, setNote] = useState('')
  const own = feedback.filter((f) => f.video_id === video.id)
  const rejected = own.some((f) => f.kind === 'reject' && !f.retracted_at)
  const rating = own.find((f) => f.kind === 'rating' && f.stars)
  const approveFlow = useApproveFlow()
  const unapprove = useUnapproveVideo()
  const toast = useToast()

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Your verdict</h2>
        <RejectControl video={video} rejected={rejected} />
      </div>

      {video.status === 'ingested' && !rejected && (
        <div className="mb-4">
          {video.approved_at ? (
            <p className="flex flex-wrap items-center gap-2">
              <Badge tone="ok">Approved</Badge>
              {video.downloaded_at && <Badge tone="muted">Already downloaded</Badge>}
              <Button
                size="sm" variant="ghost"
                onClick={() => unapprove.mutate(video, { onSuccess: () => toast.push({ kind: 'ok', title: 'Moved back to New', detail: displayName(video, n) }) })}
              >
                ↩ Back to New
              </Button>
            </p>
          ) : (
            <Button variant="primary" size="sm" onClick={() => void approveFlow(video, n)}>
              ✓ Approve{video.downloaded_at ? '' : ' & download'}
            </Button>
          )}
        </div>
      )}

      <div className="mb-4">
        <StarRating video={video} current={rating?.stars ?? undefined} />
      </div>

      <div className="space-y-2">
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Drop a note on this video — the factory reads every one…"
        />
        {note.trim() && (
          <Button
            size="sm"
            variant="primary"
            disabled={add.isPending}
            onClick={() => add.mutate({ video_id: video.id, kind: 'note', comment: note.trim() }, { onSuccess: () => setNote('') })}
          >
            {add.isPending ? 'Saving…' : 'Save note'}
          </Button>
        )}
      </div>

      {own.length > 0 && (
        <ul className="mt-4 space-y-3 border-t border-line pt-4">
          {own.map((f) => (
            <FeedbackRow key={f.id} f={f} />
          ))}
        </ul>
      )}
    </Card>
  )
}

export function FeedbackRow({ f }: { f: Feedback }) {
  return (
    <li className={`text-[12px] ${f.retracted_at ? 'opacity-55' : ''}`}>
      <p className="flex flex-wrap items-center gap-2">
        {f.kind === 'reject' && <Badge tone="danger">rejected</Badge>}
        {f.kind === 'rating' && f.stars && <Stars value={f.stars} />}
        {f.kind === 'note' && <Badge tone="info">note</Badge>}
        {f.target === 'scene' && <Badge tone="accent">scene {f.scene_idx ?? '?'}</Badge>}
        {f.target === 'final' && <Badge tone="accent">final cut</Badge>}
        {f.retracted_at && <Badge tone="muted">undone</Badge>}
        <span className="text-ink-faint">{fmtDate(f.created_at)}</span>
        {!f.retracted_at && (f.acknowledged_at ? (
          <Badge tone="ok">seen by the factory</Badge>
        ) : (
          <Badge tone="muted">awaiting the factory</Badge>
        ))}
      </p>
      {f.comment && <p className={`mt-1 whitespace-pre-wrap leading-relaxed text-ink-muted ${f.retracted_at ? 'line-through' : ''}`}>{f.comment}</p>}
    </li>
  )
}
