import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAllFeedback, useMarkDownloaded, useScenes, useSchedules, useUpdateVideo, useVideo, useVideos, logEvent } from '@/lib/queries'
import { signedUrl, supabase } from '@/lib/supabase'
import { MAX_FINAL_BYTES, uploadFinal } from '@/lib/tus-upload'
import { STATUS_LABEL, STATUS_TONE, type Scene, type Video } from '@/lib/types'
import { fmtBytes, fmtLisbon } from '@/lib/time'
import { useToast } from '@/components/toast'
import { Badge, Button, Card, Input, PageHeader, Progress, Spinner, Textarea } from '@/components/ui'
import { FeedbackCard } from './FeedbackWidgets'
import { PlatformsCard } from './PlatformsCard'
import { PipelinePanel } from './PipelinePanel'
import { PreviewPlayer } from './PreviewPlayer'
import { SequencePlayer } from './SequencePlayer'
import { displayName, downloadScenesZip, videoNumbers } from './video-utils'

export function VideoDetailPage() {
  const { slug = '' } = useParams()
  const { data: video, isLoading } = useVideo(slug)
  const { data: scenes } = useScenes(video?.id)
  const { data: all } = useVideos()
  const { data: feedback } = useAllFeedback()
  const markDownloaded = useMarkDownloaded()
  const toast = useToast()
  const n = useMemo(() => (video && all ? videoNumbers(all).get(video.id) : undefined), [video, all])
  const [playing, setPlaying] = useState(false)
  const [zipMsg, setZipMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<'overview' | 'pipeline'>('overview')

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div>
  if (!video) return <p className="text-danger">Video not found.</p>

  async function zip() {
    const t = toast.push({ kind: 'progress', title: `Downloading ${displayName(video!, n)}…` })
    try {
      setZipMsg('…')
      await downloadScenesZip(video!, scenes ?? [], n, (msg) => toast.update(t, { detail: msg }))
      markDownloaded.mutate(video!)
      toast.update(t, { kind: 'ok', title: 'Downloaded', detail: displayName(video!, n) })
      setZipMsg(null)
    } catch (e) {
      toast.update(t, { kind: 'err', title: 'Download failed', detail: (e as Error).message })
      setZipMsg(null)
    }
  }

  return (
    <>
      <div className="mb-4 text-[12px] text-ink-faint">
        <Link to="/videos" className="hover:text-ink">Video Management</Link> <span className="mx-1">/</span> {video.slug}
      </div>
      <PageHeader
        title={displayName(video, n)}
        sub={`${video.scene_count} scenes · created ${fmtLisbon(video.created_at, { year: 'numeric' })}`}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setPlaying(true)} disabled={!scenes?.some((s) => s.storage_path)}>▶ Play scenes</Button>
            <Button size="sm" onClick={() => void zip()} disabled={!!zipMsg}>{zipMsg ?? '⬇ Download ZIP'}</Button>
            <Badge tone={STATUS_TONE[video.status]}>{STATUS_LABEL[video.status]}</Badge>
          </div>
        }
      />
      {playing && (video.preview_path ? (
        <PreviewPlayer video={video} n={n} onClose={() => setPlaying(false)} />
      ) : (
        scenes && <SequencePlayer video={video} scenes={scenes} n={n} onClose={() => setPlaying(false)} />
      ))}

      <div className="mb-5 flex gap-1.5">
        {(['overview', 'pipeline'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'rounded-full border px-4 py-1.5 text-[12px] font-medium capitalize transition-colors',
              tab === t ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
            ].join(' ')}
          >
            {t === 'pipeline' ? 'Pipeline debug' : 'Overview'}
          </button>
        ))}
      </div>

      {tab === 'pipeline' ? (
        <PipelinePanel videoId={video.id} />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_400px]">
          <div className="min-w-0 space-y-6">
            {video.final_path && !video.final_purged_at && <AutoEditCard video={video} />}
            <MetadataCard video={video} />
            <ScenesCard video={video} scenes={scenes ?? []} />
          </div>
          <div className="space-y-6">
            <FeedbackCard video={video} n={n} feedback={feedback ?? []} />
            <FinalCard video={video} />
            <ScheduleCard video={video} />
            <PlatformsCard video={video} />
            {video.local_master_path && <LocalPickupCard path={video.local_master_path} />}
          </div>
        </div>
      )}
    </>
  )
}

