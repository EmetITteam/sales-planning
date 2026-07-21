'use client';

/**
 * Хук інсайтів по брендах Тижневого звіту (топ-3 акції + «купили по фокусу»
 * + усього купивших) — з /api/weekly-report/brand-insights (таблиця sales).
 */
import { useEffect, useState } from 'react';
import type { BrandInsight } from './weekly-brand-insights';

export function useBrandInsights(region: string | null, division: string | null, period: string | null) {
  const [insights, setInsights] = useState<Record<string, BrandInsight>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!region || !division || !period) { setInsights({}); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/weekly-report/brand-insights?region=${encodeURIComponent(region)}&division=${encodeURIComponent(division)}&period=${encodeURIComponent(period)}`, { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : { brands: {} }))
      .then((d: { brands?: Record<string, BrandInsight> }) => { if (!cancelled) setInsights(d.brands ?? {}); })
      .catch(() => { /* мовчки */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [region, division, period]);

  return { insights, loading };
}
