/**
 * Dynamic plan segments — сегменти для яких plan=fact дзеркально.
 *
 * Створено 2026-07-01. Перший юз-кейс: NEURONOX (обмежений залишок товарів).
 */

import { supabase } from './supabase';

export interface DynamicPlanSegmentRule {
  id: string;
  segment_code: string;
  enabled_from: string;   // YYYY-MM-DD
  enabled_to: string | null;
  strategy: 'mirror_fact';
  reason: string | null;
  created_by: string;
  created_at: string;
}

/**
 * 60-секундний in-memory кеш активних правил per period.
 * Ключ: '2026-07' (YYYY-MM) → { segmentCodes: Set<string>, rules: [...] }
 */
let cache: {
  key: string;
  segmentCodes: Set<string>;
  rules: DynamicPlanSegmentRule[];
  expiresAt: number;
} | null = null;

const CACHE_TTL_MS = 60_000;

/**
 * Активні правила для конкретного місяця.
 * Правило вважається активним якщо:
 *   enabled_from <= 1 число місяця
 *   AND (enabled_to IS NULL OR enabled_to >= 1 число місяця)
 */
export async function getActiveDynamicSegments(periodMonth: string): Promise<{
  segmentCodes: Set<string>;
  rules: DynamicPlanSegmentRule[];
}> {
  // periodMonth формату 'YYYY-MM-DD' (перше число місяця) або 'YYYY-MM'
  const monthKey = periodMonth.slice(0, 7); // '2026-07'
  const firstOfMonth = `${monthKey}-01`;

  const now = Date.now();
  if (cache && cache.key === monthKey && cache.expiresAt > now) {
    return { segmentCodes: cache.segmentCodes, rules: cache.rules };
  }

  try {
    // Фільтр: enabled_from <= firstOfMonth AND (enabled_to IS NULL OR enabled_to >= firstOfMonth)
    const result = await supabase
      .from('dynamic_plan_segments')
      .select('*')
      .lte('enabled_from', firstOfMonth);

    if (result.error || !result.data) {
      return { segmentCodes: new Set(), rules: [] };
    }

    const rules = (result.data as unknown as DynamicPlanSegmentRule[]).filter(r =>
      r.enabled_to === null || r.enabled_to >= firstOfMonth,
    );
    const segmentCodes = new Set(rules.map(r => r.segment_code));

    cache = { key: monthKey, segmentCodes, rules, expiresAt: now + CACHE_TTL_MS };
    return { segmentCodes, rules };
  } catch {
    return { segmentCodes: new Set(), rules: [] };
  }
}

/**
 * Всі правила (незалежно від активності) — для admin UI listing.
 */
export async function getAllDynamicSegments(): Promise<DynamicPlanSegmentRule[]> {
  const result = await supabase
    .from('dynamic_plan_segments')
    .select('*')
    .order('enabled_from', { ascending: false });
  if (result.error || !result.data) return [];
  return result.data as unknown as DynamicPlanSegmentRule[];
}

/**
 * Створити нове правило.
 */
export async function createDynamicSegment(input: {
  segment_code: string;
  enabled_from: string;
  enabled_to?: string | null;
  reason?: string | null;
  created_by: string;
}): Promise<{ ok: boolean; error?: string; rule?: DynamicPlanSegmentRule }> {
  try {
    const result = await supabase.from('dynamic_plan_segments').insert([{
      segment_code: input.segment_code,
      enabled_from: input.enabled_from,
      enabled_to: input.enabled_to ?? null,
      strategy: 'mirror_fact',
      reason: input.reason ?? null,
      created_by: input.created_by,
    }]).select('*');

    if (result.error) return { ok: false, error: result.error.message };
    cache = null; // інвалідуємо кеш
    return { ok: true, rule: (result.data as unknown as DynamicPlanSegmentRule[])[0] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

/**
 * Деактивувати правило — ставимо enabled_to = сьогодні (щоб з завтра не діяло,
 * але поточний місяць лишається — це задум).
 * Або, якщо хочемо ЖОРСТКО прибрати з поточного місяця теж → окрема функція.
 * Тут використовуємо м'який variant.
 */
export async function deactivateDynamicSegment(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await supabase
      .from('dynamic_plan_segments')
      .update({ enabled_to: today })
      .eq('id', id);
    if (result.error) return { ok: false, error: result.error.message };
    cache = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

/**
 * Повністю видалити правило (для випадкових помилок при створенні).
 */
export async function deleteDynamicSegment(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await supabase.from('dynamic_plan_segments').delete().eq('id', id);
    if (result.error) return { ok: false, error: result.error.message };
    cache = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
