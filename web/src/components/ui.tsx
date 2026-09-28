'use client';

import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Tone } from '@/lib/format';

// ---------------------------------------------------------------------------
export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md';
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        variant === 'primary' && 'bg-brand text-white hover:bg-brand-600',
        variant === 'secondary' && 'bg-panel-2 text-steel-2 border border-line hover:bg-[#26262a]',
        variant === 'outline' && 'border border-brand/60 text-brand hover:bg-brand/10',
        variant === 'ghost' && 'text-steel hover:text-white hover:bg-white/5',
        variant === 'danger' && 'bg-red-900/40 text-red-300 border border-red-800 hover:bg-red-900/60',
        className
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children, title, actions }: { className?: string; children: React.ReactNode; title?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className={clsx('rounded-xl border border-line bg-panel', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-steel-2">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      {children}
    </section>
  );
}

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  info: 'bg-sky-950 text-sky-300 border-sky-800',
  success: 'bg-emerald-950 text-emerald-300 border-emerald-800',
  warning: 'bg-amber-950 text-amber-300 border-amber-800',
  danger: 'bg-red-950 text-red-300 border-red-800',
  critical: 'bg-brand text-white border-brand',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium', toneClasses[tone], className)}>
      {children}
    </span>
  );
}

export function Stat({ label, value, tone, icon, hint }: { label: string; value: React.ReactNode; tone?: Tone; icon?: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-steel">
        <span>{label}</span>
        {icon}
      </div>
      <div
        className={clsx(
          'mt-2 text-3xl font-bold tabular-nums',
          tone === 'danger' || tone === 'critical' ? 'text-brand' : tone === 'warning' ? 'text-amber-400' : tone === 'success' ? 'text-emerald-400' : 'text-white'
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-steel">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function Field({ label, children, hint, error }: { label: string; children: React.ReactNode; hint?: string; error?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-steel-2">{label}</span>
      {children}
      {hint && !error && <span className="block text-[11px] text-steel">{hint}</span>}
      {error && <span className="block text-[11px] text-red-400">{error}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/50';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(inputCls, 'h-10', props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={clsx(inputCls, props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(inputCls, 'h-10', props.className)} />;
}
export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-steel-2">
      <input type="checkbox" {...props} className="h-4 w-4 rounded border-line accent-[#e92026]" />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------------------
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[6vh]" onMouseDown={onClose}>
      <div
        className={clsx('w-full rounded-xl border border-line bg-panel shadow-2xl', wide ? 'max-w-4xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-steel hover:bg-white/5 hover:text-white" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-steel">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-5 w-5 animate-spin text-steel', className)} />;
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-16">
      <Spinner />
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-steel">{children}</div>;
}

export function ErrorBox({ error }: { error: Error | null }) {
  if (!error) return null;
  return <div className="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">{error.message}</div>;
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={clsx('border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-steel', className)}>{children}</th>;
}
export function Td({ children, className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td {...props} className={clsx('border-b border-line/60 px-4 py-2.5 align-middle text-steel-2', className)}>
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------
// Notifications (toasts)
type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' };
const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[3000] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'rounded-lg border px-4 py-3 text-sm shadow-xl',
              t.tone === 'success' && 'border-emerald-800 bg-emerald-950 text-emerald-200',
              t.tone === 'error' && 'border-red-800 bg-red-950 text-red-200',
              t.tone === 'info' && 'border-line bg-panel-2 text-steel-2'
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
