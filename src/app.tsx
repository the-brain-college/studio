import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAllFeedback, useAnalytics, useAppState, useFactoryState, useVideos } from '@/lib/queries'
import { Badge, Button } from '@/components/ui'
import { GROUP_META, GROUP_ORDER, rejectedIdSet, workflowGroup, type WorkflowGroup } from '@/features/videos/video-utils'

const NAV = [
  { to: '/production', label: 'Production', icon: FactoryIcon },
  { to: '/videos', label: 'Video Management', icon: FilmIcon },
  { to: '/feedback', label: 'Feedback', icon: ChatIcon },
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
            <div key={to}>
              <NavLink
                to={to}
                title={label}
                className={({ isActive }) =>
                  [
                    'relative flex items-center gap-3 rounded-(--radius-control) px-3 py-2.5 text-[13px] font-medium transition-colors',
                    isActive ? 'bg-accent/10 text-accent' : 'text-ink-muted hover:bg-raised hover:text-ink',
                  ].join(' ')
                }
              >
                <Icon className="h-4.5 w-4.5 shrink-0" />
                {(open || mobileOpen) && <span className="truncate">{label}</span>}
                {to === '/production' && <FactoryDot expanded={open || mobileOpen} />}
              </NavLink>
              {to === '/videos' && (open || mobileOpen) && <WorkflowLinks />}
            </div>
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
          <FactoryAlertBanner />
          <div className="mx-auto w-full max-w-[1500px] p-4 md:p-6 xl:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

/** The STOP protocol's voice: when the factory halts on a goal-compromising bug it raises
 *  app_state.factory_alert and waits for Filipe — this banner is how he finds out, anywhere. */
function FactoryAlertBanner() {
  const { data: fs } = useFactoryState()
  const alert = fs?.alert
  if (!alert?.message) return null
  return (
    <div className="sticky top-0 z-40 border-b-2 border-danger bg-danger/15 px-4 py-3 backdrop-blur md:px-6">
      <div className="mx-auto flex max-w-[1500px] items-start gap-3">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 animate-pulse items-center justify-center rounded-full bg-danger text-[12px] font-bold text-white">!</span>
        <div className="min-w-0">
          <p className="text-[13px] font-bold uppercase tracking-wide text-danger">Factory stopped — needs you</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink">{alert.message}</p>
          <p className="mt-0.5 text-[11px] text-ink-faint">raised {new Date(alert.at).toLocaleString()} — production is halted until you talk to Claude</p>
        </div>
      </div>
    </div>
  )
}

/** Green = factory brain live; amber = PC on but Claude idle; gray = PC offline. */
function FactoryDot({ expanded }: { expanded: boolean }) {
  const { data: fs } = useFactoryState()
  const now = Date.now()
  const stale = 2.5 * 60_000
  const pc = fs?.heartbeat && now - +new Date(fs.heartbeat.at) < stale
  const brain = fs?.status && now - +new Date(fs.status.alive_at) < stale
  const color = brain ? 'bg-ok' : pc ? 'bg-warn' : 'bg-line-strong'
  const title = brain ? 'Factory live' : pc ? 'PC on, Claude idle' : 'Factory offline'
  return <span title={title} className={`${expanded ? 'ml-auto' : 'absolute right-1 top-1'} h-2 w-2 shrink-0 rounded-full ${color}`} />
}

/** The workflow at a glance: each stage of Filipe's week is one click, with live counts. */
function WorkflowLinks() {
  const { data: videos } = useVideos()
  const { data: feedback } = useAllFeedback()
  const location = useLocation()
  const [params] = useSearchParams()
  const active = location.pathname === '/videos' ? ((params.get('f') ?? 'new') as WorkflowGroup) : null

  const counts = useMemo(() => {
    const rejected = rejectedIdSet(feedback)
    const c = Object.fromEntries(GROUP_ORDER.map((g) => [g, 0])) as Record<WorkflowGroup, number>
    for (const v of videos ?? []) c[workflowGroup(v, rejected)]++
    return c
  }, [videos, feedback])

  return (
    <div className="ml-4 mt-1 space-y-0.5 border-l border-line pl-3">
      {GROUP_ORDER.map((g) => (
        <Link
          key={g}
          to={g === 'new' ? '/videos' : `/videos?f=${g}`}
          className={[
            'flex items-center justify-between rounded-(--radius-control) px-2.5 py-1.5 text-[12px] transition-colors',
            active === g ? 'bg-accent/10 font-medium text-accent' : 'text-ink-muted hover:bg-raised hover:text-ink',
          ].join(' ')}
        >
          <span className="truncate">{GROUP_META[g].short}</span>
          <span className={counts[g] > 0 && g === 'new' ? 'font-semibold text-accent' : 'text-ink-faint'}>{counts[g]}</span>
        </Link>
      ))}
    </div>
  )
}

function QuickActions() {
  const { data: a } = useAnalytics()
  const { data: usage } = useAppState('usage')
  const rw = (usage as { railway?: { estCostUsd?: number; planCreditUsd?: number; pct?: number; error?: string } })?.railway
  const sb = (usage as { supabase?: { db_gb?: number; db_free_gb?: number; db_pct?: number; storage_gb?: number; storage_free_gb?: number; storage_pct?: number } })?.supabase
  return (
    <div className="mt-6 space-y-3 border-t border-line pt-4">
      <p className="px-3 text-[11px] uppercase tracking-wider text-ink-faint">Quick actions</p>
      <div className="space-y-2.5 px-3 text-[12px] text-ink-muted">
        <p className="flex justify-between"><span>Awaiting edit</span><Badge tone="info">{a?.ingested ?? '–'}</Badge></p>
        <p className="flex justify-between"><span>In queue</span><Badge tone="accent">{a?.queue_depth ?? '–'}</Badge></p>
        <p className="pt-1.5 text-[10px] uppercase tracking-wider text-ink-faint">Usage</p>
        <UsageBar label="Railway" value={rw?.error ? 'n/a' : `~$${rw?.estCostUsd ?? '–'}/mo`} sub={`of $${rw?.planCreditUsd ?? 5}`} pct={rw?.pct} />
        <UsageBar label="Supabase DB" value={`${sb?.db_gb ?? '–'} GB`} sub={`of ${sb?.db_free_gb ?? 0.5}`} pct={sb?.db_pct} />
        <UsageBar label="Supabase files" value={`${sb?.storage_gb ?? '–'} GB`} sub={`of ${sb?.storage_free_gb ?? 1}`} pct={sb?.storage_pct} />
        <a className="block pt-1 text-accent hover:underline" href="https://studio.youtube.com" target="_blank" rel="noreferrer">YouTube Studio ↗</a>
      </div>
    </div>
  )
}

function UsageBar({ label, value, sub, pct }: { label: string; value: string; sub: string; pct?: number | null }) {
  const p = Math.min(100, Math.max(0, pct ?? 0))
  const tone = (pct ?? 0) >= 100 ? 'bg-danger' : p >= 75 ? 'bg-warn' : 'bg-accent'
  return (
    <div title={pct != null ? `${pct}%` : undefined}>
      <p className="mb-1 flex items-baseline justify-between gap-2">
        <span>{label}</span>
        <span className="text-ink-faint">{value} <span className="text-[10px]">{sub}</span></span>
      </p>
      <div className="h-1 w-full rounded-full bg-raised"><div className={`h-full rounded-full ${tone}`} style={{ width: `${p}%` }} /></div>
    </div>
  )
}

function StorageBanner() {
  // usage warning banner — Railway over its credit, or Supabase DB/storage near the free-tier cap
  const { data: usage } = useAppState('usage')
  const u = usage as { railway?: { estCostUsd?: number; planCreditUsd?: number; pct?: number }; supabase?: { db_gb?: number; db_free_gb?: number; db_pct?: number; storage_gb?: number; storage_free_gb?: number; storage_pct?: number } } | undefined
  const warns: string[] = []
  if ((u?.railway?.pct ?? 0) >= 100) warns.push(`Railway ~$${u!.railway!.estCostUsd}/mo — over the $${u!.railway!.planCreditUsd} credit`)
  if ((u?.supabase?.storage_pct ?? 0) >= 90) warns.push(`Supabase files ${u!.supabase!.storage_gb}/${u!.supabase!.storage_free_gb} GB`)
  if ((u?.supabase?.db_pct ?? 0) >= 90) warns.push(`Supabase DB ${u!.supabase!.db_gb}/${u!.supabase!.db_free_gb} GB`)
  if (!warns.length) return <div className="flex-1" />
  return (
    <div className="flex flex-1 items-center gap-2 overflow-hidden">
      <Badge tone="warn">usage</Badge>
      <p className="truncate text-[12px] text-warn">{warns.join(' · ')}</p>
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
function FactoryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M3 21V9l6 4V9l6 4V5a2 2 0 0 1 4 0v16z" {...S} />
      <path d="M3 21h18M7 17h.01M12 17h.01M16 17h.01" {...S} />
    </svg>
  )
}
function ChatIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.9A8 8 0 1 1 21 12z" {...S} />
      <path d="M8.5 10.5h7M8.5 14h4.5" {...S} />
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
