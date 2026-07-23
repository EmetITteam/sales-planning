'use client';

/**
 * Хук інсайтів по брендах Тижневого звіту (топ-3 акції + «купили по фокусу»
 * + усього купивших) — з /api/weekly-report/brand-insights (таблиця sales).
 */
import { useEffect, useState } from 'react';
import type { BrandInsight } from './weekly-brand-insights';

export function useBrandInsights(region: string | null, regionName: string | null, logins: string[] | null, period: string | null, asOfDate?: string | null) {
  const [insights, setInsights] = useState<Record<string, BrandInsight>>({});
  const [loading, setLoading] = useState(false);
  const loginsKey = (logins ?? []).join(',');

  useEffect(() => {
    if (!region || !regionName || !period) { setInsights({}); return; }
    let cancelled = false;
    setLoading(true);
    // asOfDate — та сама дата відсічки, що воронка, щоб числа збігались.
    const asOfParam = asOfDate ? `&asOfDate=${encodeURIComponent(asOfDate)}` : '';
    // regionName → division (факт по підрозділу); logins — лише для focusParticipants.
    fetch(`/api/weekly-report/brand-insights?region=${encodeURIComponent(region)}&regionName=${encodeURIComponent(regionName)}&logins=${encodeURIComponent(loginsKey)}&period=${encodeURIComponent(period)}${asOfParam}`, { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : { brands: {} }))
      .then((d: { brands?: Record<string, BrandInsight> }) => { if (!cancelled) setInsights(d.brands ?? {}); })
      .catch(() => { /* мовчки */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [region, regionName, loginsKey, period, asOfDate]);

  return { insights, loading };
}
