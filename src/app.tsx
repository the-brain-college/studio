import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAnalytics, useAppState } from '@/lib/queries'
import { fmtBytes } from '@/lib/time'
import { Badge, Button } from '@/components/ui'

const NAV = [
  { to: '/videos', label: 'Video Management', icon: FilmIcon },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/analytics', label: 'Analytics', icon: ChartIcon },
  { to: '/story', label: 'Stories', icon: BookIcon },
]

export default function App() {
  const [open, setOpen] = useState(() => localStorage.getItem('sidebar') !== 'closed')
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => localStorage.setItem('sidebar', open ? 'open' : 'closed'), [open])
  useEffect(() => setMobileOpen(false), [location.pathname])

  return (
    <div className="flex h-full">
      {/* mobile scrim */}
      {mobileOpen && (
        <button aria-label="Close menu" className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* sidebar */}
      <aside
        className={[
          'z-40 flex h-full shrink-0 flex-col border-r border-line bg-surface transition-[width,transform] duration-200',
          'fixed md:static',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          open ? 'w-66' : 'w-66 md:w-16',
        ].join(' ')}
      >
        <div className="flex h-15 items-center gap-3 border-b border-line px-4">
          <BrainMark className="h-7 w-7 shrink-0" />
          {(open || mobileOpen) && (
            <div className="min-w-0">
              <p className="truncate font-display text-[15px] leading-tight">The Brain College</p>
              <p className="text-[11px] text-ink-faint">production studio</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-(--radius-control) px-3 py-2.5 text-[13px] font-medium transition-colors',
                  isActive ? 'bg-accent/10 text-accent' : 'text-ink-muted hover:bg-raised hover:text-ink',
                ].join(' ')
              }
            >
              <Icon className="h-4.5 w-4.5 shrink-0" />
              {(open || mobileOpen) && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
          {(open || mobileOpen) && <QuickActions />}
        </nav>

        <div className="border-t border-line p-3">
          <Button variant="ghost" className="w-full justify-start" onClick={() => void supabase.auth.signOut()} title="Sign out">
            <LogoutIcon className="h-4.5 w-4.5 shrink-0" />
            {(open || mobileOpen) && 'Sign out'}
          </Button>
        </div>
      </aside>

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-15 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 md:px-6">
          <button
            className="rounded-(--radius-control) p-2 text-ink-muted hover:bg-raised hover:text-ink md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <button
            className="hidden rounded-(--radius-control) p-2 text-ink-muted hover:bg-raised hover:text-ink md:block"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <StorageBanner />
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1500px] p-4 md:p-6 xl:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function QuickActions() {
  const { data: a } = useAnalytics()
  const { data: storage } = useAppState('storage')
  const used = Number(storage?.used_bytes ?? 0)
  const pct = Math.min(100, Math.round((used / (1024 * 1024 * 1024)) * 100))
  return (
    <div className="mt-6 space-y-3 border-t border-line pt-4">
      <p className="px-3 text-[11px] uppercase tracking-wider text-ink-faint">Quick actions</p>
      <div className="space-y-2 px-3 text-[12px] text-ink-muted">
        <p className="flex justify-between"><span>Awaiting edit</span><Badge tone="info">{a?.ingested ?? '–'}</Badge></p>
        <p className="flex justify-between"><span>In queue</span><Badge tone="accent">{a?.queue_depth ?? '–'}</Badge></p>
        <div>
          <p className="mb-1 flex justify-between"><span>Storage</span><span>{fmtBytes(used)} / 1 GB</span></p>
          <div className="h-1 w-full rounded-full bg-raised">
            <div className={`h-full rounded-full ${pct > 80 ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <a
          className="block text-accent hover:underline"
          href="https://studio.youtube.com"
          target="_blank"
          rel="noreferrer"
        >
          YouTube Studio ↗
        </a>
      </div>
    </div>
  )
}

function StorageBanner() {
  const { data: storage } = useAppState('storage')
  const warning = storage?.warning as string | undefined
  if (!warning) return <div className="flex-1" />
  return (
    <div className="flex flex-1 items-center gap-2 overflow-hidden">
      <Badge tone="warn">storage</Badge>
      <p className="truncate text-[12px] text-warn">{warning}</p>
    </div>
  )
}

/* ————— icons (inline, stroke-based, consistent 1.8px) ————— */
type IconProps = { className?: string }
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function BrainMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className}>
      <rect width="32" height="32" rx="7" fill="var(--color-raised)" />
      <path d="M16 6c-4.4 0-8 3.1-8 7.2 0 2.3 1.1 4.3 2.9 5.6-.2 1.3-.8 2.4-1.7 3.3 1.7.2 3.3-.3 4.6-1.2.7.2 1.4.3 2.2.3 4.4 0 8-3.1 8-7.2S20.4 6 16 6z" {...S} stroke="var(--color-accent)" />
    </svg>
  )
}
function FilmIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" {...S} />
      <path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4" {...S} />
    </svg>
  )
}
function CalendarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" {...S} />
      <path d="M3 10h18M8 3v4M16 3v4" {...S} />
    </svg>
  )
}
function ChartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" {...S} />
    </svg>
  )
}
function BookIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2z" {...S} />
      <path d="M4 19a2 2 0 0 1 2-2h13" {...S} />
    </svg>
  )
}
function MenuIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" {...S} />
    </svg>
  )
}
function LogoutIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9" {...S} />
    </svg>
  )
}
