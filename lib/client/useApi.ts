'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/**
 * Fetch JSON from an API path. Keeps the previous data while refetching (no layout jump).
 * `reload()` refetches; `path = null` pauses.
 */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) return;
    const ctrl = new AbortController();
    let alive = true;
    setLoading(true);
    api<T>(path, { signal: ctrl.signal })
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => {
        if (!alive || e.name === 'AbortError') return;
        setError(e.message);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData, initialLoading: loading && data === null };
}
