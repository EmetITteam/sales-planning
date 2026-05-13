/**
 * Завантажує planning_settings + planning_locks для конкретного місяця
 * з Supabase. Спільний helper для:
 *   - /api/planning/window-check (GET — статус для UI banner)
 *   - lib/window-guard.ts (POST guards у write-endpoints)
 *
 * Виконує 2 паралельні запити, повертає shape придатний для canPlanForMonth().
 */

import { supabase } from './supabase';
import type { PlanningLock, PlanningSettings } from './planning-window';

export async function loadSettingsAndLocks(month: string): Promise<{
  settings: PlanningSettings;
  locks: PlanningLock[];
}> {
  const monthNorm = month.slice(0, 7) + '-01';
  const [settingsRes, locksRes] = await Promise.all([
    supabase.from('planning_settings').select('window_days').eq('id', 1),
    supabase.from('planning_locks').select('scope,user_login,month,type,reason').eq('month', monthNorm),
  ]);
  const sRow = Array.isArray(settingsRes.data) && settingsRes.data.length > 0
    ? settingsRes.data[0]
    : { window_days: 5 };
  return {
    settings: { window_days: Number(sRow.window_days) || 5 },
    locks: (locksRes.data ?? []) as unknown as PlanningLock[],
  };
}