/* ————— auto-edited final: the factory's cut, front and centre ————— */
function AutoEditCard({ video }: { video: Video }) {
  const { data: url } = useQuery({
    queryKey: ['final-url', video.final_path, video.final_uploaded_at],
    staleTime: 45 * 60_000,
    queryFn: () => signedUrl(video.final_path!, 3600),
  })
  const { data: dlUrl } = useQuery({
    queryKey: ['final-dl-url', video.final_path, video.final_uploaded_at],
    staleTime: 45 * 60_000,
    queryFn: () => signedUrl(video.final_path!, 3600, `${video.slug}-final.mp4`),
  })
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">
          Edited video <span className="ml-1 text-[11px] font-normal text-ink-faint">auto-edit v1</span>
        </h2>
        <div className="flex items-center gap-2">
          {video.final_size_bytes != null && <span className="text-[11px] text-ink-faint">{fmtBytes(video.final_size_bytes)}</span>}
          {dlUrl ? (
            <a
              href={dlUrl}
              download={`${video.slug}-final.mp4`}
              className="inline-flex h-7 select-none items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-control) bg-accent px-2.5 text-xs font-medium text-[#04211d] shadow-sm shadow-accent/20 transition-all duration-150 ease-out hover:bg-accent-deep hover:shadow-md hover:shadow-accent/25 active:scale-[0.97]"
            >
              ⬇ Download
            </a>
          ) : (
            <Spinner />
          )}
        </div>
      </div>
      <div className="overflow-hidden rounded-(--radius-control) border border-line bg-black">
        {url ? (
          <video src={url} controls preload="metadata" className="mx-auto h-100 max-w-full object-contain" />
        ) : (
          <div className="flex h-100 items-center justify-center"><Spinner /></div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">Auto-edited: trims + zooms + captions. Style calibration pending your examples.</p>
    </Card>
  )
}

/* ————— metadata (title/description feed YouTube) ————— */
function MetadataCard({ video }: { video: Video }) {
  const update = useUpdateVideo(video.slug)
  const [title, setTitle] = useState(video.title ?? '')
  const [description, setDescription] = useState(video.description ?? '')
  const dirty = title !== (video.title ?? '') || description !== (video.description ?? '')
  const editable = video.status === 'ingested' || video.status === 'edited'

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-[15px] font-semibold">Publishing copy <span className="ml-1 text-[11px] font-normal text-ink-faint">the factory writes all of this — nothing here is on you</span></h2>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">YouTube title — used automatically by Submit &amp; schedule</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} placeholder="the factory writes this at ingest…" />
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">YouTube description — the factory keeps it empty on purpose for now</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={!editable} rows={2} />
        </div>
        {dirty && editable && (
          <Button variant="primary" size="sm" disabled={update.isPending} onClick={() => update.mutate({ title: title || null, description: description || null })}>
            {update.isPending ? 'Saving…' : 'Save metadata'}
          </Button>
        )}
      </div>
    </Card>
  )
}

