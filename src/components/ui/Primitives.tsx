import React from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

export function Card({
  children,
  className = '',
  onClick,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const interactive = typeof onClick === 'function';
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`rounded-2xl border p-4 sm:p-5 transition-colors ${
        interactive ? 'cursor-pointer hover:border-white/20 active:scale-[0.995]' : ''
      } ${className}`}
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  className = '',
  loading = false,
  disabled = false,
  type = 'button',
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  loading?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`min-h-[44px] px-5 py-2.5 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
      style={{
        backgroundColor: 'var(--accent-primary)',
        color: 'var(--accent-fg)',
        outlineColor: 'var(--accent-primary)',
      }}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = '',
  disabled = false,
  type = 'button',
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[44px] px-4 py-2.5 rounded-xl font-medium text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 border transition-colors hover:bg-white/5 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${className}`}
      style={{
        backgroundColor: 'var(--bg-elevated)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </button>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold tracking-tight text-white truncate">
          {title}
        </h2>
        {subtitle && <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  color,
  heightClass = 'h-2',
}: {
  value: number;
  max: number;
  color?: string;
  heightClass?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className={`w-full rounded-full overflow-hidden bg-white/[0.07] ${heightClass}`}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
    >
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${pct}%`,
          backgroundColor: color || 'var(--accent-primary)',
        }}
      />
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-rose-500/35 bg-rose-950/30 p-4 flex items-start gap-3"
    >
      <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-rose-200">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[36px] px-3 rounded-lg bg-rose-500/20 text-rose-200 text-xs font-semibold hover:bg-rose-500/30 whitespace-nowrap shrink-0"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border p-8 text-center flex flex-col items-center justify-center gap-3"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="w-12 h-12 rounded-2xl bg-white/[0.05] flex items-center justify-center text-zinc-400">
        {icon}
      </div>
      <div className="max-w-sm">
        <h3 className="font-display text-base font-semibold text-white">{title}</h3>
        <p className="text-sm text-zinc-400 mt-1 leading-relaxed">{description}</p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-400">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-primary)' }} />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function ModalSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full sm:max-w-lg max-h-[90dvh] rounded-t-3xl sm:rounded-2xl border flex flex-col overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
          paddingBottom: 'var(--sab)',
        }}
      >
        <div className="sm:hidden w-10 h-1 rounded-full bg-white/20 mx-auto mt-2.5" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <h3 className="font-display text-base font-semibold text-white truncate">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 flex-1">{children}</div>
      </div>
    </div>
  );
}

export function FormField({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-zinc-300">{label}</span>
      {children}
      {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export const INPUT_CLASS =
  'w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#0D0F13] border border-white/10 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[var(--accent-primary)] transition-colors';
