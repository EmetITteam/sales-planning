/**
 * Фіналізація Тижневого звіту (weekly_report_status) — per регіон × тиждень.
 * Server-side (service_role). Аналог period_summaries.finalized_at для планів.
 */
import { supabase } from './supabase';

export interface ReportStatus {
  region_code: string;
  week_key: string;
  finalized_at: string | null;
  finalized_by: string | null;
}

/** Статус звіту одного регіону за тиждень (null-поля якщо не фіналізовано). */
export async function getReportStatus(regionCode: string, weekKey: string): Promise<ReportStatus> {
  const { data, error } = await supabase.from('weekly_report_status')
    .select('region_code,week_key,finalized_at,finalized_by')
    .eq('region_code', regionCode)
    .eq('week_key', weekKey);
  if (error) throw new Error(`getReportStatus: ${error.message}`);
  const row = Array.isArray(data) && data.length > 0 ? (data[0] as unknown as ReportStatus) : null;
  return row ?? { region_code: regionCode, week_key: weekKey, finalized_at: null, finalized_by: null };
}

/** Усі фіналізовані регіони за тиждень (зведення директора). */
export async function listWeekStatuses(weekKey: string): Promise<ReportStatus[]> {
  const { data, error } = await supabase.from('weekly_report_status')
    .select('region_code,week_key,finalized_at,finalized_by')
    .eq('week_key', weekKey)
    .not('finalized_at', 'is', null);
  if (error) throw new Error(`listWeekStatuses: ${error.message}`);
  return (data ?? []) as unknown as ReportStatus[];
}

/** Фіналізувати (UPSERT finalized_at=NOW). No-op якщо вже фіналізовано. */
export async function finalizeReport(regionCode: string, weekKey: string, byLogin: string): Promise<ReportStatus> {
  const current = await getReportStatus(regionCode, weekKey);
  if (current.finalized_at) return current; // уже фіналізовано — no-op
  const finalizedAt = new Date().toISOString();
  const { error } = await supabase.from('weekly_report_status').upsert({
    region_code: regionCode,
    week_key: weekKey,
    finalized_at: finalizedAt,
    finalized_by: byLogin,
    updated_at: finalizedAt,
  }, { onConflict: 'region_code,week_key' });
  if (error) throw new Error(`finalizeReport: ${error.message}`);
  return { region_code: regionCode, week_key: weekKey, finalized_at: finalizedAt, finalized_by: byLogin };
}

/** Пере-відкрити (finalized_at=NULL). Custom wrapper без .update() → direct REST PATCH. */
export async function unfinalizeReport(regionCode: string, weekKey: string): Promise<void> {
  const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_BASE || !KEY) throw new Error('Supabase env missing');
  // Ручний querystring (як у lib/supabase.ts / finalize плану) — URLSearchParams
  // подвійно encode-ить і PostgREST не знаходить рядок.
  const qs = [
    `region_code=eq.${encodeURIComponent(regionCode)}`,
    `week_key=eq.${encodeURIComponent(weekKey)}`,
  ].join('&');
  const r = await fetch(`${URL_BASE}/rest/v1/weekly_report_status?${qs}`, {
    method: 'PATCH',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ finalized_at: null, finalized_by: null, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`unfinalizeReport: HTTP ${r.status}: ${text.slice(0, 200)}`);
  }
}
