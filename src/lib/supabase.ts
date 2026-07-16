import { createClient, type Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } },
)

export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/set-password') {
        window.location.assign('/set-password')
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])
  return session // undefined = loading, null = signed out
}

/** Short-lived signed URL for a private storage object. */
export async function signedUrl(path: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from('media').createSignedUrl(path, expiresIn)
  if (error || !data) throw error ?? new Error('no signed url')
  return data.signedUrl
}
