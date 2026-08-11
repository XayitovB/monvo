import { useEffect, useState, useCallback } from 'react';

// useApi(fetcher, deps) — runs `fetcher` on mount + whenever deps change.
// Returns { data, loading, error, reload }.
export function useApi(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const run = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher({ signal });
      if (!signal?.aborted) setData(result);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const ac = new AbortController();
    run(ac.signal);
    return () => ac.abort();
  }, [run]);

  return { data, loading, error, reload: () => run() };
}
