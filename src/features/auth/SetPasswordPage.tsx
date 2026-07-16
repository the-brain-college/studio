import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, useSession } from '@/lib/supabase'
import { BrainMark } from '@/app'
import { Button, Card, Input, Spinner } from '@/components/ui'

/**
 * Landing page of the one-time recovery link: Supabase redirects here with a session
 * already established (type=recovery); the owner chooses the password in the browser.
 */
export function SetPasswordPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(error.message)
    navigate('/videos', { replace: true })
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-96 p-8">
        <div className="mb-6 flex items-center gap-3">
          <BrainMark className="h-9 w-9" />
          <p className="font-display text-[18px]">Set your password</p>
        </div>
        {session === null ? (
          <p className="text-[13px] text-ink-muted">
            This link has expired or was already used. Ask for a fresh recovery link.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-muted" htmlFor="pw">New password</label>
              <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink-muted" htmlFor="pw2">Confirm password</label>
              <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            {error && <p className="text-[13px] text-danger">{error}</p>}
            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? <Spinner className="text-[#04211d]" /> : 'Save password'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
