/**
 * Учасники фокусу (focus_participants) — снапшот на місяць. Server-side.
 */
import { supabase } from './supabase';

export interface FocusRow {
  period: string;
  client_id: string;
  segment_code: string;
  focus_name?: string | null;
  manager_login?: string | null;
  region_code?: string | null;
}

/** Кількість учасників фокусу per сегмент для регіону за період (унік. клієнти). */
export async function readFocusCountsByRegion(period: string, regionCode: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('focus_participants')
    .select('client_id,segment_code')
    .eq('period', period)
    .eq('region_code', regionCode);
  if (error) throw new Error(`readFocusCounts: ${error.message}`);
  const seen = new Set<string>();
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as unknown as { client_id: string; segment_code: string }[]) {
    const k = `${r.segment_code}|${r.client_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out[r.segment_code] = (out[r.segment_code] ?? 0) + 1;
  }
  return out;
}

/**
 * Замінює зріз учасників за період ДЛЯ УСПІШНИХ менеджерів: видаляє їхні рядки
 * періоду, потім вставляє свіжі. Менеджерів, що не відповіли, не чіпаємо.
 * `successfulLogins` порожній → no-op (щоб не витерти при повній невдачі).
 */
export async function replaceFocusParticipants(
  period: string, successfulLogins: string[], rows: FocusRow[],
): Promise<{ deleted: string[]; inserted: number }> {
  if (successfulLogins.length === 0) return { deleted: [], inserted: 0 };
  const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_BASE || !KEY) throw new Error('Supabase env missing');
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

  // DELETE (period, manager_login IN successfulLogins) — батчами по 50 логінів.
  for (let i = 0; i < successfulLogins.length; i += 50) {
    const batch = successfulLogins.slice(i, i + 50);
    const inList = batch.map(l => `"${l.replace(/"/g, '')}"`).join(',');
    const qs = `period=eq.${encodeURIComponent(period)}&manager_login=in.(${encodeURIComponent(inList)})`;
    const r = await fetch(`${URL_BASE}/rest/v1/focus_participants?${qs}`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } });
    if (!r.ok) throw new Error(`focus delete: HTTP ${r.status} ${(await r.text()).slice(0, 150)}`);
  }

  // INSERT свіжих (батчами по 500).
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from('focus_participants').insert(batch as unknown as Record<string, unknown>[]);
    if (error) throw new Error(`focus insert: ${error.message}`);
    inserted += batch.length;
  }
  return { deleted: successfulLogins, inserted };
}
