'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

type Query = Record<string, string | number | boolean | undefined | null>;

/** Petit hook de chargement de données (GET) avec rechargement manuel. */
export function useApi<T>(path: string | null, query?: Query, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const queryKey = JSON.stringify(query || {});
  const reqId = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!path) return;
      const id = ++reqId.current;
      if (!silent) setLoading(true);
      try {
        const res = await api<T>(path, { query: JSON.parse(queryKey) });
        if (id === reqId.current) {
          setData(res);
          setError(null);
        }
      } catch (e) {
        if (id === reqId.current) setError(e as Error);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, queryKey, ...deps]
  );

  useEffect(() => {
    load();
  }, [load]);

  return { data, setData, error, loading, reload: load };
}
