/**
 * Фіналізація Зведеного звіту РОП (rop_report_finalization) — per період×тиждень.
 * finalized_at → звіт здано (лок редагування 4.5/4.4 цього тижня + нотіф CSO/CMO).
 * Server-side (service_role); доступ гейтить роут.
 */
import { supabase } from './supabase';

export interface RopFinalization {
  period: string;
  week: string;
  finalized_at: string | null;
  finalized_by: string | null;
}

/** Статус фіналізації одного тижня (null-поля якщо не фіналізовано). */
export async function readRopFinalization(period: string, week: string): Promise<RopFinalization> {
  const { data, error } = await supabase.from('rop_report_finalization')
    .select('period,week,finalized_at,finalized_by')
    .eq('period', period).eq('week', week);
  if (error) throw new Error(`readRopFinalization: ${error.message}`);
  const row = Array.isArray(data) && data.length > 0 ? (data[0] as unknown as RopFinalization) : null;
  return row ?? { period, week, finalized_at: null, finalized_by: null };
}

/** Чи фіналізовано (тиждень заблоковано на редагування). */
export async function isRopWeekFinalized(period: string, week: string): Promise<boolean> {
  const st = await readRopFinalization(period, week);
  return !!st.finalized_at;
}

/** Фіналізувати (finalized_at=NOW). No-op якщо вже фіналізовано. */
export async function finalizeRopReport(period: string, week: string, byLogin: string): Promise<RopFinalization> {
  const finalizedAt = new Date().toISOString();
  const { error } = await supabase.from('rop_report_finalization').upsert({
    period, week, finalized_at: finalizedAt, finalized_by: byLogin,
  }, { onConflict: 'period,week' });
  if (error) throw new Error(`finalizeRopReport: ${error.message}`);
  return { period, week, finalized_at: finalizedAt, finalized_by: byLogin };
}

/** Пере-відкрити (finalized_at=NULL). */
export async function unfinalizeRopReport(period: string, week: string): Promise<void> {
  const { error } = await supabase.from('rop_report_finalization').upsert({
    period, week, finalized_at: null, finalized_by: null,
  }, { onConflict: 'period,week' });
  if (error) throw new Error(`unfinalizeRopReport: ${error.message}`);
}
