/**
 * Тимчасовий доступ менеджера до перегляду всього регіону (планёрки).
 *
 * Server-side (service_role) — читає/пише `temporary_region_access`.
 * Активний грант: revoked_at IS NULL AND CURRENT_DATE у [valid_from; valid_to].
 *
 * Механізм даних — динамічне розширення MULTI_REGION_RM_OVERRIDES: активний
 * грант дає менеджеру ті самі region_code, що хардкоджений override
 * (Action 5 через директор-прокси + фільтр по регіонах). Див. resolveRegionOverrides.
 */
import { supabase } from './supabase';
import { MULTI_REGION_RM_OVERRIDES } from './feature-flags';

export interface RegionGrant {
  id: string;
  manager_login: string;
  region_code: string;
  region_name: string | null;
  manager_name: string | null;
  valid_from: string;   // YYYY-MM-DD
  valid_to: string;     // YYYY-MM-DD
  granted_by: string;
  created_at: string;
  revoked_at: string | null;
}

/** Поточна дата UTC 'YYYY-MM-DD'. Гранти денні (планёрки), tz-зсув несуттєвий. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isActive(g: RegionGrant, today: string): boolean {
  return g.revoked_at === null && g.valid_from <= today && g.valid_to >= today;
}

/**
 * Активні гранти менеджера на сьогодні.
 */
export async function getActiveRegionGrants(login: string | null | undefined): Promise<RegionGrant[]> {
  if (!login) return [];
  const l = login.toLowerCase().trim();
  try {
    const result = await supabase
      .from('temporary_region_access')
      .select('*')
      .eq('manager_login', l);
    if (result.error || !result.data) return [];
    const today = todayIso();
    return (result.data as unknown as RegionGrant[]).filter(g => isActive(g, today));
  } catch {
    return [];
  }
}

/**
 * region_code[] активних грантів менеджера (для view-routing / merge overrides).
 */
export async function getActiveRegionCodes(login: string | null | undefined): Promise<string[]> {
  const grants = await getActiveRegionGrants(login);
  return [...new Set(grants.map(g => g.region_code))];
}

/**
 * Ефективні region-overrides для логіну = хардкоджений MULTI_REGION_RM_OVERRIDES
 * ∪ активні гранти. undefined якщо нема жодного (щоб зберегти семантику
 * `!!overrideRegions`). ЗАМІНЮЄ синхронний MULTI_REGION_RM_OVERRIDES[login] у роутах.
 */
export async function resolveRegionOverrides(
  login: string | null | undefined,
): Promise<readonly string[] | undefined> {
  if (!login) return undefined;
  const l = login.toLowerCase().trim();
  const hardcoded = MULTI_REGION_RM_OVERRIDES[l];
  const granted = await getActiveRegionCodes(l);
  if (!hardcoded && granted.length === 0) return undefined;
  return [...new Set([...(hardcoded ?? []), ...granted])];
}

// ── Управління (директор / асистент / admin) ───────────────────────────────

/**
 * Усі гранти (активні + минулі + відкликані) — для списку у сторінці управління.
 * Найновіші зверху.
 */
export async function listRegionGrants(): Promise<RegionGrant[]> {
  try {
    const result = await supabase
      .from('temporary_region_access')
      .select('*')
      .order('created_at', { ascending: false });
    if (result.error || !result.data) return [];
    return result.data as unknown as RegionGrant[];
  } catch {
    return [];
  }
}

export interface CreateRegionGrantInput {
  manager_login: string;
  region_code: string;
  region_name?: string | null;
  manager_name?: string | null;
  valid_from: string;   // YYYY-MM-DD
  valid_to: string;     // YYYY-MM-DD
  granted_by: string;
}

export async function createRegionGrant(
  input: CreateRegionGrantInput,
): Promise<{ ok: boolean; error?: string; grant?: RegionGrant }> {
  if (input.valid_to < input.valid_from) {
    return { ok: false, error: 'valid_to раніше за valid_from' };
  }
  try {
    const result = await supabase.from('temporary_region_access').insert([{
      manager_login: input.manager_login.toLowerCase().trim(),
      region_code: input.region_code,
      region_name: input.region_name ?? null,
      manager_name: input.manager_name ?? null,
      valid_from: input.valid_from,
      valid_to: input.valid_to,
      granted_by: input.granted_by,
    }]).select('*');
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, grant: (result.data as unknown as RegionGrant[])[0] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'insert failed' };
  }
}

/**
 * Дострокове відкликання (ставимо revoked_at=now). Не видаляємо — для аудиту.
 */
export async function revokeRegionGrant(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await supabase
      .from('temporary_region_access')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'update failed' };
  }
}
