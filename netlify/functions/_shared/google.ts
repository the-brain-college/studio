/** Google OAuth (refresh-token grant) + the two YouTube calls the app needs. */

export async function googleAccessToken(): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })
  const body = (await r.json()) as { access_token?: string; error?: string }
  if (!r.ok || !body.access_token) throw new Error(`google token: ${body.error ?? r.status}`)
  return body.access_token
}

/**
 * Open a resumable upload session for a private, scheduled video.
 * Returns the session URL the BROWSER will PUT the bytes to.
 */
export async function openResumableUpload(opts: {
  accessToken: string
  title: string
  description: string
  publishAtIso: string
  origin: string
}): Promise<string> {
  const r = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${opts.accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-type': 'video/mp4',
        origin: opts.origin,
      },
      body: JSON.stringify({
        snippet: { title: opts.title.slice(0, 100), description: opts.description, categoryId: '27' },
        status: {
          privacyStatus: 'private',
          publishAt: opts.publishAtIso,
          selfDeclaredMadeForKids: false,
        },
      }),
    },
  )
  if (!r.ok) throw new Error(`youtube insert: ${r.status} ${(await r.text()).slice(0, 300)}`)
  const location = r.headers.get('location')
  if (!location) throw new Error('youtube insert: no session url')
  return location
}

export async function listVideos(accessToken: string, ids: string[]) {
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=status&id=${ids.join(',')}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  )
  if (!r.ok) throw new Error(`youtube list: ${r.status}`)
  const body = (await r.json()) as { items?: Array<{ id: string; status: { privacyStatus: string; publishAt?: string } }> }
  return body.items ?? []
}
