import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { signedUrl } from '@/lib/supabase'
import { useAddFeedback } from '@/lib/queries'
import { useApproveFlow } from './FeedbackWidgets'
import { useToast } from '@/components/toast'
import type { Scene, Video } from '@/lib/types'
import { Badge, Button, Spinner, Textarea } from '@/components/ui'
import { displayName } from './video-utils'

/* ————— guided review: one step per scene → the final cut → the verdict —————
   Every step is "video on the left, stars + a note on the right". Nothing saves until
   the verdict, so Back/Next never duplicates a row; the decision IS the commit.
   Approval (video.approved_at / a reject row) and the stars (a rating row) are stored
   as INDEPENDENT axes — so "approve + 5★" and "not-approve + 5★" are genuinely
   different records, exactly as Filipe asked. */

type Draft = { stars: number; note: string }
const blank = (): Draft => ({ stars: 0, note: '' })

export function ReviewWizard({ video, scenes, n, onClose }: {
  video: Video
  scenes: Scene[]
  n?: number
  onClose: () => void
}) {
  const orderedScenes = useMemo(() => [...scenes].sort((a, b) => a.idx - b.idx), [scenes])
  const hasFinal = !!video.final_path && !video.final_purged_at
  const verdictable = video.status === 'ingested'

  // step list: scene-<idx> … then 'final' (if any) … then 'decision'
  const steps = useMemo(
    () => [
      ...orderedScenes.map((s) => ({ kind: 'scene' as const, scene: s })),
      ...(hasFinal ? [{ kind: 'final' as const }] : []),
      { kind: 'decision' as const },
    ],
    [orderedScenes, hasFinal],
  )

  const [i, setI] = useState(0)
  const [sceneDrafts, setSceneDrafts] = useState<Record<number, Draft>>({})
  const [finalDraft, setFinalDraft] = useState<Draft>(blank)
  const [overall, setOverall] = useState<Draft>(blank)
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const [saving, setSaving] = useState(false)

  const add = useAddFeedback()
  const approveFlow = useApproveFlow()
  const toast = useToast()

  const step = steps[i]
  const total = steps.length
  const isLast = i === total - 1

  // signed URL for whichever clip this step shows (one hook, keyed by the path)
  const path = step.kind === 'scene' ? step.scene.storage_path : step.kind === 'final' ? video.final_path : null
  const { data: url } = useQuery({
    queryKey: ['review-clip', path],
    enabled: !!path,
    staleTime: 45 * 60_000,
    queryFn: () => signedUrl(path!, 3600),
  })

  function sceneDraft(idx: number) { return sceneDrafts[idx] ?? blank() }
  function patchScene(idx: number, d: Partial<Draft>) {
    setSceneDrafts((p) => ({ ...p, [idx]: { ...(p[idx] ?? blank()), ...d } }))
  }

  const enteredCount =
    Object.values(sceneDrafts).filter((d) => d.stars || d.note.trim()).length +
    (finalDraft.stars || finalDraft.note.trim() ? 1 : 0)

  async function commit() {
    setSaving(true)
    try {
      // per-scene: one row carrying stars + note (feedback-read prints comment for any kind)
      for (const s of orderedScenes) {
        const d = sceneDrafts[s.idx]
        if (d && (d.stars || d.note.trim())) {
          await add.mutateAsync({
            video_id: video.id,
            kind: d.stars ? 'rating' : 'note',
            target: 'scene',
            scene_id: s.id,
            scene_idx: s.idx,
            stars: d.stars || undefined,
            comment: d.note.trim() || undefined,
          })
        }
      }
      if (hasFinal && (finalDraft.stars || finalDraft.note.trim())) {
        await add.mutateAsync({
          video_id: video.id,
          kind: finalDraft.stars ? 'rating' : 'note',
          target: 'final',
          stars: finalDraft.stars || undefined,
          comment: finalDraft.note.trim() || undefined,
        })
      }
      // overall stars — an independent video-level rating (kept even on not-approve)
      if (overall.stars || overall.note.trim()) {
        await add.mutateAsync({
          video_id: video.id,
          kind: overall.stars ? 'rating' : 'note',
          target: 'video',
          stars: overall.stars || undefined,
          comment: overall.note.trim() || undefined,
        })
      }
      // the verdict (only when the video is still awaiting one)
      if (verdictable && decision === 'reject') {
        await add.mutateAsync({
          video_id: video.id,
          kind: 'reject',
          comment: overall.note.trim() || 'Not approved — see the per-scene notes.',
        })
      }

      // approve is handled by approveFlow (it sets approved_at + downloads + toasts once);
      // every other path gets its own confirmation toast here.
      const approving = verdictable && decision === 'approve'
      if (!approving) {
        toast.push({
          kind: 'ok',
          title: decision === 'reject' ? 'Saved — not approved' : 'Review saved',
          detail: `${displayName(video, n)} · ${enteredCount + (overall.stars || overall.note.trim() ? 1 : 0)} rating${enteredCount === 1 ? '' : 's'} recorded`,
        })
      }
      onClose()
      if (approving) void approveFlow(video, n) // runs after close so the toast stack is clean
    } catch (e) {
      toast.push({ kind: 'err', title: 'Could not save the review', detail: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const stepLabel =
    step.kind === 'scene' ? `Scene ${step.scene.idx}` : step.kind === 'final' ? 'Final edit' : 'Your verdict'

  return (
    <div className="fixed inset-0 z-50 flex bg-black/75 p-0 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-4">
      <div className="flex h-full w-full flex-col overflow-hidden bg-surface shadow-2xl shadow-black/40 sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-(--radius-card) sm:border sm:border-line">
        {/* header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-caption uppercase tracking-wider text-ink-faint">Reviewing · {displayName(video, n)}</p>
            <h2 className="truncate text-h3 text-ink">{stepLabel}</h2>
          </div>
          <Badge tone="muted">{i + 1} / {total}</Badge>
          <button
            onClick={onClose}
            aria-label="Close review"
            className="rounded-(--radius-control) p-2 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {/* progress */}
        <div className="flex shrink-0 gap-1 px-4 pt-3 sm:px-5">
          {steps.map((s, idx) => (
            <div
              key={idx}
              className={[
                'h-1 flex-1 rounded-full transition-colors',
                idx < i ? 'bg-accent' : idx === i ? 'bg-accent/60' : 'bg-line',
              ].join(' ')}
              title={s.kind === 'scene' ? `Scene ${s.scene.idx}` : s.kind === 'final' ? 'Final' : 'Verdict'}
            />
          ))}
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {step.kind === 'decision' ? (
            <DecisionStep
              video={video}
              verdictable={verdictable}
              overall={overall}
              setOverall={setOverall}
              decision={decision}
              setDecision={setDecision}
            />
          ) : (
            <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-start">
              {/* video — sized by HEIGHT (capped) so the whole step fits the viewport without
                  scrolling; width follows the 9:16 aspect from that height. */}
              <div className="flex justify-center md:block">
                <div
                  className="overflow-hidden rounded-(--radius-control) border border-line bg-black"
                  style={{ height: 'min(58vh, 500px)', aspectRatio: '9 / 16' }}
                >
                  {path && url ? (
                    <video src={url} controls autoPlay playsInline preload="metadata" className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center px-3 text-center text-small text-ink-faint">
                      {path ? <Spinner /> : 'clip purged — master on the PC'}
                    </div>
                  )}
                </div>
              </div>

              {/* rating + note */}
              <div className="space-y-4">
                {step.kind === 'scene' && step.scene.spoken && (
                  <p className="rounded-(--radius-control) border border-line bg-raised/50 p-3 text-body italic leading-relaxed text-ink-muted">
                    “{step.scene.spoken}”
                  </p>
                )}
                <div>
                  <label className="mb-2 block text-small font-medium text-ink-muted">How is this {step.kind === 'final' ? 'final cut' : 'scene'}?</label>
                  <StarPicker
                    value={step.kind === 'scene' ? sceneDraft(step.scene.idx).stars : finalDraft.stars}
                    onChange={(v) =>
                      step.kind === 'scene' ? patchScene(step.scene.idx, { stars: v }) : setFinalDraft((d) => ({ ...d, stars: v }))
                    }
                  />
                </div>
                <div>
                  <label className="mb-2 block text-small font-medium text-ink-muted">What works, what doesn’t? <span className="text-ink-faint">(optional)</span></label>
                  <Textarea
                    rows={5}
                    value={step.kind === 'scene' ? sceneDraft(step.scene.idx).note : finalDraft.note}
                    onChange={(e) =>
                      step.kind === 'scene'
                        ? patchScene(step.scene.idx, { note: e.target.value })
                        : setFinalDraft((d) => ({ ...d, note: e.target.value }))
                    }
                    placeholder={
                      step.kind === 'final'
                        ? 'The whole cut: pacing, trims, zooms, captions, voice, music…'
                        : `What stands out in scene ${step.kind === 'scene' ? step.scene.idx : ''}? Framing, wardrobe, expression, the line…`
                    }
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <div className="flex items-center gap-2">
            {i > 0 && <Button variant="secondary" onClick={() => setI((v) => v - 1)} disabled={saving}>← Back</Button>}
            {!isLast ? (
              <Button variant="primary" onClick={() => setI((v) => v + 1)}>
                {step.kind === 'scene' && steps[i + 1]?.kind === 'scene' ? `Scene ${(steps[i + 1] as { scene: Scene }).scene.idx} →` : 'Next →'}
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={saving || (verdictable && !decision)}
                onClick={() => void commit()}
              >
                {saving ? 'Saving…' : verdictable ? 'Finish & submit verdict' : 'Save review'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ————— the verdict step: two independent axes ————— */
function DecisionStep({ video, verdictable, overall, setOverall, decision, setDecision }: {
  video: Video
  verdictable: boolean
  overall: Draft
  setOverall: React.Dispatch<React.SetStateAction<Draft>>
  decision: 'approve' | 'reject' | null
  setDecision: (d: 'approve' | 'reject') => void
}) {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h3 className="text-h3 text-ink">Overall quality</h3>
        <p className="mt-1 text-small text-ink-faint">Craft rating for the whole video — separate from whether you’d publish it.</p>
        <div className="mt-3"><StarPicker value={overall.stars} onChange={(v) => setOverall((d) => ({ ...d, stars: v }))} /></div>
      </div>

      <div>
        <label className="mb-2 block text-small font-medium text-ink-muted">Overall note <span className="text-ink-faint">(optional — the summary the factory learns from)</span></label>
        <Textarea rows={4} value={overall.note} onChange={(e) => setOverall((d) => ({ ...d, note: e.target.value }))} placeholder="The big picture: what would make this a keeper?" />
      </div>

      {verdictable ? (
        <div>
          <h3 className="text-h3 text-ink">Your call</h3>
          <p className="mt-1 text-small text-ink-faint">
            Independent of the stars — “approve + 5★” and “not-approve + 5★” are recorded as different signals.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={() => setDecision('approve')}
              className={[
                'rounded-(--radius-card) border p-4 text-left transition-all',
                decision === 'approve' ? 'border-accent bg-accent/10 ring-2 ring-accent/40' : 'border-line bg-raised/40 hover:border-line-strong',
              ].join(' ')}
            >
              <p className="flex items-center gap-2 text-lead font-semibold text-ink"><span className="text-accent">✓</span> Approve</p>
              <p className="mt-1 text-small text-ink-faint">Good to publish{video.downloaded_at ? '' : ' — I’ll download the scenes'}.</p>
            </button>
            <button
              onClick={() => setDecision('reject')}
              className={[
                'rounded-(--radius-card) border p-4 text-left transition-all',
                decision === 'reject' ? 'border-danger bg-danger/10 ring-2 ring-danger/40' : 'border-line bg-raised/40 hover:border-line-strong',
              ].join(' ')}
            >
              <p className="flex items-center gap-2 text-lead font-semibold text-ink"><span className="text-danger">✕</span> Not approve</p>
              <p className="mt-1 text-small text-ink-faint">Don’t publish. Stars still say how close it was.</p>
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-(--radius-control) border border-line bg-raised/40 p-3">
          <p className="text-small text-ink-muted">
            This video is <Badge tone="muted">{video.status}</Badge> — the approve / reject verdict isn’t available, but your ratings and notes are saved for the factory.
          </p>
        </div>
      )}
    </div>
  )
}

/* ————— reusable star input ————— */
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <div className="flex items-center gap-1.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((iStar) => (
        <button
          key={iStar}
          type="button"
          aria-label={`${iStar} of 5`}
          title={iStar === 1 ? '1 — bad, but almost there' : `${iStar} of 5`}
          onMouseEnter={() => setHover(iStar)}
          onClick={() => onChange(iStar === value ? 0 : iStar)}
          className="p-1 transition-transform duration-100 hover:scale-110 active:scale-95"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-8 w-8 transition-colors duration-100 ${iStar <= shown ? 'text-warn' : 'text-line-strong'}`}
            fill={iStar <= shown ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          >
            <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
          </svg>
        </button>
      ))}
      <span className="ml-2 text-small text-ink-faint">{value ? `${value}/5` : 'tap to rate'}</span>
    </div>
  )
}
