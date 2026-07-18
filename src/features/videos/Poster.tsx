import { useQuery } from '@tanstack/react-query'
import { signedUrl } from '@/lib/supabase'
import type { Video } from '@/lib/types'

export function Poster({ video, className }: { video: Video; className?: string }) {
  const { data: url } = useQuery({
    queryKey: ['poster', video.thumb_path],
    enabled: !!video.thumb_path,
    staleTime: 45 * 60_000,
    queryFn: () => signedUrl(video.thumb_path!, 3600),
  })
  if (!video.thumb_path || !url) {
    return (
      <div className={`flex items-center justify-center text-ink-faint ${className ?? ''}`}>
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m10 9 5 3-5 3z" />
        </svg>
      </div>
    )
  }
  return <img src={url} alt={video.slug} className={className} loading="lazy" />
}
