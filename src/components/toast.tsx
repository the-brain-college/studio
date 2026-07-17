import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Spinner } from './ui'

/**
 * Top-right toast stack: long-running actions (downloads) report progress here so the
 * UI itself can move optimistically the instant a verdict is given.
 */

type ToastKind = 'progress' | 'ok' | 'err'
interface Toast {
  id: number
  kind: ToastKind
  title: string
  detail?: string
}

interface ToastApi {
  push: (t: Omit<Toast, 'id'>) => number
  update: (id: number, patch: Partial<Omit<Toast, 'id'>>) => void
  dismiss: (id: number) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast outside ToastProvider')
  return ctx
}

const AUTO_DISMISS_MS = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const schedule = useCallback((id: number, kind: ToastKind) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    if (kind !== 'progress') timers.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS))
  }, [dismiss])

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current
    setToasts((ts) => [...ts, { ...t, id }])
    schedule(id, t.kind)
    return id
  }, [schedule])

  const update = useCallback((id: number, patch: Partial<Omit<Toast, 'id'>>) => {
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    if (patch.kind) schedule(id, patch.kind)
  }, [schedule])

  return (
    <ToastCtx.Provider value={{ push, update, dismiss }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 rounded-(--radius-card) border border-line bg-surface/95 p-3.5 shadow-lg shadow-black/40 backdrop-blur animate-[toast-in_.22s_ease-out]"
          >
            <span className="mt-0.5 shrink-0">
              {t.kind === 'progress' && <Spinner className="h-4 w-4 text-accent" />}
              {t.kind === 'ok' && (
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-ok" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.5l5 5 10-11" /></svg>
              )}
              {t.kind === 'err' && (
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-danger" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink">{t.title}</p>
              {t.detail && <p className="mt-0.5 truncate text-[12px] text-ink-muted">{t.detail}</p>}
            </div>
            <button
              aria-label="Dismiss"
              className="shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:text-ink"
              onClick={() => dismiss(t.id)}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