/* ————— scenes ————— */
function ScenesCard({ video, scenes }: { video: Video; scenes: Scene[] }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Scenes</h2>
        {video.scenes_purged_at && <Badge tone="muted">files purged — masters on the PC</Badge>}
      </div>
      {scenes.length === 0 && <p className="text-[13px] text-ink-faint">No scenes recorded.</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {scenes.map((s) => (
          <ScenePlayer key={s.id} scene={s} />
        ))}
      </div>
    </Card>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="sm"
      variant="ghost"
      className="shrink-0"
      onClick={(e) => {
        e.preventDefault()
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? '✓ copied' : label}
    </Button>
  )
}

function ScenePlayer({ scene }: { scene: Scene }) {
  const { data: url } = useQuery({
    queryKey: ['scene-url', scene.id],
    enabled: !!scene.storage_path,
    staleTime: 45 * 60_000,
    queryFn: () => signedUrl(scene.storage_path!, 3600),
  })
  return (
    <div className="overflow-hidden rounded-(--radius-control) border border-line bg-raised">
      <div className="aspect-[9/16] w-full bg-black">
        {url ? (
          <video src={url} controls preload="metadata" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] text-ink-faint">
            {scene.storage_path ? <Spinner /> : 'purged'}
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold text-ink">Scene {scene.idx}</p>
          <div className="flex items-center gap-1.5">
            {scene.qc_verdict === 'PASS' && <Badge tone="ok">QC</Badge>}
            {scene.qc_verdict === 'FAIL' && <Badge tone="danger">{scene.qc_failure_class ?? 'QC'}</Badge>}
            {url && (
              <a href={url} download={`scene-${scene.idx}.mp4`} className="text-[12px] text-accent hover:underline">
                Download
              </a>
            )}
          </div>
        </div>
        {scene.spoken && <p className="line-clamp-3 text-[12px] leading-relaxed text-ink-muted">“{scene.spoken}”</p>}
        {(scene.frame_prompt || scene.veo_prompt) && (
          <details className="group">
            <summary className="cursor-pointer list-none text-[12px] font-medium text-accent hover:underline">
              Prompts <span className="text-ink-faint group-open:hidden">▸</span><span className="hidden text-ink-faint group-open:inline">▾</span>
            </summary>
            <div className="mt-2 space-y-2">
              {scene.frame_prompt && (
                <div className="rounded border border-line bg-bg p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Frame prompt</span>
                    <CopyButton text={scene.frame_prompt} label="Copy" />
                  </div>
                  <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-ink-muted">{scene.frame_prompt}</p>
                </div>
              )}
              {scene.veo_prompt && (
                <div className="rounded border border-line bg-bg p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Video prompt</span>
                    <CopyButton text={scene.veo_prompt} label="Copy" />
                  </div>
                  <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-ink-muted">{scene.veo_prompt}</p>
                </div>
              )}
            </div>
          </details>
        )}
        <p className="text-[11px] text-ink-faint">{fmtBytes(scene.size_bytes)}</p>
      </div>
    </div>
  )
}

/* ————— final upload ————— */
function FinalCard({ video }: { video: Video }) {
  const update = useUpdateVideo(video.slug)
  const [pct, setPct] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const { data: finalUrl } = useQuery({
    queryKey: ['final-url', video.final_path, video.final_uploaded_at],
    enabled: !!video.final_path && !video.final_purged_at,
    queryFn: () => signedUrl(video.final_path!, 3600),
  })

  async function onPick(file: File | undefined) {
    if (!file) return
    setErr(null)
    if (file.size > MAX_FINAL_BYTES) {
      setErr(`File is ${fmtBytes(file.size)} — the free-tier cap is 48 MB. Re-export: H.264 1080×1920, ~8 Mbps video / 192 kbps audio.`)
      return
    }
    try {
      setPct(0)
      const path = await uploadFinal(video.slug, file, setPct)
      await update.mutateAsync({
        final_path: path,
        final_size_bytes: file.size,
        final_uploaded_at: new Date().toISOString(),
        status: 'edited',
      })
      await logEvent(video.id, 'final_uploaded', { bytes: file.size })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setPct(null)
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-[15px] font-semibold">Final edit</h2>
      {finalUrl && (
        <div className="mb-3 overflow-hidden rounded-(--radius-control) border border-line bg-black">
          <video src={finalUrl} controls preload="metadata" className="max-h-80 w-full object-contain" />
        </div>
      )}
      {video.final_path && !finalUrl && !video.final_purged_at && <Spinner className="mb-3" />}
      {video.final_purged_at && (
        <p className="mb-3 text-[12px] text-ink-faint">Archived copy purged (published on YouTube).</p>
      )}
      {pct !== null ? (
        <div className="space-y-2">
          <Progress value={pct} />
          <p className="text-[12px] text-ink-muted">Uploading… {pct}%</p>
        </div>
      ) : (
        <label className="block cursor-pointer rounded-(--radius-control) border border-dashed border-line-strong bg-raised/50 p-5 text-center transition-colors hover:border-accent/60">
          <input type="file" accept="video/mp4" className="hidden" onChange={(e) => void onPick(e.target.files?.[0])} />
          <p className="text-[13px] font-medium text-ink">{video.final_path ? 'Replace final' : 'Upload final'} (.mp4)</p>
          <p className="mt-1 text-[11px] text-ink-faint">≤ 48 MB · H.264 1080×1920 · resumable</p>
        </label>
      )}
      {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
      {video.final_size_bytes != null && pct === null && (
        <p className="mt-2 text-[11px] text-ink-faint">Current file: {fmtBytes(video.final_size_bytes)}</p>
      )}
    </Card>
  )
}

/* ————— schedule ————— */
function ScheduleCard({ video }: { video: Video }) {
  const { data: schedules, refetch } = useSchedules(video.id)
  const update = useUpdateVideo(video.slug)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const live = schedules?.find((s) => s.state === 'pending' || s.state === 'scheduled' || s.state === 'published')

  async function submit() {
    setErr(null)
    try {
      // 1) slot + resumable session
      setBusy('Reserving the next slot…')
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      const r = await fetch('/api/youtube-schedule', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: video.id }),
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error ?? `schedule failed (${r.status})`)

      // 2) fetch the archived final and PUT it straight to Google
      setBusy('Sending the final to YouTube…')
      const fileUrl = await signedUrl(video.final_path!, 3600)
      const blob = await (await fetch(fileUrl)).blob()
      const put = await fetch(body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: blob })
      if (!put.ok) throw new Error(`YouTube upload failed (${put.status})`)
      const yt = await put.json()

      // 3) confirm
      setBusy('Confirming…')
      const c = await fetch('/api/youtube-confirm', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule_id: body.scheduleId, youtube_video_id: yt.id }),
      })
      if (!c.ok) throw new Error((await c.json()).error ?? 'confirm failed')
      await update.mutateAsync({}) // refresh caches
      await refetch()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-[15px] font-semibold">Schedule</h2>
      {live ? (
        <div className="space-y-2">
          <Badge tone={live.state === 'published' ? 'ok' : 'accent'}>{live.state}</Badge>
          <p className="text-[13px] text-ink">
            {live.platform} · {fmtLisbon(live.publish_at, { year: 'numeric' })} <span className="text-ink-faint">(Lisbon)</span>
          </p>
          {live.youtube_video_id && (
            <a
              className="text-[12px] text-accent hover:underline"
              href={`https://studio.youtube.com/video/${live.youtube_video_id}/edit`}
              target="_blank"
              rel="noreferrer"
            >
              Open in YouTube Studio ↗
            </a>
          )}
        </div>
      ) : (
        <>
          <p className="mb-3 text-[12px] leading-relaxed text-ink-muted">
            Reserves the next free slot (02:00 / 15:00 / 20:00 Lisbon, jittered, always after the last
            scheduled video) and uploads the final to YouTube as private with that publish time.
          </p>
          <Button
            variant="primary"
            className="w-full"
            disabled={!!busy || video.status !== 'edited' || !video.final_path || !video.title}
            onClick={() => void submit()}
          >
            {busy ?? 'Submit & schedule to YouTube'}
          </Button>
          {video.status === 'ingested' && <p className="mt-2 text-[11px] text-ink-faint">Upload the final first.</p>}
          {video.status === 'edited' && !video.title && <p className="mt-2 text-[11px] text-warn">Add a YouTube title first.</p>}
        </>
      )}
      {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
    </Card>
  )
}

/* ————— local pickup ————— */
function LocalPickupCard({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Card className="p-5">
      <h2 className="mb-2 text-[15px] font-semibold">Local pickup</h2>
      <p className="mb-3 text-[12px] leading-relaxed text-ink-muted">
        Editing on the factory PC? The master scenes are already on disk — skip the download.
      </p>
      <button
        className="w-full truncate rounded-(--radius-control) border border-line bg-raised px-3 py-2 text-left font-mono text-[11px] text-ink-muted hover:border-line-strong"
        title={path}
        onClick={() => {
          void navigator.clipboard.writeText(path)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? '✓ copied' : path}
      </button>
    </Card>
  )
}
