/**
 * Власний зріз категорій клієнтів (client_category_history, SCD Type 2).
 *
 * 1С віддає ЛИШЕ поточну категорію (Action 8). Ми тримаємо історію з датами:
 *  - одна активна версія на клієнта (valid_to IS NULL);
 *  - версія на зміну (category, manager_login, region_code);
 *  - is_reserved — мутабельний флаг (оновлюється на місці);
 *  - зниклий у всіх менеджерів клієнт → закриваємо (valid_to = дата).
 *
 * Читання (server-side, service_role) — для Тижневого звіту (База / категорії /
 * резерв з БД, миттєво). Синк — backfill + погодинний крон (Action 8).
 */
import { supabase } from './supabase';

export type ClientCat = 'active' | 'sleeping' | 'lost' | 'new' | 'none';

/** Свіжий рядок зі снапшоту 1С (Action 8), вже змапований у UI-категорію. */
export interface SnapshotRow {
  clientId: string;
  clientName?: string;
  category: ClientCat;
  managerLogin: string;
  regionCode: string;
  isReserved: boolean;
}

/** Активна версія клієнта з БД. */
export interface ActiveRow {
  id: string;
  client_id: string;
  client_name: string | null;
  category: ClientCat;
  manager_login: string;
  region_code: string;
  is_reserved: boolean;
  valid_from: string;
}

export interface SyncStats {
  fresh: number;
  activeBefore: number;
  inserted: number;   // нові клієнти
  versioned: number;  // зміна (category|manager|region) → закрито+відкрито
  reserveUpdated: number;
  closed: number;     // зниклі клієнти
}

/** Читає активні версії (valid_to IS NULL). Опційно — по регіону. Пагінація. */
export async function readActiveRoster(regionCode?: string): Promise<ActiveRow[]> {
  const out: ActiveRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from('client_category_history')
      .select('id,client_id,client_name,category,manager_login,region_code,is_reserved,valid_from')
      .is('valid_to', null);
    if (regionCode) q = q.eq('region_code', regionCode);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`readActiveRoster: ${error.message}`);
    const rows = (data ?? []) as unknown as ActiveRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Читає активні версії по списку логінів менеджерів (для регіону у звіті). */
export async function readActiveRosterByLogins(logins: string[]): Promise<ActiveRow[]> {
  if (logins.length === 0) return [];
  const out: ActiveRow[] = [];
  const CHUNK = 100;
  for (let i = 0; i < logins.length; i += CHUNK) {
    const slice = logins.slice(i, i + CHUNK);
    const { data, error } = await supabase.from('client_category_history')
      .select('id,client_id,client_name,category,manager_login,region_code,is_reserved,valid_from')
      .is('valid_to', null)
      .in('manager_login', slice);
    if (error) throw new Error(`readActiveRosterByLogins: ${error.message}`);
    out.push(...((data ?? []) as unknown as ActiveRow[]));
  }
  return out;
}

/**
 * Застосовує повний снапшот (усі менеджери за один прохід) до БД за SCD2.
 * `fresh` — свіжі рядки з 1С; `monthFirstIso` — 1-ше поточного місяця (valid_from
 * для змін категорії); `todayIso` — сьогодні (valid_to закриттів, valid_from
 * для переїздів менеджера). БЕЗ транзакцій (PostgREST) — порядок: закриття → вставки.
 */
export async function syncClientCategories(
  fresh: SnapshotRow[],
  monthFirstIso: string,
  todayIso: string,
  successfulLogins?: Set<string>,
): Promise<SyncStats> {
  const active = await readActiveRoster();
  const activeById = new Map<string, ActiveRow>(active.map(r => [r.client_id, r]));
  const freshById = new Map<string, SnapshotRow>();
  for (const f of fresh) if (f.clientId) freshById.set(f.clientId, f); // 1 клієнт = 1 менеджер

  const toClose: string[] = [];                 // id версій для закриття
  const toInsert: Record<string, unknown>[] = []; // нові активні рядки
  const reserveTrue: string[] = [];             // id → is_reserved=true
  const reserveFalse: string[] = [];            // id → is_reserved=false
  let versioned = 0, inserted = 0;

  for (const f of freshById.values()) {
    const cur = activeById.get(f.clientId);
    if (!cur) {
      toInsert.push(newRow(f, monthFirstIso));
      inserted++;
      continue;
    }
    const tupleChanged = cur.category !== f.category
      || cur.manager_login !== f.managerLogin
      || cur.region_code !== f.regionCode;
    if (tupleChanged) {
      // Закриваємо стару, відкриваємо нову. valid_from: зміна категорії — 1-ше
      // місяця; лише переїзд менеджера/регіону — сьогодні.
      const from = cur.category !== f.category ? monthFirstIso : todayIso;
      toClose.push(cur.id);
      toInsert.push(newRow(f, from));
      versioned++;
    } else if (cur.is_reserved !== f.isReserved) {
      (f.isReserved ? reserveTrue : reserveFalse).push(cur.id);
    }
  }
  // Зниклі клієнти (є активна версія, але у свіжому снапшоті нема) → закрити.
  // ⚠️ ТІЛЬКИ серед менеджерів, що успішно відповіли цього прогону — інакше
  // упавший (timeout) менеджер «загубив» би всіх своїх клієнтів з БД.
  for (const r of active) {
    if (freshById.has(r.client_id)) continue;
    if (successfulLogins && !successfulLogins.has(r.manager_login)) continue;
    toClose.push(r.id);
  }

  // Застосування: спершу закриття (щоб не порушити unique active), потім вставки.
  await patchByIds(toClose, { valid_to: todayIso });
  await patchByIds(reserveTrue, { is_reserved: true, updated_at: new Date(todayIso).toISOString() });
  await patchByIds(reserveFalse, { is_reserved: false, updated_at: new Date(todayIso).toISOString() });
  await insertRows(toInsert);

  return {
    fresh: freshById.size,
    activeBefore: active.length,
    inserted,
    versioned,
    reserveUpdated: reserveTrue.length + reserveFalse.length,
    closed: toClose.length,
  };
}

function newRow(f: SnapshotRow, validFrom: string): Record<string, unknown> {
  return {
    client_id: f.clientId,
    client_name: f.clientName ?? null,
    category: f.category,
    manager_login: f.managerLogin,
    region_code: f.regionCode,
    is_reserved: f.isReserved,
    valid_from: validFrom,
    valid_to: null,
  };
}

/** PATCH пачками по id (PostgREST in.()), одне значення на пачку. */
async function patchByIds(ids: string[], patch: Record<string, unknown>): Promise<void> {
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { error } = await supabase.from('client_category_history').update(patch).in('id', slice);
    if (error) throw new Error(`patchByIds: ${error.message}`);
  }
}

async function insertRows(rows: Record<string, unknown>[]): Promise<void> {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('client_category_history').insert(slice);
    if (error) throw new Error(`insertRows: ${error.message}`);
  }
}
