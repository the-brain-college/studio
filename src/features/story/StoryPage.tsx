import { useMemo, useState } from 'react'
import { useScenes, useVideos } from '@/lib/queries'
import { fmtDate } from '@/lib/time'
import { Badge, Card, Empty, PageHeader, Spinner } from '@/components/ui'
import { STATUS_LABEL, STATUS_TONE } from '@/lib/types'

export function StoryPage() {
  const { data: videos, isLoading } = useVideos()
  const [selected, setSelected] = useState<string | null>(null)
  const withStory = useMemo(() => (videos ?? []).filter((v) => v.story || v.scene_count > 0), [videos])
  const current = withStory.find((v) => v.slug === selected) ?? withStory[0]
  const { data: scenes } = useScenes(current?.id)

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div>

  return (
    <>
      <PageHeader title="Stories" sub="The concept and spoken script behind every reel." />
      {withStory.length === 0 ? (
        <Empty title="No stories yet" hint="Stories arrive with each video the factory delivers." />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          <Card className="max-h-[70vh] overflow-y-auto p-2">
            {withStory.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelected(v.slug)}
                className={[
                  'block w-full rounded-(--radius-control) px-3 py-2.5 text-left transition-colors',
                  current?.slug === v.slug ? 'bg-accent/10' : 'hover:bg-raised',
                ].join(' ')}
              >
                <p className={`truncate text-[13px] font-medium ${current?.slug === v.slug ? 'text-accent' : 'text-ink'}`}>
                  {v.title || v.slug}
                </p>
                <p className="text-[11px] text-ink-faint">{fmtDate(v.created_at)}</p>
              </button>
            ))}
          </Card>

          {current && (
            <Card className="max-w-3xl p-6 lg:p-8">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="min-w-0 truncate font-display text-[20px]">{current.title || current.slug}</h2>
                <Badge tone={STATUS_TONE[current.status]} className="shrink-0">{STATUS_LABEL[current.status]}</Badge>
              </div>
              {current.story ? (
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-muted">{current.story}</p>
              ) : (
                <p className="text-[13px] text-ink-faint">No story text recorded for this reel.</p>
              )}
              {(scenes ?? []).length > 0 && (
                <div className="mt-6 space-y-3 border-t border-line pt-5">
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">Spoken script</p>
                  {(scenes ?? []).map((s) => (
                    <div key={s.id} className="flex gap-3">
                      <span className="mt-0.5 shrink-0 rounded bg-raised px-1.5 py-0.5 text-[11px] font-semibold text-ink-faint">S{s.idx}</span>
                      <p className="text-[14px] leading-relaxed text-ink">{s.spoken || <span className="text-ink-faint">—</span>}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </>
  )
}
