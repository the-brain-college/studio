import type { Config } from '@netlify/functions'
import { adminClient, guard, json } from './_shared/admin'
import { googleAccessToken, listVideos } from './_shared/google'

export default async (req: Request) =>
  guard(req, async () => {
    const { schedule_id, youtube_video_id } = (await req.json()) as {
      schedule_id?: string
      youtube_video_id?: string
    }
    if (!schedule_id || !youtube_video_id) return json({ error: 'schedule_id + youtube_video_id required' }, 400)

    const db = adminClient()
    const { data: sched } = await db.from('schedules').select('*').eq('id', schedule_id).single()
    if (!sched) return json({ error: 'schedule not found' }, 404)

    const token = await googleAccessToken()
    const items = await listVideos(token, [youtube_video_id])
    const item = items[0]
    if (!item) return json({ error: 'video not visible on YouTube yet' }, 409)
    if (item.status.privacyStatus !== 'private' || !item.status.publishAt) {
      return json({ error: `unexpected YouTube state: ${item.status.privacyStatus}` }, 409)
    }

    await db
      .from('schedules')
      .update({ state: 'scheduled', youtube_video_id, confirmed_at: new Date().toISOString() })
      .eq('id', schedule_id)
    await db.from('videos').update({ status: 'scheduled' }).eq('id', sched.video_id)
    await db.from('events').insert({
      video_id: sched.video_id,
      type: 'scheduled',
      payload: { youtube_video_id, publish_at: sched.publish_at },
    })
    return json({ ok: true })
  })

export const config: Config = { path: '/api/youtube-confirm' }
