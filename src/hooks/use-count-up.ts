'use client';

import { useEffect, useState } from 'react';

/**
 * useCountUp — анімує число від 0 до target за `durationMs`. ease-out.
 * Якщо target NaN/0 — повертає 0 без анімації.
 * Re-runs коли target змінюється (нові дані з SWR).
 *
 * @example
 *   const animated = useCountUp(filteredTotalFact);
 *   <p>${Math.round(animated).toLocaleString('en-US')}</p>
 */
export function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(target) || target === 0) {
      // Reset через setState — це external state sync (RAF cancellation).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(0);
      return;
    }
    if (typeof window === 'undefined') return;
    // Респектуємо prefers-reduced-motion — без анімації.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      // setValue у RAF callback — це async (microtask), не sync у effect body.
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}
