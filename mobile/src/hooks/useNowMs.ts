/**
 * useNowMs — render-safe wall-clock reads.
 *
 * The react-hooks compiler rules forbid calling `Date.now()` during render
 * (impure). This hook samples the clock in a lazy state initializer and,
 * optionally, keeps it fresh on an interval so staleness banners / "days
 * since" labels update without re-mount.
 */
import { useEffect, useState } from 'react';

export function useNowMs(refreshMs?: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!refreshMs) return;
    const id = setInterval(() => setNow(Date.now()), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  return now;
}
