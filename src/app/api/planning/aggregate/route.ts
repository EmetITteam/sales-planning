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
import { monthlyPidFromMonth, monthlyPidFromAnyPid } from '@/lib/periods';
import { loadSettingsAndLocks } from '@/lib/load-window-state';
import { canPlanForMonth } from '@/lib/planning-window';
import { isPassiveAmount } from '@/lib/passive-rows';

export async function POST(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { periodId, logins, month: monthHint } = body ?? {};
  const rawPid = parseInt(String(periodId), 10);
  if (isNaN(rawPid)) return Response.json({ error: 'periodId must be number' }, { status: 400 });
  // Ремап на monthly pid (як у /api/planning save/load).
  // Pure-фолбек через YYYYMMDD формат rawPid — без SELECT periods (після
  // міграції M7 weekly-period рядків там нема, SELECT віддавав null → запит
  // ходив у неіснуючий pid → 0 rows → дашборд показував «План: 0»).
  let pid = rawPid;
  if (typeof monthHint === 'string' && /^\d{4}-\d{2}/.test(monthHint)) {
    pid = monthlyPidFromMonth(monthHint);
  } else {
    pid = monthlyPidFromAnyPid(rawPid);
  }
  if (!Array.isArray(logins) || logins.length === 0) {
    return Response.json({ error: 'logins must be non-empty array' }, { status: 400 });
  }
  if (logins.length > 100) {
    return Response.json({ error: 'too many logins (max 100)' }, { status: 400 });
  }

  // SECURITY: фільтруємо logins по правах сесії.
  // Director / Admin → всі дозволені (read).
  // RM → лише свій login + managedUsers.
  // Manager → тільки свій login.
  const sessionLogin = session.login.toLowerCase().trim();
  const allowed = new Set<string>([sessionLogin]);
  if (session.role === 'director' || session.role === 'admin') {
    // Director / Admin — всі logins що передали (бо managedUsers у них не повний дерево).
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
  // ⚠️ M8: фільтр archived_at IS NULL — приховує soft-deleted рядки baгaжу.
  // M9 (Etap 2 Пакету А): paralel-fetch period_summaries для finalize-status.
  // Б.6 (Пакет Б): finalized_at != null → (user, segment) у finalized set.
  const [forecastsRes, gapsRes, summariesRes] = await Promise.all([
    supabase.from('forecasts')
      .select('user_id,segment_code,client_id_1c,forecast_amount')
      .eq('period_id', pid)
      .is('archived_at', null)
      .in('user_id', safeLogins),
    supabase.from('gap_closures')
      .select('user_id,segment_code,client_id_1c,potential_amount,category')
      .eq('period_id', pid)
      .is('archived_at', null)
      .in('user_id', safeLogins),
    supabase.from('period_summaries')
      .select('user_id,segment_code,finalized_at')
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
  // Set ключів `${user_id}|${segment_code}` для яких period_summaries
  // має finalized_at != null. Б.6 (Пакет Б): надає frontend-у роз'єм
  // "draft vs finalized" для UI.
  const finalizedSet = new Set<string>();
  type SRow = { user_id: string; segment_code: string; finalized_at: string | null };
  for (const s of (summariesRes.data ?? []) as SRow[]) {
    if (s.finalized_at) finalizedSet.add(`${s.user_id}|${s.segment_code}`);
  }
  const isFinalized = (userId: string, segmentCode: string) =>
    finalizedSet.has(`${userId}|${segmentCode}`);

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
  // Б.6: finalized-only підсумки (для UI «Заплановано» після закриття window).
  let totalForecastFinalized = 0;
  let totalGapPotentialFinalized = 0;
  const bySegment: Record<string, {
    forecast: number;
    gap: number;
    forecastFinalized: number;
    gapFinalized: number;
    forecastClients: number;
    gapClients: number;
    byCategory: SegCategoryBlock;
  }> = {};
  // byLogin × segment — для розрахунку «Запл. %» per (manager, brand)
  // на дашборді РМ/Director (BrandManagerGroup / RegionAccordion).
  // Без цього brand-row падав на mock-формулу `факт + 60% розриву` (66%),
  // тоді як форма менеджера показувала реальні 92%.
  const byLogin: Record<string, Record<string, { forecast: number; gap: number; finalized: boolean }>> = {};
  const addToLogin = (login: string, segment: string, kind: 'forecast' | 'gap', amt: number) => {
    if (!byLogin[login]) byLogin[login] = {};
    if (!byLogin[login][segment]) {
      byLogin[login][segment] = { forecast: 0, gap: 0, finalized: isFinalized(login, segment) };
    }
    byLogin[login][segment][kind] += amt;
  };

  const seenForecastClients = new Map<string, Set<string>>();
  const seenGapClients = new Map<string, Set<string>>();
  // Три окремі Set-и ключів `${segment_code}|${client_id_1c}` — у яких блоках
  // плану лежить КОНКРЕТНА пара (сегмент × клієнт). Використовуємо у
  // /api/onec/region-stats щоб класифікувати buyer факту по бренду+клієнту:
  //   (seg, client) in forecastClientIds       → active
  //   (seg, client) in gapNewClientIds         → new
  //   (seg, client) in gapActivationClientIds  → activation
  //   (seg, client) ні в чому                  → unplanned
  // Σ всіх 4 = totalFact, без дублювання.
  // ⚠️ 2026-05-12: раніше ключ був тільки clientId — клієнт запланований
  // у бренді A і купує у бренді B неправомірно потрапляв у «Активні»
  // по бренду B (Запоріжжя $1,178 IUSE-факт показувався як активні
  // бо клієнти були у forecast по Vitaran).
  const forecastClientIds = new Set<string>();
  const gapNewClientIds = new Set<string>();
  const gapActivationClientIds = new Set<string>();
  // Combined (для зворотньої сумісності — поки що повертаємо)
  const plannedClientIds = new Set<string>();

  for (const f of forecasts) {
    const amount = Number(f.forecast_amount) || 0;
    // Passive row (amount=0) — «пам'ятаю, не планую цього періоду».
    // НЕ враховуємо у totals, counter-ах і Set-ах планованих клієнтів.
    // Завдяки цьому клієнт з фактом > 0 на amount=0 рядку коректно
    // потрапить у блок «Незаплановані покупці» (unplanned-buyers).
    if (isPassiveAmount(amount)) continue;
    totalForecast += amount;
    const fin = isFinalized(f.user_id, f.segment_code);
    if (fin) totalForecastFinalized += amount;
    if (!bySegment[f.segment_code]) bySegment[f.segment_code] = { forecast: 0, gap: 0, forecastFinalized: 0, gapFinalized: 0, forecastClients: 0, gapClients: 0, byCategory: emptySegBlock() };
    bySegment[f.segment_code].forecast += amount;
    if (fin) bySegment[f.segment_code].forecastFinalized += amount;
    bySegment[f.segment_code].byCategory.active.plannedSum += amount;
    bySegment[f.segment_code].byCategory.active.plannedCount += 1;
    if (!seenForecastClients.has(f.segment_code)) seenForecastClients.set(f.segment_code, new Set());
    seenForecastClients.get(f.segment_code)!.add(`${f.user_id}|${f.client_id_1c}`);
    if (f.client_id_1c) {
      // Композитний ключ — щоб клієнт у Vitaran не «крав» fact-у IUSE.
      forecastClientIds.add(`${f.segment_code}|${f.client_id_1c}`);
      plannedClientIds.add(f.client_id_1c);
    }
    addToLogin(f.user_id, f.segment_code, 'forecast', amount);
  }
  for (const g of gaps) {
    const amount = Number(g.potential_amount) || 0;
    // Passive row — див. коментар у forecasts вище.
    if (isPassiveAmount(amount)) continue;
    totalGapPotential += amount;
    const fin = isFinalized(g.user_id, g.segment_code);
    if (fin) totalGapPotentialFinalized += amount;
    if (!bySegment[g.segment_code]) bySegment[g.segment_code] = { forecast: 0, gap: 0, forecastFinalized: 0, gapFinalized: 0, forecastClients: 0, gapClients: 0, byCategory: emptySegBlock() };
    bySegment[g.segment_code].gap += amount;
    if (fin) bySegment[g.segment_code].gapFinalized += amount;
    const cat = mapGapCategory(g.category);
    bySegment[g.segment_code].byCategory[cat].plannedSum += amount;
    bySegment[g.segment_code].byCategory[cat].plannedCount += 1;
    if (!seenGapClients.has(g.segment_code)) seenGapClients.set(g.segment_code, new Set());
    seenGapClients.get(g.segment_code)!.add(`${g.user_id}|${g.client_id_1c}`);
    if (g.client_id_1c) {
      const planKey = `${g.segment_code}|${g.client_id_1c}`;
      if (cat === 'new') gapNewClientIds.add(planKey);
      else gapActivationClientIds.add(planKey);
      plannedClientIds.add(g.client_id_1c);
    }
    addToLogin(g.user_id, g.segment_code, 'gap', amount);
  }
  // Заповнюємо distinct counts
  for (const [seg, set] of seenForecastClients) bySegment[seg].forecastClients = set.size;
  for (const [seg, set] of seenGapClients) bySegment[seg].gapClients = set.size;

  // Б.6: чи відкритий window планування для цього місяця (для UI логіки
  // «показувати чернетку + фінал» vs «тільки фінал»). Перевіряємо БЕЗ
  // конкретного login — global rules (window_days, global locks). Якщо
  // global-block активний — теж вважаємо closed.
  let planningOpen = false;
  if (typeof monthHint === 'string' && /^\d{4}-\d{2}/.test(monthHint)) {
    try {
      const { settings, locks } = await loadSettingsAndLocks(monthHint);
      // Перевіряємо для fictional "не-існуючого" логіна щоб виключити
      // user-allow/user-block. Бачимо тільки global rules + window_days.
      const r = canPlanForMonth('__anon__', monthHint, new Date(), settings, locks);
      planningOpen = r.allowed;
    } catch { planningOpen = false; }
  }

  return Response.json({
    totalForecast,
    totalGapPotential,
    totalForecastFinalized,
    totalGapPotentialFinalized,
    planningOpen,
    bySegment,
    byLogin,
    plannedClientIds: Array.from(plannedClientIds),
    forecastClientIds: Array.from(forecastClientIds),
    gapNewClientIds: Array.from(gapNewClientIds),
    gapActivationClientIds: Array.from(gapActivationClientIds),
    meta: {
      periodId: pid,
      logins: safeLogins.length,
      forecastRows: forecasts.length,
      gapRows: gaps.length,
      finalizedPairs: finalizedSet.size,
    },
  });
}
