'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Loading } from '@/components/ui';

export default function Home() {
  const { user, loading, isSuperAdmin, org } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (isSuperAdmin && !org) router.replace('/plateforme');
    else router.replace('/centrale');
  }, [user, loading, isSuperAdmin, org, router]);
  return <Loading />;
}
