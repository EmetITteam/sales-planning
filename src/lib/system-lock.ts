/**
 * System Lock — kill-switch для всієї системи у форс-мажорі.
 *
 * Прапорець у Supabase `system_settings`. Перевіряється на:
 *   - /api/auth/login (блокує login для не-admin)
 *   - /api/onec proxy (блокує всі 1С запити)
 *   - усі sensitive routes де хочемо guard
 *
 * Frontend при отриманні 503 SYSTEM_LOCKED → редирект на /system-locked.
 *
 * Створено 2026-06-26 за запитом адміна.
 */

import { supabase } from './supabase';
import { isAdminLogin } from './feature-flags';

export interface SystemLockState {
  locked: boolean;
  reason: string | null;
  locked_at: string | null; // ISO timestamp
  locked_by: string | null;
}

// Кеш у memory щоб не бити Supabase на кожен запит. TTL 5 секунд —
// достатньо щоб admin розблокування побачили швидко, але не перевантажує БД.
let cache: { value: SystemLockState; expiresAt: number } | null = null;
const TTL_MS = 5_000;

/**
 * Читає поточний стан system lock з БД.
 * Cached 5 сек у memory.
 */
export async function getSystemLockState(): Promise<SystemLockState> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }

  try {
    const result = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'system_locked')
      .limit(1);

    if (result.error || !result.data || result.data.length === 0) {
      // Якщо рядка нема (migration не запустилась) — система відкрита.
      // Безпечний default — не блокуємо у разі помилки БД.
      const fallback: SystemLockState = { locked: false, reason: null, locked_at: null, locked_by: null };
      cache = { value: fallback, expiresAt: now + TTL_MS };
      return fallback;
    }

    const row = result.data[0] as { value: SystemLockState };
    cache = { value: row.value, expiresAt: now + TTL_MS };
    return row.value;
  } catch {
    // У разі мережевої помилки — теж fail-open (не блокуємо).
    // Альтернатива fail-closed зробила б систему недоступною при падінні Supabase.
    const fallback: SystemLockState = { locked: false, reason: null, locked_at: null, locked_by: null };
    cache = { value: fallback, expiresAt: now + TTL_MS };
    return fallback;
  }
}

/**
 * Оновлює стан system lock. Викликається тільки з /api/admin/system-lock.
 * Інвалідує локальний кеш одразу — наступний getSystemLockState() поверне нове значення.
 */
export async function setSystemLockState(state: {
  locked: boolean;
  reason?: string | null;
  updatedBy: string;
}): Promise<{ ok: boolean; error?: string }> {
  const value: SystemLockState = {
    locked: state.locked,
    reason: state.reason ?? null,
    locked_at: state.locked ? new Date().toISOString() : null,
    locked_by: state.locked ? state.updatedBy : null,
  };

  try {
    const result = await supabase
      .from('system_settings')
      .upsert({
        key: 'system_locked',
        value,
        updated_at: new Date().toISOString(),
        updated_by: state.updatedBy,
      }, { onConflict: 'key' });

    if (result.error) {
      return { ok: false, error: result.error.message };
    }

    // Інвалідуємо кеш одразу — наступний read поверне нове значення.
    cache = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

/**
 * Helper: чи доступ заблоковано для цього логіна?
 * Admin завжди має доступ навіть при locked=true.
 *
 * @returns null якщо доступ дозволено, або SystemLockState якщо заблоковано.
 */
export async function checkSystemLockForUser(login: string | null | undefined): Promise<SystemLockState | null> {
  const state = await getSystemLockState();
  if (!state.locked) return null;
  if (login && isAdminLogin(login)) return null; // admin bypass
  return state;
}

/**
 * Стандартний 503 Response при заблокованій системі.
 */
export function systemLockedResponse(state: SystemLockState): Response {
  return Response.json(
    {
      error: 'SYSTEM_LOCKED',
      message: state.reason || 'Система тимчасово недоступна.',
      lockedAt: state.locked_at,
    },
    { status: 503, headers: { 'Retry-After': '60' } },
  );
}
