import type { Config } from '@netlify/functions'
import { adminClient, guard, json } from './_shared/admin'
import { googleAccessToken, openResumableUpload } from './_shared/google'
import { planNextSlot, type SlotPos } from './_shared/slots'

export default async (req: Request) =>
  guard(req, async () => {
    const { video_id } = (await req.json()) as { video_id?: string }
    if (!video_id) return json({ error: 'video_id required' }, 400)

    const db = adminClient()
    const { data: video } = await db.from('videos').select('*').eq('id', video_id).single()
    if (!video) return json({ error: 'video not found' }, 404)
    if (video.status !== 'edited' || !video.final_path) return json({ error: 'upload the final first' }, 409)
    if (!video.title) return json({ error: 'a YouTube title is required' }, 409)

    const { data: existing } = await db
      .from('schedules')
      .select('id')
      .eq('video_id', video_id)
      .eq('platform', 'youtube')
      .in('state', ['pending', 'scheduled', 'published'])
      .maybeSingle()
    if (existing) return json({ error: 'this video already has a live schedule' }, 409)

    // Slot reservation loop — the unique index is the lock.
    let planned: { scheduleId: string; publishAt: string; slot: SlotPos } | null = null
    for (let attempt = 0; attempt < 5 && !planned; attempt++) {
      const { data: anchorRow } = await db
        .from('schedules')
        .select('slot_date, slot_index')
        .eq('platform', 'youtube')
        .in('state', ['pending', 'scheduled', 'published'])
        .order('slot_date', { ascending: false })
        .order('slot_index', { ascending: false })
        .limit(1)
        .maybeSingle()
      const anchor: SlotPos | null = anchorRow
        ? { slotDate: anchorRow.slot_date, slotIndex: anchorRow.slot_index as 0 | 1 | 2 }
        : null
      const plan = planNextSlot(anchor, new Date(), video.slug)
      const { data: inserted, error } = await db
        .from('schedules')
        .insert({
          video_id,
          platform: 'youtube',
          slot_date: plan.slotDate,
          slot_index: plan.slotIndex,
          publish_at: plan.publishAt.toISOString(),
          state: 'pending',
        })
        .select('id')
        .single()
      if (!error && inserted) {
        planned = { scheduleId: inserted.id, publishAt: plan.publishAt.toISOString(), slot: plan }
      } else if (error && !`${error.message}`.includes('duplicate key')) {
        return json({ error: error.message }, 500)
      } // duplicate key → someone holds that slot; recompute from the new anchor
    }
    if (!planned) return json({ error: 'could not reserve a slot, try again' }, 503)

    try {
      const accessToken = await googleAccessToken()
      const uploadUrl = await openResumableUpload({
        accessToken,
        title: video.title,
        description: video.description ?? '',
        publishAtIso: planned.publishAt,
        origin: process.env.SITE_ORIGIN ?? new URL(req.url).origin,
      })
      return json({ scheduleId: planned.scheduleId, publishAt: planned.publishAt, uploadUrl })
    } catch (e) {
      // free the reserved slot on YouTube-side failure
      await db.from('schedules').delete().eq('id', planned.scheduleId)
      return json({ error: (e as Error).message }, 502)
    }
  })

export const config: Config = { path: '/api/youtube-schedule' }
