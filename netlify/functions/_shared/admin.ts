import { createClient } from '@supabase/supabase-js'

export function adminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

/** The Bearer token must belong to the single allowed user. Returns the user id or throws. */
export async function verifyUser(authHeader: string | null): Promise<string> {
  if (!authHeader?.startsWith('Bearer ')) throw httpError(401, 'missing token')
  const token = authHeader.slice(7)
  const admin = adminClient()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw httpError(401, 'invalid session')
  if (data.user.email?.toLowerCase() !== process.env.APP_USER_EMAIL?.toLowerCase()) {
    throw httpError(403, 'not allowed')
  }
  return data.user.id
}

export function httpError(status: number, message: string): Error & { status: number } {
  const e = new Error(message) as Error & { status: number }
  e.status = status
  return e
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function guard(req: Request, fn: () => Promise<Response>): Promise<Response> {
  try {
    await verifyUser(req.headers.get('authorization'))
    return await fn()
  } catch (e) {
    const err = e as Error & { status?: number }
    return json({ error: err.message }, err.status ?? 500)
  }
}
