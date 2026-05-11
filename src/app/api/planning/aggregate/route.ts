/**
 * Aggregate planning endpoint — повертає сумарний прогноз і потенціал
 * закриття розриву по списку менеджерів за конкретний період.
 *
 * Використовує дашборд РМ і Директора для розрахунку «Очікуваного %»
 * без N паралельних запитів за кожним менеджером.
 *
 * Запит:
 *   POST /api/planning/aggregate
 *   { periodId: number, logins: string[] }
 *
 * Відповідь:
 *   {
 *     totalForecast: number,    // Σ forecast_amount по всіх menagers + segments
 *     totalGapPotential: number, // Σ potential_amount
 *     bySegment: { [segmentCode]: { forecast, gap, forecastClients, gapClients } }
 *   }
 *
 * Security:
 *   - Session required
 *   - Director: будь-які logins
 *   - RM: тільки login ∈ session.managedUsers + session.login
 *   - Manager: тільки session.login (для самоперевірки)
 */

import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { periodId, logins } = body ?? {};
  const pid = parseInt(String(periodId), 10);
  if (isNaN(pid)) return Response.json({ error: 'periodId must be number' }, { status: 400 });
  if (!Array.isArray(logins) || logins.length === 0) {
    return Response.json({ error: 'logins must be non-empty array' }, { status: 400 });
  }
  if (logins.length > 100) {
    return Response.json({ error: 'too many logins (max 100)' }, { status: 400 });
  }

  // SECURITY: фільтруємо logins по правах сесії.
  // Director → всі дозволені.
  // RM → лише свій login + managedUsers.
  // Manager → тільки свій login.
  const sessionLogin = session.login.toLowerCase().trim();
  const allowed = new Set<string>([sessionLogin]);
  if (session.role === 'director') {
    // Director — всі logins що передали (бо managedUsers у нього не повний дерево).
    for (const l of logins) allowed.add(String(l).toLowerCase().trim());
  } else {
    // RM/Manager — тільки своя scope
    for (const l of session.managedUsers ?? []) allowed.add(l.toLowerCase().trim());
  }
  const safeLogins = (logins as unknown[])
    .map(l => String(l).toLowerCase().trim())
    .filter(l => allowed.has(l));
  if (safeLogins.length === 0) {
    return Response.json({ error: 'No allowed logins in scope' }, { status: 403 });
  }

  // Завантажуємо дві таблиці паралельно. Тільки потрібні поля.
  // У gap_closures добавляємо category — потрібно для розкладу по категоріях
  // (Сплячі / Втрачені / Нові / БЗ → агрегуємо у блок «Активізація» + «Нові» окремо).
  const [forecastsRes, gapsRes] = await Promise.all([
    supabase.from('forecasts')
      .select('user_id,segment_code,client_id_1c,forecast_amount')
      .eq('period_id', pid)
      .in('user_id', safeLogins),
    supabase.from('gap_closures')
      .select('user_id,segment_code,client_id_1c,potential_amount,category')
      .eq('period_id', pid)
      .in('user_id', safeLogins),
  ]);

  if (forecastsRes.error) {
    return Response.json({ error: `forecasts: ${forecastsRes.error.message}` }, { status: 500 });
  }
  if (gapsRes.error) {
    return Response.json({ error: `gap_closures: ${gapsRes.error.message}` }, { status: 500 });
  }

  type FRow = { user_id: string; segment_code: string; client_id_1c: string; forecast_amount: number };
  type GRow = { user_id: string; segment_code: string; client_id_1c: string; potential_amount: number; category: string | null };

  const forecasts = (forecastsRes.data ?? []) as FRow[];
  const gaps = (gapsRes.data ?? []) as GRow[];

  // Маппинг 1С-категорій (зберігаємо у gap_closures.category як приходить з 1С)
  // у наші UI-bucket-и: 'sleeping' | 'lost' | 'new' | 'none'.
  const mapGapCategory = (raw: string | null): 'sleeping' | 'lost' | 'new' | 'none' => {
    const c = (raw || '').toLowerCase().trim();
    if (c === 'спячий' || c === 'сплячий') return 'sleeping';
    if (c === 'потерянный' || c === 'втрачений') return 'lost';
    if (c === 'новый' || c === 'новий') return 'new';
    return 'none'; // 'без закупок' або порожнє
  };

  type CatStats = { plannedCount: number; plannedSum: number };
  type SegCategoryBlock = {
    active: CatStats;     // з forecasts
    sleeping: CatStats;   // з gap_closures category=Сплячий
    lost: CatStats;       // з gap_closures category=Втрачений
    new: CatStats;        // з gap_closures category=Новий
    none: CatStats;       // з gap_closures без категорії або 'Без закупок'
  };
  const emptyCat = (): CatStats => ({ plannedCount: 0, plannedSum: 0 });
  const emptySegBlock = (): SegCategoryBlock => ({
    active: emptyCat(), sleeping: emptyCat(), lost: emptyCat(), new: emptyCat(), none: emptyCat(),
  });

  let totalForecast = 0;
  let totalGapPotential = 0;
  const bySegment: Record<string, {
    forecast: number;
    gap: number;
    forecastClients: number;
    gapClients: number;
    byCategory: SegCategoryBlock;
  }> = {};

  const seenForecastClients = new Map<string, Set<string>>();
  const seenGapClients = new Map<string, Set<string>>();

  for (const f of forecasts) {
    const amount = Number(f.forecast_amount) || 0;
    totalForecast += amount;
    if (!bySegment[f.segment_code]) bySegment[f.segment_code] = { forecast: 0, gap: 0, forecastClients: 0, gapClients: 0, byCategory: emptySegBlock() };
    bySegment[f.segment_code].forecast += amount;
    bySegment[f.segment_code].byCategory.active.plannedSum += amount;
    bySegment[f.segment_code].byCategory.active.plannedCount += 1;
    if (!seenForecastClients.has(f.segment_code)) seenForecastClients.set(f.segment_code, new Set());
    seenForecastClients.get(f.segment_code)!.add(`${f.user_id}|${f.client_id_1c}`);
  }
  for (const g of gaps) {
    const amount = Number(g.potential_amount) || 0;
    totalGapPotential += amount;
    if (!bySegment[g.segment_code]) bySegment[g.segment_code] = { forecast: 0, gap: 0, forecastClients: 0, gapClients: 0, byCategory: emptySegBlock() };
    bySegment[g.segment_code].gap += amount;
    const cat = mapGapCategory(g.category);
    bySegment[g.segment_code].byCategory[cat].plannedSum += amount;
    bySegment[g.segment_code].byCategory[cat].plannedCount += 1;
    if (!seenGapClients.has(g.segment_code)) seenGapClients.set(g.segment_code, new Set());
    seenGapClients.get(g.segment_code)!.add(`${g.user_id}|${g.client_id_1c}`);
  }
  // Заповнюємо distinct counts
  for (const [seg, set] of seenForecastClients) bySegment[seg].forecastClients = set.size;
  for (const [seg, set] of seenGapClients) bySegment[seg].gapClients = set.size;

  return Response.json({
    totalForecast,
    totalGapPotential,
    bySegment,
    meta: {
      periodId: pid,
      logins: safeLogins.length,
      forecastRows: forecasts.length,
      gapRows: gaps.length,
    },
  });
}
