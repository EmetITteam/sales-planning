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

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error }, { status: 401 });
  }
  const session = await getSession();
  if (!session) return Response.json({ user: null });

  // Fetch fresh permission flag з БД (не з JWT — щоб toggle админа діяв одразу
  // після наступного /api/auth/me, без re-login). Якщо колонки ще немає (до
  // applы M9) — fallback false.
  let canEditStagesAfterFinalize = false;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('can_edit_stages_after_finalize')
      .eq('login', session.login);
    if (!error && Array.isArray(data) && data.length > 0) {
      canEditStagesAfterFinalize = !!data[0].can_edit_stages_after_finalize;
    }
  } catch {
    // Колонка не існує (M9 ще не applied) — мовчки залишаємо false.
  }

  return Response.json({
    user: {
      login: session.login,
      fullName: session.fullName,
      role: session.role,
      region: session.region,
      regionCode: session.regionCode,
      managedUsers: session.managedUsers,
      canEditStagesAfterFinalize,
    },
  });
}
