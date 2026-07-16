import type { Config } from '@netlify/functions'
import { adminClient } from './_shared/admin'
import { googleAccessToken, listVideos } from './_shared/google'

/** Hourly: flip scheduled→published when publish_at passes; sweep abandoned pending rows. */
export default async () => {
  const db = adminClient()

  // sweep abandoned pending reservations (>2h) so their slots free up
  const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString()
  const { data: stale } = await db
    .from('schedules')
    .select('id')
    .eq('state', 'pending')
    .lt('created_at', twoHoursAgo)
  if (stale?.length) {
    await db.from('schedules').delete().in('id', stale.map((s) => s.id))
  }

  // scheduled → published
  const { data: due } = await db
    .from('schedules')
    .select('id, video_id, youtube_video_id, publish_at')
    .eq('state', 'scheduled')
    .lt('publish_at', new Date().toISOString())
  if (due?.length) {
    const token = await googleAccessToken()
    const items = await listVideos(token, due.map((d) => d.youtube_video_id!).filter(Boolean))
    const publicIds = new Set(items.filter((i) => i.status.privacyStatus === 'public').map((i) => i.id))
    for (const d of due) {
      if (d.youtube_video_id && publicIds.has(d.youtube_video_id)) {
        await db
          .from('schedules')
          .update({ state: 'published', published_at_actual: new Date().toISOString() })
          .eq('id', d.id)
        await db.from('videos').update({ status: 'published' }).eq('id', d.video_id)
        await db.from('events').insert({ video_id: d.video_id, type: 'published', payload: { youtube_video_id: d.youtube_video_id } })
      }
    }
  }
  return new Response('ok')
}

export const config: Config = { schedule: '5 * * * *' }
