/**
 * Ринкові сигнали Зведеного звіту РОП (market_signals) — список per період.
 * Секція 4.5 Регламенту. Server-side (service_role); доступ гейтить роут.
 *
 * Поля за регламентом (макет rop-report.html): текст сигналу · джерело · кому
 * (→ CPO/CMO) · дедлайн. Пріоритет/статус НЕ використовуємо (migration 064).
 */
import { supabase } from './supabase';

export interface MarketSignal {
  id: string;
  period: string;
  signal: string;
  source: string | null;
  recipient: string | null;   // «кому» — адресат ескалації (→ CPO/CMO)
  deadline: string | null;    // 'YYYY-MM-DD'
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SignalInput {
  signal: string;
  source?: string | null;
  recipient?: string | null;
  deadline?: string | null;
}

/** Усі сигнали за період (найновіші перші). */
export async function listMarketSignals(period: string): Promise<MarketSignal[]> {
  const { data, error } = await supabase.from('market_signals')
    .select('id,period,signal,source,recipient,deadline,created_by,created_at,updated_at')
    .eq('period', period)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listMarketSignals: ${error.message}`);
  return (data ?? []) as unknown as MarketSignal[];
}

/** Додати сигнал. Повертає створений рядок (insert → return=representation). */
export async function addMarketSignal(period: string, input: SignalInput, byLogin: string): Promise<MarketSignal> {
  const { data, error } = await supabase.from('market_signals').insert([{
    period,
    signal: input.signal,
    source: input.source ?? null,
    recipient: input.recipient ?? null,
    deadline: input.deadline || null,
    created_by: byLogin,
  }]).select('*');
  if (error) throw new Error(`addMarketSignal: ${error.message}`);
  const rows = (data ?? []) as unknown as MarketSignal[];
  if (!rows.length) throw new Error('addMarketSignal: no row returned');
  return rows[0];
}

/** Оновити сигнал (часткове). */
export async function updateMarketSignal(id: string, patch: Partial<SignalInput>): Promise<void> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ['signal', 'source', 'recipient', 'deadline'] as const) {
    if (patch[k] !== undefined) upd[k] = k === 'deadline' ? (patch[k] || null) : patch[k];
  }
  const { error } = await supabase.from('market_signals').update(upd).eq('id', id);
  if (error) throw new Error(`updateMarketSignal: ${error.message}`);
}

/** Видалити сигнал. */
export async function deleteMarketSignal(id: string): Promise<void> {
  const { error } = await supabase.from('market_signals').delete().eq('id', id);
  if (error) throw new Error(`deleteMarketSignal: ${error.message}`);
}
