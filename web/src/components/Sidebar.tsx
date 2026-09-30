'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  Clock,
  FileClock,
  Fingerprint,
  Footprints,
  LogOut,
  MapPin,
  ScanLine,
  Settings,
  ShieldAlert,
  Siren,
  Users,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useSocket } from '@/lib/socket';
import { ROLE_LABELS } from '@/lib/format';
import type { Role } from '@/lib/types';

type Item = { href: string; label: string; icon: React.ElementType; roles?: Role[] };

const CENTRALE: Item[] = [
  { href: '/centrale', label: 'Centrale', icon: Activity },
  { href: '/incidents', label: 'Incidents', icon: ShieldAlert },
  { href: '/interventions', label: 'Interventions', icon: Siren },
  { href: '/rondes', label: 'Rondes', icon: Footprints },
  { href: '/scans', label: 'Passages & anomalies', icon: ScanLine },
  { href: '/alertes', label: 'Alertes', icon: Bell },
  { href: '/rapports', label: 'Rapports', icon: BarChart3 },
];

const ADMIN: Item[] = [
  { href: '/admin/sites', label: 'Sites & points', icon: MapPin, roles: ['admin', 'super_admin'] },
  { href: '/admin/shifts', label: 'Shifts', icon: Clock, roles: ['admin', 'super_admin'] },
  { href: '/admin/types-rondes', label: 'Types de rondes', icon: Fingerprint, roles: ['admin', 'super_admin'] },
  { href: '/admin/plannings', label: 'Plannings', icon: CalendarClock, roles: ['admin', 'super_admin'] },
  { href: '/admin/utilisateurs', label: 'Rondiers & utilisateurs', icon: Users },
  { href: '/admin/equipes', label: 'Équipes d’intervention', icon: UsersRound },
  { href: '/admin/parametres', label: 'Paramètres', icon: Settings, roles: ['admin', 'super_admin'] },
  { href: '/admin/journal', label: 'Journal d’audit', icon: FileClock, roles: ['admin', 'super_admin'] },
];

export function Sidebar({ unreadAlerts }: { unreadAlerts: number }) {
  const pathname = usePathname();
  const { user, org, logout, isSuperAdmin } = useAuth();
  const { connected } = useSocket();
  if (!user) return null;

  const link = (i: Item) => {
    if (i.roles && !i.roles.includes(user.role)) return null;
    const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
    const Icon = i.icon;
    return (
      <Link
        key={i.href}
        href={i.href}
        className={clsx(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
          active ? 'bg-brand/15 font-medium text-white ring-1 ring-brand/40' : 'text-steel hover:bg-white/5 hover:text-white'
        )}
      >
        <Icon className={clsx('h-4 w-4', active && 'text-brand')} />
        <span className="flex-1">{i.label}</span>
        {i.href === '/alertes' && unreadAlerts > 0 && (
          <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadAlerts > 99 ? '99+' : unreadAlerts}</span>
        )}
      </Link>
    );
  };

  return (
    <aside className="no-print flex h-screen w-64 shrink-0 flex-col border-r border-line bg-[#0e0e10]">
      <div className="border-b border-line px-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-fameco.png" alt={org?.name || 'FAMECO'} className="h-auto w-full max-w-[190px]" />
        <div className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-steel">
          <span className={clsx('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-zinc-600')} />
          QR Patrol · {connected ? 'temps réel' : 'hors ligne'}
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {isSuperAdmin && (
          <div className="space-y-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Plateforme</p>
            {link({ href: '/plateforme', label: 'Sociétés clientes', icon: Building2 })}
          </div>
        )}
        {(!isSuperAdmin || org) && (
          <>
            <div className="space-y-1">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Centrale de sécurité</p>
              {CENTRALE.map(link)}
            </div>
            <div className="space-y-1">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Administration</p>
              {ADMIN.map(link)}
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-line p-3">
        {isSuperAdmin && org && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-panel-2 px-3 py-2 text-xs text-steel-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Société : <strong className="text-white">{org.name}</strong>
          </div>
        )}
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          {user.photo?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photo.url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/20 text-sm font-bold text-brand">
              {user.firstName[0]}
              {user.lastName[0]}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-[11px] text-steel">{ROLE_LABELS[user.role]}</p>
          </div>
          <button onClick={logout} title="Déconnexion" className="rounded p-1.5 text-steel hover:bg-white/5 hover:text-brand">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
