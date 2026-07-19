import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAddFeedback, useAllFeedback, useMarkDownloaded, useScenes, useSchedules, useUpdateVideo, useVideo, useVideos, logEvent } from '@/lib/queries'
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
import { ReviewWizard } from './ReviewWizard'
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
  const [reviewing, setReviewing] = useState(false)
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
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => setReviewing(true)} disabled={!scenes?.length}>★ Review</Button>
            <Button size="sm" onClick={() => setPlaying(true)} disabled={!scenes?.some((s) => s.storage_path)}>▶ Play scenes</Button>
            <Button size="sm" onClick={() => void zip()} disabled={!!zipMsg}>{zipMsg ?? '⬇ Download ZIP'}</Button>
            <Badge tone={STATUS_TONE[video.status]}>{STATUS_LABEL[video.status]}</Badge>
          </div>
        }
      />
      {reviewing && scenes && <ReviewWizard video={video} scenes={scenes} n={n} onClose={() => setReviewing(false)} />}
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
            <FinalEditCard video={video} />
            <MetadataCard video={video} />
            <ScenesCard video={video} scenes={scenes ?? []} />
          </div>
          <div className="space-y-6">
            <FeedbackCard video={video} n={n} feedback={feedback ?? []} />
            <ScheduleCard video={video} />
            <PlatformsCard video={video} />
          </div>
        </div>
      )}
    </>
  )
}

/* ————— the final cut: one place — the factory's auto-edit, replaceable by your own upload ————— */
function FinalEditCard({ video }: { video: Video }) {
  const update = useUpdateVideo(video.slug)
  const [pct, setPct] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const has = !!video.final_path && !video.final_purged_at

  const { data: url } = useQuery({
    queryKey: ['final-url', video.final_path, video.final_uploaded_at],
    enabled: has,
    staleTime: 45 * 60_000,
    queryFn: () => signedUrl(video.final_path!, 3600),
  })
  const { data: dlUrl } = useQuery({
    queryKey: ['final-dl-url', video.final_path, video.final_uploaded_at],
    enabled: has,
    staleTime: 45 * 60_000,
    queryFn: () => signedUrl(video.final_path!, 3600, `${video.slug}-final.mp4`),
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
        status: 'edited', // keeps the scheduler's status==='edited' gate intact
      })
      await logEvent(video.id, 'final_uploaded', { bytes: file.size })
      setShowUpload(false)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setPct(null)
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-h3 text-ink">Final edit</h2>
          <p className="mt-0.5 text-caption text-ink-faint">The factory’s auto-edited cut — trims, zooms, karaoke captions, cloned voice.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {video.final_size_bytes != null && has && <span className="text-caption text-ink-faint">{fmtBytes(video.final_size_bytes)}</span>}
          {has && (dlUrl ? (
            <a
              href={dlUrl}
              download={`${video.slug}-final.mp4`}
              className="inline-flex h-8 select-none items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-control) bg-accent px-3 text-small font-medium text-[#04211d] shadow-sm shadow-accent/20 transition-all duration-150 ease-out hover:bg-accent-deep active:scale-[0.97]"
            >
              ⬇ Download
            </a>
          ) : (
            <Spinner />
          ))}
        </div>
      </div>

      {has ? (
        <div className="overflow-hidden rounded-(--radius-control) border border-line bg-black">
          {url ? (
            <video src={url} controls preload="metadata" className="mx-auto max-h-[70vh] w-full max-w-[360px] object-contain" />
          ) : (
            <div className="flex aspect-[9/16] max-h-[70vh] items-center justify-center"><Spinner /></div>
          )}
        </div>
      ) : video.final_purged_at ? (
        <p className="rounded-(--radius-control) border border-line bg-raised/40 p-3 text-body text-ink-faint">Archived copy purged (published on YouTube).</p>
      ) : null}

      {/* upload / replace — secondary, never a second player */}
      <div className="mt-3 border-t border-line pt-3">
        {pct !== null ? (
          <div className="space-y-2">
            <Progress value={pct} />
            <p className="text-small text-ink-muted">Uploading your edit… {pct}%</p>
          </div>
        ) : showUpload || !has ? (
          <div className="space-y-2">
            <label className="block cursor-pointer rounded-(--radius-control) border border-dashed border-line-strong bg-raised/50 p-4 text-center transition-colors hover:border-accent/60">
              <input type="file" accept="video/mp4" className="hidden" onChange={(e) => void onPick(e.target.files?.[0])} />
              <p className="text-body font-medium text-ink">{has ? 'Upload your own edit' : 'Upload the final'} (.mp4)</p>
              <p className="mt-1 text-caption text-ink-faint">≤ 48 MB · H.264 1080×1920 · resumable</p>
            </label>
            {has && <button onClick={() => setShowUpload(false)} className="text-small text-ink-faint hover:text-ink">Cancel</button>}
          </div>
        ) : (
          <button onClick={() => setShowUpload(true)} className="text-small font-medium text-accent hover:underline">
            ✎ Replace with your own edit
          </button>
        )}
        {err && <p className="mt-2 text-small text-danger">{err}</p>}
      </div>
    </Card>
  )
}

