/**
 * Ручні поля Зведеного звіту РОП (rop_report_meta) — per регіон × період.
 * Наразі: late_reason (причина затримки узгодження плану, 4.4). Server-side.
 */
import { supabase } from './supabase';

export interface RopReportMeta {
  period: string;
  region_code: string;
  late_reason: string | null;
  updated_by: string | null;
  updated_at: string;
}

/** Усі ручні поля за період (region_code → late_reason). */
export async function readRopMeta(period: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('rop_report_meta')
    .select('region_code,late_reason')
    .eq('period', period);
  if (error) throw new Error(`readRopMeta: ${error.message}`);
  const map = new Map<string, string>();
  for (const r of (data ?? []) as Array<{ region_code: string; late_reason: string | null }>) {
    if (r.late_reason) map.set(r.region_code, r.late_reason);
  }
  return map;
}

/** UPSERT причини затримки (ручний ввід РОП). Phase 2 — UI. */
export async function upsertLateReason(
  period: string, regionCode: string, reason: string, byLogin: string,
): Promise<void> {
  const { error } = await supabase.from('rop_report_meta').upsert({
    period,
    region_code: regionCode,
    late_reason: reason,
    updated_by: byLogin,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'period,region_code' });
  if (error) throw new Error(`upsertLateReason: ${error.message}`);
}
