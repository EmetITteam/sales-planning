/**
 * 4.5 Ринкові сигнали — 3 вільні текстові поля per період (rop_market_notes):
 *   failures — причини невиконання по червоним ТМ
 *   drivers  — драйвери виконання по зеленим ТМ
 *   other    — інші сигнали ринку
 * Server-side (service_role); доступ гейтить роут.
 */
import { supabase } from './supabase';

export type MarketNoteField = 'failures' | 'drivers' | 'other';
export const MARKET_NOTE_FIELDS: MarketNoteField[] = ['failures', 'drivers', 'other'];

export interface RopMarketNotes {
  failures: string;
  drivers: string;
  other: string;
}

const EMPTY: RopMarketNotes = { failures: '', drivers: '', other: '' };

/** Три поля сигналів за період (порожні рядки якщо не заповнено). */
export async function readRopMarketNotes(period: string): Promise<RopMarketNotes> {
  const { data, error } = await supabase.from('rop_market_notes')
    .select('field,note')
    .eq('period', period);
  if (error) throw new Error(`readRopMarketNotes: ${error.message}`);
  const out: RopMarketNotes = { ...EMPTY };
  for (const r of (data ?? []) as Array<{ field: MarketNoteField; note: string | null }>) {
    if (r.field in out) out[r.field] = r.note ?? '';
  }
  return out;
}

/** UPSERT одного поля (period × field). */
export async function upsertRopMarketNote(
  period: string, field: MarketNoteField, note: string, byLogin: string,
): Promise<void> {
  const { error } = await supabase.from('rop_market_notes').upsert({
    period,
    field,
    note,
    updated_by: byLogin,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'period,field' });
  if (error) throw new Error(`upsertRopMarketNote: ${error.message}`);
}
