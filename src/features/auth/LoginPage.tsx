import { type FormEvent, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase, useSession } from '@/lib/supabase'
import { BrainMark } from '@/app'
import { Button, Card, Input, Spinner } from '@/components/ui'

export function LoginPage() {
  const session = useSession()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) {
    const to = (location.state as { from?: string } | null)?.from ?? '/videos'
    return <Navigate to={to} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError('Wrong email or password.')
    setBusy(false)
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-96 p-8">
        <div className="mb-8 flex items-center gap-3">
          <BrainMark className="h-9 w-9" />
          <div>
            <p className="font-display text-[18px] leading-tight">The Brain College</p>
            <p className="text-[12px] text-ink-faint">production studio</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink-muted" htmlFor="email">Email</label>
            <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink-muted" htmlFor="password">Password</label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy ? <Spinner className="text-[#04211d]" /> : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
