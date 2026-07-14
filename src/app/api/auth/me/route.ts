/**
 * GET /api/auth/me — повертає поточну сесію (з cookie) або 401.
 *
 * Клієнт викликає це на mount щоб дізнатись чи є валідна сесія.
 * Якщо null → редірект на login. Якщо є → populate Zustand store.
 *
 * v2 (2026-05-19): дополнительно SELECT users.can_edit_stages_after_finalize
 * з БД щоб frontend знав чи можна редагувати etap після фіналізації.
 * НЕ ставимо у JWT (інакше треба re-login після кожної зміни флага) — fetch
 * на кожному виклику /api/auth/me, який і так робиться ~1 раз на mount.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { getActiveRegionGrants } from '@/lib/region-access';

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error }, { status: 401 });
  }
  const session = await getSession();
  if (!session) return Response.json({ user: null });

  // Fetch fresh permission flags з БД (не з JWT — щоб toggle админа діяв одразу
  // після наступного /api/auth/me, без re-login). Якщо колонок ще немає
  // (до applі M9/M10) — fallback false.
  let canEditStagesAfterFinalize = false;
  let canViewCompanyOverview = false;
  let canUnfinalizePlans = false;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('can_edit_stages_after_finalize, can_view_company_overview, can_unfinalize_plans')
      .eq('login', session.login);
    if (!error && Array.isArray(data) && data.length > 0) {
      canEditStagesAfterFinalize = !!data[0].can_edit_stages_after_finalize;
      canViewCompanyOverview = !!data[0].can_view_company_overview;
      canUnfinalizePlans = !!data[0].can_unfinalize_plans;
    }
  } catch {
    // Колонки не існують — мовчки лишаємо false.
  }

  // Активні тимчасові гранти на перегляд регіону (планёрки). Read fresh — грант
  // може бути виданий/відкликаний без re-login.
  const activeGrants = await getActiveRegionGrants(session.login);

  return Response.json({
    user: {
      login: session.login,
      fullName: session.fullName,
      role: session.role,
      region: session.region,
      regionCode: session.regionCode,
      managedUsers: session.managedUsers,
      canEditStagesAfterFinalize,
      canViewCompanyOverview,
      canUnfinalizePlans,
      regionGrants: activeGrants.map(g => ({
        regionCode: g.region_code,
        regionName: g.region_name,
        validTo: g.valid_to,
      })),
    },
  });
}