/* ————— tier notes: pin a note to one scene or to the auto-edited final ————— */
function InlineNote({ videoId, target, scene, triggerLabel, placeholder, savedTitle }: {
  videoId: string
  target: 'scene' | 'final'
  scene?: Scene
  triggerLabel: string
  placeholder: string
  savedTitle: string
}) {
  const add = useAddFeedback()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  function save() {
    const comment = note.trim()
    if (!comment) return
    add.mutate(
      { video_id: videoId, kind: 'note', comment, target, scene_id: scene?.id, scene_idx: scene?.idx },
      {
        onSuccess: () => {
          toast.push({ kind: 'ok', title: savedTitle, detail: 'The factory reads it on its next feedback intake.' })
          setNote(''); setOpen(false)
        },
        onError: (e) => toast.push({ kind: 'err', title: 'Note not saved', detail: (e as Error).message }),
      },
    )
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[12px] font-medium text-accent hover:underline">
        {triggerLabel}
      </button>
    )
  }
  return (
    <div className="space-y-2">
      <Textarea autoFocus rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" disabled={!note.trim() || add.isPending} onClick={save}>
          {add.isPending ? 'Saving…' : 'Save note'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setNote('') }}>Cancel</Button>
      </div>
    </div>
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
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h3 text-ink">Scenes <span className="text-small font-normal text-ink-faint">({scenes.length})</span></h2>
        {video.scenes_purged_at && <Badge tone="muted">files purged — masters on the PC</Badge>}
      </div>
      {scenes.length === 0 && <p className="text-body text-ink-faint">No scenes recorded.</p>}
      {/* auto-fill guarantees each card ≥ 190px and reflows cleanly on Mac, tablet and phone */}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]">
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
  const { data: dlUrl } = useQuery({
    queryKey: ['scene-dl-url', scene.id],
    enabled: !!scene.storage_path,
    staleTime: 45 * 60_000,
    queryFn: () => signedUrl(scene.storage_path!, 3600, `scene-${scene.idx}.mp4`),
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-small font-semibold text-ink">Scene {scene.idx}</p>
          {scene.qc_verdict === 'PASS' && <Badge tone="ok">QC</Badge>}
          {scene.qc_verdict === 'FAIL' && <Badge tone="danger">{scene.qc_failure_class ?? 'QC'}</Badge>}
          {(dlUrl ?? url) && (
            <a href={dlUrl ?? url} download={`scene-${scene.idx}.mp4`} className="ml-auto text-small text-accent hover:underline">
              Download
            </a>
          )}
        </div>
        {scene.spoken && <p className="line-clamp-3 text-small leading-relaxed text-ink-muted">“{scene.spoken}”</p>}
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
        <InlineNote
          videoId={scene.video_id}
          target="scene"
          scene={scene}
          triggerLabel="✎ Note"
          placeholder={`What's off in scene ${scene.idx}? The factory pins this note to it…`}
          savedTitle={`Note on scene ${scene.idx} saved`}
        />
      </div>
    </div>
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
