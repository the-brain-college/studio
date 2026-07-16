import { type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, forwardRef } from 'react'

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/* ————— Button ————— */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, ...props }, ref,
) {
  return (
    <button
      ref={ref}
      className={cx(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors rounded-(--radius-control) disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap',
        size === 'md' ? 'h-9 px-4 text-[13px]' : 'h-7 px-2.5 text-xs',
        variant === 'primary' && 'bg-accent text-[#04211d] hover:bg-accent-deep',
        variant === 'secondary' && 'bg-raised border border-line hover:border-line-strong hover:bg-overlay text-ink',
        variant === 'ghost' && 'text-ink-muted hover:text-ink hover:bg-raised',
        variant === 'danger' && 'bg-danger/10 border border-danger/40 text-danger hover:bg-danger/20',
        className,
      )}
      {...props}
    />
  )
})

/* ————— Card ————— */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('bg-surface border border-line rounded-(--radius-card)', className)} {...props} />
}

/* ————— Badge ————— */
export function Badge({
  tone = 'info',
  children,
  className,
}: { tone?: 'info' | 'warn' | 'accent' | 'ok' | 'danger' | 'muted'; children: ReactNode; className?: string }) {
  const tones: Record<string, string> = {
    info: 'bg-info/10 text-info border-info/30',
    warn: 'bg-warn/10 text-warn border-warn/30',
    accent: 'bg-accent/10 text-accent border-accent/30',
    ok: 'bg-ok/10 text-ok border-ok/30',
    danger: 'bg-danger/10 text-danger border-danger/30',
    muted: 'bg-raised text-ink-muted border-line',
  }
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide', tones[tone], className)}>
      {children}
    </span>
  )
}

/* ————— Input / Textarea ————— */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cx(
        'h-9 w-full rounded-(--radius-control) border border-line bg-raised px-3 text-[13px] text-ink placeholder:text-ink-faint',
        'focus:border-accent/60 focus:outline-none',
        className,
      )}
      {...props}
    />
  )
})

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        'w-full rounded-(--radius-control) border border-line bg-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint',
        'focus:border-accent/60 focus:outline-none resize-y min-h-20',
        className,
      )}
      {...props}
    />
  )
}

/* ————— Progress ————— */
export function Progress({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-raised overflow-hidden">
      <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  )
}

/* ————— Spinner ————— */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin h-4 w-4 text-ink-muted', className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/* ————— Empty state ————— */
export function Empty({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
      <div className="text-ink-faint">{icon}</div>
      <p className="text-[15px] font-medium text-ink-muted">{title}</p>
      {hint && <p className="max-w-100 text-[13px] text-ink-faint">{hint}</p>}
    </div>
  )
}

/* ————— Page scaffolding ————— */
export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[26px] leading-tight text-ink">{title}</h1>
        {sub && <p className="mt-1 text-[13px] text-ink-muted">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: 'accent' | 'ok' | 'warn' }) {
  return (
    <Card className="p-5">
      <p className="text-[12px] uppercase tracking-wider text-ink-faint">{label}</p>
      <p className={cx('mt-1 font-display text-[30px] leading-none', tone === 'accent' && 'text-accent', tone === 'ok' && 'text-ok', tone === 'warn' && 'text-warn')}>
        {value}
      </p>
    </Card>
  )
}
