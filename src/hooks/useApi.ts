import { useCallback, useEffect, useRef, useState } from "react";

interface ApiState<T> {
  data: T | null;
  loading: boolean; // true only during initial load (no data yet)
  refreshing: boolean; // true during any fetch
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(
  fn: () => Promise<T>,
  deps: React.DependencyList,
  interval?: number,
): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counterRef = useRef(0);

  // background re polls
  const hasDataRef = useRef(false);

  const fetch = useCallback(async () => {
    const id = ++counterRef.current;
    if (!hasDataRef.current) setLoading(true); // spinner only on initial load
    setRefreshing(true);
    setError(null);
    try {
      const result = await fn();
      if (id === counterRef.current) {
        hasDataRef.current = true;
        setData(result);
      }
    } catch (e) {
      if (id === counterRef.current)
        setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      if (id === counterRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    fetch();
    if (!interval) return;
    const id = setInterval(fetch, interval);
    return () => clearInterval(id);
  }, [fetch, interval]);

  return { data, loading, refreshing, error, refetch: fetch };
}
