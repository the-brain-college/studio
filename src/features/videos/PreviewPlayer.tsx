import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { signedUrl } from '@/lib/supabase'
import type { Video } from '@/lib/types'
import { Spinner } from '@/components/ui'
import { VerdictBar } from './FeedbackWidgets'
import { prettyName } from './video-utils'

/**
 * Plays the factory-made preview reel: one real low-res video of all scenes with burned
 * captions. A pre-edit preview — never the production cut.
 */
export function PreviewPlayer({ video, n, onClose }: { video: Video; n?: number; onClose: () => void }) {
  const { data: url } = useQuery({
    queryKey: ['preview-url', video.preview_path],
    enabled: !!video.preview_path,
    staleTime: 30 * 60_000,
    queryFn: () => signedUrl(video.preview_path!, 3600),
  })

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[94dvh] w-auto max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto focus:outline-none">
          <Dialog.Title className="sr-only">{prettyName(video)}</Dialog.Title>
          <div className="overflow-hidden rounded-(--radius-card) border border-line bg-surface">
            {/* height-driven (not width-driven) so the whole card — video + verdict + caption —
                always fits a short/landscape phone without clipping the controls below */}
            <div className="relative mx-auto bg-black" style={{ height: 'min(64dvh, 540px)', aspectRatio: '9 / 16', maxWidth: '94vw' }}>
              {url ? (
                <video src={url} autoPlay controls className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center"><Spinner className="h-6 w-6" /></div>
              )}
              <button
                className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[12px] text-white hover:bg-black/80"
                onClick={onClose}
              >
                ✕ Close
              </button>
            </div>
            <VerdictBar video={video} n={n} />
            <p className="px-3 pb-3 pt-2 text-[11px] text-ink-faint">
              Preview reel (low quality, auto captions) — not the production cut. Download the scenes for editing.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
