import type { Config } from '@netlify/functions'
import { adminClient } from './_shared/admin'

const DAY = 24 * 3600_000
const GB = 1024 ** 3
const WATERMARK = 0.8 * GB
const TARGET = 0.7 * GB

/**
 * Daily lifecycle. Nothing purged here is ever the last copy: masters stay on the factory PC,
 * published finals live on YouTube. Only Storage files are deleted — every DB row survives.
 */
export default async () => {
  const db = adminClient()
  const now = Date.now()
  const events: Array<{ video_id: string; type: string; payload: Record<string, unknown> }> = []

  const { data: videos } = await db.from('videos').select('*')
  const { data: schedules } = await db.from('schedules').select('*').in('state', ['scheduled', 'published'])
  const schedByVideo = new Map((schedules ?? []).map((s) => [s.video_id, s]))

  for (const v of videos ?? []) {
    const sched = schedByVideo.get(v.id)

    // finals: 7 days after publish
    if (v.final_path && !v.final_purged_at && sched?.state === 'published' && sched.publish_at) {
      if (now > new Date(sched.publish_at).getTime() + 7 * DAY) {
        await db.storage.from('media').remove([v.final_path])
        await db.from('videos').update({ final_purged_at: new Date().toISOString() }).eq('id', v.id)
        events.push({ video_id: v.id, type: 'final_purged', payload: { path: v.final_path } })
      }
    }

    // scenes: 2 days after scheduling/publishing, or stale ingested at 30 days (flag at 21)
    if (!v.scenes_purged_at) {
      const scheduledAt = sched?.confirmed_at ? new Date(sched.confirmed_at).getTime() : null
      const age = now - new Date(v.created_at).getTime()
      const purgeBecauseScheduled = scheduledAt !== null && now > scheduledAt + 2 * DAY
      const purgeBecauseStale = v.status === 'ingested' && age > 30 * DAY
      if (v.status === 'ingested' && age > 21 * DAY && age <= 30 * DAY) {
        events.push({ video_id: v.id, type: 'stale_flagged', payload: { days: Math.floor(age / DAY) } })
      }
      if (purgeBecauseScheduled || purgeBecauseStale) {
        const { data: scenes } = await db.from('scenes').select('id, storage_path').eq('video_id', v.id)
        const paths = (scenes ?? []).map((s) => s.storage_path).filter(Boolean) as string[]
        if (v.preview_path) paths.push(v.preview_path)
        if (paths.length) await db.storage.from('media').remove(paths)
        await db.from('scenes').update({ storage_path: null }).eq('video_id', v.id)
        await db.from('videos').update({ scenes_purged_at: new Date().toISOString(), preview_path: null }).eq('id', v.id)
        events.push({ video_id: v.id, type: 'scenes_purged', payload: { files: paths.length, reason: purgeBecauseStale ? 'stale' : 'scheduled' } })
      }
    }
  }

  // usage snapshot + watermark
  let used = 0
  const perFolder: Record<string, number> = {}
  for (const folder of ['scenes', 'finals', 'thumbs']) {
    const { data: top } = await db.storage.from('media').list(folder, { limit: 1000 })
    for (const entry of top ?? []) {
      const { data: files } = await db.storage.from('media').list(`${folder}/${entry.name}`, { limit: 100 })
      for (const f of files ?? []) {
        const size = (f.metadata as { size?: number } | null)?.size ?? 0
        used += size
        perFolder[folder] = (perFolder[folder] ?? 0) + size
      }
    }
  }

  let warning: string | null = null
  if (used > WATERMARK) {
    warning = `Storage at ${(used / GB).toFixed(2)} GB — purging ahead of schedule to get under ${(TARGET / GB).toFixed(1)} GB.`
    // emergency: purge published finals first, oldest first
    const candidates = (videos ?? [])
      .filter((v) => v.final_path && !v.final_purged_at && schedByVideo.get(v.id)?.state === 'published')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    for (const v of candidates) {
      if (used < TARGET) break
      await db.storage.from('media').remove([v.final_path!])
      await db.from('videos').update({ final_purged_at: new Date().toISOString() }).eq('id', v.id)
      used -= v.final_size_bytes ?? 0
      events.push({ video_id: v.id, type: 'final_purged', payload: { path: v.final_path, reason: 'watermark' } })
    }
  }

  await db.from('app_state').upsert({
    key: 'storage',
    value: { used_bytes: used, per_folder: perFolder, warning, checked_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  })
  if (events.length) await db.from('events').insert(events)
  return new Response(`ok used=${used}`)
}

export const config: Config = { schedule: '30 4 * * *' }
