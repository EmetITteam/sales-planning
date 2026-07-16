'use client';

/**
 * Хук статусу фіналізації Тижневого звіту одного регіону за тиждень.
 * finalize()/unfinalize() — оптимістичне оновлення локального стану.
 */
import { useCallback, useEffect, useState } from 'react';

export interface ReportFinalization {
  finalizedAt: string | null;
  finalizedBy: string | null;
}

export function useReportFinalization(regionCode: string | null, weekKey: string | null) {
  const [state, setState] = useState<ReportFinalization>({ finalizedAt: null, finalizedBy: null });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!regionCode || !weekKey) { setState({ finalizedAt: null, finalizedBy: null }); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/weekly-report/finalize?region=${encodeURIComponent(regionCode)}&week=${encodeURIComponent(weekKey)}`, { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : { status: null }))
      .then((d: { status?: { finalized_at: string | null; finalized_by: string | null } }) => {
        if (cancelled) return;
        setState({ finalizedAt: d.status?.finalized_at ?? null, finalizedBy: d.status?.finalized_by ?? null });
      })
      .catch(() => { /* мовчки */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [regionCode, weekKey]);

  const finalize = useCallback(async (): Promise<boolean> => {
    if (!regionCode || !weekKey) return false;
    setBusy(true);
    try {
      const r = await fetch('/api/weekly-report/finalize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ region_code: regionCode, week_key: weekKey }),
      });
      if (!r.ok) return false;
      const d = await r.json() as { status?: { finalized_at: string | null; finalized_by: string | null } };
      setState({ finalizedAt: d.status?.finalized_at ?? new Date().toISOString(), finalizedBy: d.status?.finalized_by ?? null });
      return true;
    } finally { setBusy(false); }
  }, [regionCode, weekKey]);

  const unfinalize = useCallback(async (): Promise<boolean> => {
    if (!regionCode || !weekKey) return false;
    setBusy(true);
    try {
      const r = await fetch('/api/weekly-report/finalize', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ region_code: regionCode, week_key: weekKey }),
      });
      if (!r.ok) return false;
      setState({ finalizedAt: null, finalizedBy: null });
      return true;
    } finally { setBusy(false); }
  }, [regionCode, weekKey]);

  return { ...state, loading, busy, finalize, unfinalize };
}
