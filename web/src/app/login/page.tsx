'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [user, loading, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(identifier, password);
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-4">
      {/* Trame "acier" décorative */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: 'repeating-linear-gradient(135deg,#fff 0 1px,transparent 1px 14px)' }}
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fameco.png" alt="FAMECO — Votre partenaire en acier" className="w-72" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-steel">QR Patrol · Centrale de sécurité</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-panel/90 p-6 shadow-2xl backdrop-blur">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-steel-2">E-mail ou matricule</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel" />
              <input
                autoFocus
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="h-11 w-full rounded-lg border border-line bg-ink pl-10 pr-3 text-sm text-white focus:border-brand focus:outline-none"
                placeholder="centrale@fameco.cd"
                autoComplete="username"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-steel-2">Mot de passe</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel" />
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-lg border border-line bg-ink pl-10 pr-3 text-sm text-white focus:border-brand focus:outline-none"
                autoComplete="current-password"
              />
            </div>
          </div>
          {error && <p className="rounded-lg border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>}
          <Button type="submit" loading={busy} className="h-11 w-full">
            Se connecter
          </Button>
        </form>
        <p className="mt-6 text-center text-[11px] text-zinc-600">Les agents se connectent depuis l’application mobile QR Patrol.</p>
      </div>
    </main>
  );
}
