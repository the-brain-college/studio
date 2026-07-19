import { useState } from 'react'
import { useMarkMetaScheduled, useSchedules, useUnmarkMetaScheduled } from '@/lib/queries'
import { useToast } from '@/components/toast'
import type { Video } from '@/lib/types'
import { fmtLisbon } from '@/lib/time'
import { Badge, Button, Card } from '@/components/ui'
import { prettyName } from './video-utils'

/**
 * Per-platform publishing state. YouTube is automatic (Submit & schedule).
 * Meta = FB + IG paired: the factory writes the caption, Filipe copies it into
 * Meta Business Suite, schedules both there, and marks it here. Reversible.
 */
export function PlatformsCard({ video }: { video: Video }) {
  const { data: schedules } = useSchedules(video.id)
  const [metaOpen, setMetaOpen] = useState(false)
  const ytLive = schedules?.some((s) => s.state === 'scheduled' || s.state === 'published')
  const metaDone = !!video.meta_scheduled_at

  if (video.status === 'ingested') return null

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-[15px] font-semibold">Platforms</h2>
      <p className="mb-4 text-[12px] text-ink-muted">Colored = scheduled on that platform.</p>
      <div className="flex items-center gap-3">
        <PlatformIcon
          label="YouTube — automatic via Submit & schedule"
          active={!!ytLive}
          activeClass="bg-[#ff0033]/15 text-[#ff4d5e] border-[#ff0033]/40"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M23 7.5a4 4 0 0 0-2.8-2.9C18.2 4 12 4 12 4s-6.2 0-8.2.6A4 4 0 0 0 1 7.5 42 42 0 0 0 .5 12 42 42 0 0 0 1 16.5a4 4 0 0 0 2.8 2.9c2 .6 8.2.6 8.2.6s6.2 0 8.2-.6a4 4 0 0 0 2.8-2.9A42 42 0 0 0 23.5 12 42 42 0 0 0 23 7.5zM9.8 15.3V8.7l6 3.3z" /></svg>
        </PlatformIcon>
        <button onClick={() => setMetaOpen(true)} className="group/meta" aria-label="Meta (Facebook + Instagram) scheduling">
          <PlatformIcon
            label={metaDone ? `Meta — scheduled ${fmtLisbon(video.meta_scheduled_at!, {})}` : 'Meta (FB + IG) — press to get the caption'}
            active={metaDone}
            activeClass="bg-[#0866ff]/15 text-[#4d94ff] border-[#0866ff]/45"
            interactive
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M6.9 5C4 5 1.5 8.2 1.5 12.4c0 2.6 1.2 4.6 3.3 4.6 1.9 0 3.1-1.5 4.6-4.4l1-1.9a58 58 0 0 1 1.2-2.2 41 41 0 0 1 1.3 2.4l1.5 2.8c1.4 2.4 2.6 3.3 4.2 3.3 2.1 0 3.4-1.8 3.4-4.7C22 8.1 19.4 5 16.6 5c-2 0-3.5 1.3-5 3.6C10.2 6.3 8.8 5 6.9 5zm-.2 2.4c1.1 0 2 .8 3.3 2.9-1.7 3.2-2.6 4.6-3.8 4.6-.9 0-1.5-.8-1.5-2.3 0-2.9 1-5.2 2-5.2zm10 0c1.2 0 2.2 2.2 2.2 5.1 0 1.6-.5 2.4-1.4 2.4-.9 0-1.4-.6-2.7-2.8l-1-1.8c1.2-1.9 2-2.9 2.9-2.9z" /></svg>
          </PlatformIcon>
        </button>
      </div>
      {metaOpen && <MetaModal video={video} onClose={() => setMetaOpen(false)} />}
    </Card>
  )
}

function PlatformIcon({ children, label, active, activeClass, interactive }: {
  children: React.ReactNode
  label: string
  active: boolean
  activeClass: string
  interactive?: boolean
}) {
  return (
    <span
      title={label}
      className={[
        'flex h-11 w-11 items-center justify-center rounded-(--radius-control) border transition-all duration-150',
        active ? activeClass : 'border-line bg-raised text-ink-faint',
        interactive ? 'cursor-pointer hover:scale-105 hover:border-line-strong active:scale-95' : '',
      ].join(' ')}
    >
      {children}
    </span>
  )
}

function MetaModal({ video, onClose }: { video: Video; onClose: () => void }) {
  const mark = useMarkMetaScheduled()
  const unmark = useUnmarkMetaScheduled()
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const caption = video.meta_caption
    ?? [video.title, 'Follow for daily brain-health tips 🧠', '#brainhealth #memory #focus #longevity'].filter(Boolean).join('\n\n')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <Card className="max-h-[90dvh] w-full max-w-lg overflow-y-auto p-6 animate-[fade-up_.18s_ease-out]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold">Schedule on Meta — {prettyName(video)}</h2>
          {video.meta_scheduled_at && <Badge tone="ok">scheduled</Badge>}
        </div>
        <p className="mb-4 text-[12px] leading-relaxed text-ink-muted">
          FB and IG are paired: copy this caption, schedule both in Meta Business Suite at the same
          time, then mark it done here.
        </p>
        <div className="rounded-(--radius-control) border border-line bg-raised p-3">
          {/* header row keeps the Copy button off the caption text (no overlap at any width) */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Caption</span>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => {
                void navigator.clipboard.writeText(caption)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? '✓ Copied' : 'Copy caption'}
            </Button>
          </div>
          <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{caption}</p>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <a
            className="text-[12px] text-accent hover:underline"
            href="https://business.facebook.com/latest/planner"
            target="_blank"
            rel="noreferrer"
          >
            Open Meta Business Suite ↗
          </a>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            {video.meta_scheduled_at ? (
              <Button
                variant="ghost"
                disabled={unmark.isPending}
                onClick={() => unmark.mutate(video, { onSuccess: () => { toast.push({ kind: 'ok', title: 'Meta schedule unmarked' }); onClose() } })}
              >
                ↩ Unmark
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={mark.isPending}
                onClick={() => mark.mutate(video, { onSuccess: () => { toast.push({ kind: 'ok', title: 'Marked as scheduled on Meta', detail: prettyName(video) }); onClose() } })}
              >
                ✓ Scheduled in Meta
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
