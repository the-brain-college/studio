import type { Config } from '@netlify/functions'
import { guard, json } from './_shared/admin'

/**
 * Proxy of the legacy Railway calendar's /list feed (the live IG publisher's schedule).
 * The gate secret never reaches the browser; entries are normalized to calendar chips.
 */
export default async (req: Request) =>
  guard(req, async () => {
    const url = process.env.RAILWAY_CALENDAR_LIST_URL
    if (!url) return json([], 200)
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return json({ error: `railway ${r.status}` }, 502)
    const raw = (await r.json()) as unknown

    const entries: Array<Record<string, unknown>> = Array.isArray(raw)
      ? (raw as Array<Record<string, unknown>>)
      : ((raw as { items?: Array<Record<string, unknown>>; entries?: Array<Record<string, unknown>>; posts?: Array<Record<string, unknown>> }).items ??
         (raw as { entries?: Array<Record<string, unknown>> }).entries ??
         (raw as { posts?: Array<Record<string, unknown>> }).posts ??
         [])

    const chips = entries
      .map((e) => {
        const platform = String(e.platform ?? e.kind ?? '').toLowerCase()
        const when = e.publish_at ?? e.scheduled_at ?? e.time ?? e.when ?? e.slot
        if (!when || !['youtube', 'facebook', 'instagram'].includes(platform)) return null
        return {
          platform,
          publish_at: new Date(String(when)).toISOString(),
          title: (e.title as string) ?? null,
          caption: (e.caption as string) ?? (e.description as string) ?? null,
          state: String(e.state ?? e.status ?? 'scheduled'),
          media_url: null,
          source: 'railway' as const,
        }
      })
      .filter(Boolean)

    return json(chips)
  })

export const config: Config = { path: '/api/calendar-railway-feed' }
