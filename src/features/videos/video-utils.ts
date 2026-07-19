import JSZip from 'jszip'
import { signedUrl } from '@/lib/supabase'
import type { Feedback, Scene, Video } from '@/lib/types'

/* ————— workflow groups: how Filipe actually moves videos through his week ————— */

export type WorkflowGroup = 'new' | 'approved' | 'submitted' | 'scheduled' | 'rejected'

export const GROUP_META: Record<WorkflowGroup, { label: string; short: string }> = {
  new: { label: 'Pending — awaiting your review', short: 'Pending' },
  approved: { label: 'Approved — being edited', short: 'Approved' },
  submitted: { label: 'Final uploaded', short: 'Submitted' },
  scheduled: { label: 'Scheduled & published', short: 'Scheduled' },
  rejected: { label: 'Rejected', short: 'Rejected' },
}

export const GROUP_ORDER: WorkflowGroup[] = ['new', 'approved', 'submitted', 'scheduled', 'rejected']

export function workflowGroup(v: Video, rejectedIds: Set<string>): WorkflowGroup {
  if (rejectedIds.has(v.id)) return 'rejected'
  if (v.status === 'scheduled' || v.status === 'published') return 'scheduled'
  if (v.status === 'edited') return 'submitted'
  return v.approved_at ? 'approved' : 'new'
}

/** Videos with an ACTIVE (non-retracted) rejection. */
export function rejectedIdSet(feedback: Feedback[] | undefined): Set<string> {
  return new Set((feedback ?? []).filter((f) => f.kind === 'reject' && !f.retracted_at).map((f) => f.video_id))
}

/** Latest star rating per video (a re-rating supersedes the old one). */
export function starsByVideo(feedback: Feedback[] | undefined): Map<string, number> {
  const m = new Map<string, number>()
  // feedback arrives newest-first; first rating seen per video wins
  for (const f of feedback ?? []) {
    if (f.kind === 'rating' && f.stars && !m.has(f.video_id)) m.set(f.video_id, f.stars)
  }
  return m
}

/** "reel-brazil-nut" -> "Brazil Nut" */
export function prettyName(v: Video): string {
  if (v.title) return v.title
  return v.slug
    .replace(/^reel-/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Stable enumeration: 1-based position in creation order across all videos. */
export function videoNumbers(videos: Video[]): Map<string, number> {
  const asc = [...videos].sort((a, b) => a.created_at.localeCompare(b.created_at))
  return new Map(asc.map((v, i) => [v.id, i + 1]))
}

export function displayName(v: Video, n?: number): string {
  return n ? `Video ${n} — ${prettyName(v)}` : prettyName(v)
}

/** Fetch all scene files and hand the browser one ZIP: "Scene 1.mp4" … */
export async function downloadScenesZip(
  video: Video,
  scenes: Scene[],
  n: number | undefined,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const zip = new JSZip()
  const withFiles = scenes.filter((s) => s.storage_path).sort((a, b) => a.idx - b.idx)
  if (withFiles.length === 0) throw new Error('scene files are purged — masters are on the factory PC')
  for (const s of withFiles) {
    onProgress?.(`Fetching scene ${s.idx}/${withFiles.length}…`)
    const url = await signedUrl(s.storage_path!, 600)
    const blob = await (await fetch(url)).blob()
    zip.file(`Scene ${s.idx}.mp4`, blob)
  }
  onProgress?.('Zipping…')
  const out = await zip.generateAsync({ type: 'blob' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(out)
  a.download = `${displayName(video, n)}.zip`
  a.click()
  URL.revokeObjectURL(a.href)
}
