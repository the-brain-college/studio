import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { signedUrl } from '@/lib/supabase'
import type { Scene, Video } from '@/lib/types'
import { Spinner } from '@/components/ui'
import { VerdictBar } from './FeedbackWidgets'
import { prettyName } from './video-utils'

/**
 * Plays a video's scenes back to back: spoken line as a plain caption below,
 * "Scene N" identifier top-right (white background, black text).
 */
export function SequencePlayer({ video, scenes, n, onClose }: { video: Video; scenes: Scene[]; n?: number; onClose: () => void }) {
  const playable = scenes.filter((s) => s.storage_path).sort((a, b) => a.idx - b.idx)
  const [i, setI] = useState(0)
  const current = playable[i]

  const { data: url } = useQuery({
    queryKey: ['seq-url', current?.id],
    enabled: !!current,
    staleTime: 30 * 60_000,
    queryFn: () => signedUrl(current.storage_path!, 3600),
  })

  useEffect(() => setI(0), [video.id])

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 focus:outline-none">
          <Dialog.Title className="sr-only">{prettyName(video)}</Dialog.Title>
          <div className="overflow-hidden rounded-(--radius-card) border border-line bg-surface">
            <div className="relative aspect-[9/16] w-full bg-black">
              {current && url ? (
                <video
                  key={current.id}
                  src={url}
                  autoPlay
                  controls
                  className="h-full w-full object-contain"
                  onEnded={() => {
                    if (i < playable.length - 1) setI(i + 1)
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  {playable.length === 0 ? (
                    <p className="px-6 text-center text-[13px] text-ink-faint">Scene files purged — masters are on the factory PC.</p>
                  ) : (
                    <Spinner className="h-6 w-6" />
                  )}
                </div>
              )}
              {current && (
                <span className="absolute right-2 top-2 rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-black">
                  Scene {current.idx}
                </span>
              )}
              <button
                className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[12px] text-white hover:bg-black/80"
                onClick={onClose}
              >
                ✕ Close
              </button>
            </div>
            <VerdictBar video={video} n={n} />
            <div className="space-y-1 p-3">
              {current?.spoken && <p className="text-[13px] leading-relaxed text-ink">“{current.spoken}”</p>}
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-ink-faint">{prettyName(video)} · scene {i + 1} of {playable.length}</p>
                <div className="flex gap-1">
                  {playable.map((s, idx) => (
                    <button
                      key={s.id}
                      onClick={() => setI(idx)}
                      className={`h-1.5 w-5 rounded-full ${idx === i ? 'bg-accent' : 'bg-line-strong hover:bg-ink-faint'}`}
                      aria-label={`Scene ${s.idx}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
