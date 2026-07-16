/**
 * Доступ до Тижневого звіту по регіону (спільна логіка для notes + finalize).
 *
 *   allowedForRegion — чи може session читати/писати звіт цього регіону:
 *     admin / director / страт-логін → будь-який регіон;
 *     РМ → «домашній» регіон + MULTI_REGION_RM_OVERRIDES/гранти;
 *     інші ролі → ЛИШЕ за активним грантом на цей регіон.
 *
 *   seesAllReports — оверсайт-роль, що бачить зведення по всіх регіонах
 *     (admin/director/страт/canViewCompanyOverview).
 */
import { isStrategicKpiLogin } from './feature-flags';
import { resolveRegionOverrides } from './region-access';
import { supabase } from './supabase';

export interface WeeklyAccessSession {
  role: string;
  login: string;
  regionCode?: string;
}

export async function allowedForRegion(
  session: WeeklyAccessSession | null,
  regionCode: string,
): Promise<boolean> {
  if (!session || !regionCode) return false;
  if (session.role === 'admin' || session.role === 'director') return true;
  if (isStrategicKpiLogin(session.login)) return true;
  // resolveRegionOverrides = MULTI_REGION_RM_OVERRIDES ∪ активні гранти.
  const grantCodes = new Set<string>((await resolveRegionOverrides(session.login)) ?? []);
  if (session.role === 'rm') return regionCode === session.regionCode || grantCodes.has(regionCode);
  return grantCodes.has(regionCode);
}

/**
 * Оверсайт-роль — бачить зведення фіналізації по всіх регіонах.
 * canViewCompanyOverview НЕ у JWT (toggle має діяти одразу) → читаємо з БД,
 * як у /api/admin/company-overview. Тому async.
 */
export async function seesAllReports(session: WeeklyAccessSession | null): Promise<boolean> {
  if (!session) return false;
  if (session.role === 'admin' || session.role === 'director' || isStrategicKpiLogin(session.login)) return true;
  try {
    const { data } = await supabase
      .from('users')
      .select('can_view_company_overview')
      .eq('login', session.login);
    return !!(Array.isArray(data) && data[0]?.can_view_company_overview);
  } catch {
    return false; // колонка ще не існує / помилка → тільки явні оверсайт-ролі
  }
}
