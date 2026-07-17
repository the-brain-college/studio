import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAllFeedback, useVideos } from '@/lib/queries'
import type { Feedback, Video } from '@/lib/types'
import { Badge, Card, Empty, PageHeader, Spinner } from '@/components/ui'
import { FeedbackRow } from '../videos/FeedbackWidgets'
import { displayName, videoNumbers } from '../videos/video-utils'

export function FeedbackPage() {
  const { data: feedback, isLoading } = useAllFeedback()
  const { data: videos } = useVideos()
  const numbers = useMemo(() => videoNumbers(videos ?? []), [videos])
  const byId = useMemo(() => new Map((videos ?? []).map((v) => [v.id, v])), [videos])

  const grouped = useMemo(() => {
    const m = new Map<string, Feedback[]>()
    for (const f of feedback ?? []) {
      const list = m.get(f.video_id) ?? []
      list.push(f)
      m.set(f.video_id, list)
    }
    // newest activity first
    return [...m.entries()].sort((a, b) => b[1][0].created_at.localeCompare(a[1][0].created_at))
  }, [feedback])

  const unacked = (feedback ?? []).filter((f) => !f.acknowledged_at).length

  return (
    <>
      <PageHeader
        title="Feedback"
        sub="Everything you told the factory about its videos — rejections, ratings, notes. The factory reads this, verifies understanding with you, and turns it into permanent fixes."
        actions={unacked > 0 ? <Badge tone="warn">{unacked} awaiting the factory</Badge> : <Badge tone="ok">all processed</Badge>}
      />

      {isLoading && <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div>}

      {!isLoading && grouped.length === 0 && (
        <Empty
          title="No feedback yet"
          hint="Reject, rate, or drop a note on any video — it all collects here."
        />
      )}

      <div className="space-y-4">
        {grouped.map(([videoId, rows]) => {
          const v = byId.get(videoId)
          return (
            <Card key={videoId} className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                {v ? (
                  <Link to={`/videos/${v.slug}`} className="text-[14px] font-semibold text-ink hover:text-accent">
                    {displayName(v as Video, numbers.get(v.id))}
                  </Link>
                ) : (
                  <p className="text-[14px] font-semibold text-ink-faint">deleted video</p>
                )}
                <span className="text-[11px] text-ink-faint">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</span>
              </div>
              <ul className="space-y-3">
                {rows.map((f) => <FeedbackRow key={f.id} f={f} />)}
              </ul>
            </Card>
          )
        })}
      </div>
    </>
  )
}
