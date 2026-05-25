/**
 * GET /api/admin/company-overview
 *
 * Збирає дані для admin-дашборду «Огляд компанії»:
 *  - Plans з 1С Action 4 (getRegistryPlans) — всі 13 підрозділів
 *  - Fact з 1С Action 5 (getRegionData) — поки 9-11 підрозділів (доки 1С не
 *    почне передавати менеджерів інших підрозділів)
 *
 * Агрегує у плоску структуру по групах підрозділів:
 *  - representations (8 регіонів)
 *  - call-center, laserhouse, adassa
 *  - distributor-chuguy (= Полтава*), distributor-haylenko (= Чернівці*)
 *
 * Тільки admin. Інші 403.
 */

import { NextRequest } from 'next/server';
import { validateApiRequest } from '@/lib/api-auth';
import { getSession } from '@/lib/session';
import { DIRECTOR_PROXY_LOGIN } from '@/lib/feature-flags';
import { mapSegmentCode } from '@/lib/onec-adapters';
import { isTrialBrandPlan } from '@/lib/trial-manager';

// Без кешування — admin-дашборд має тягнути свіже з 1С (інакше «Оновити»
// віддає Vercel-кеш і дані «затухають» — фак не міняється весь день).
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// === Мапінг 1С divisionName → наша group категорія ===
// Назви беремо ТОЧНО як 1С повертає у Action 4 (перевірено diag-divisions.mjs).
const REPRESENTATIONS = new Set([
  'Київ', 'Дніпро', 'Одеса', 'Харків', 'Запоріжжя', 'Вінниця', 'Миколаєв', 'Житомир',
]);
type DivisionGroup =
  | 'representations'
  | 'call-center'
  | 'laserhouse'
  | 'adassa'
  | 'distributor-chuguy'
  | 'distributor-haylenko';

function classifyDivision(name: string): DivisionGroup | null {
  if (REPRESENTATIONS.has(name)) return 'representations';
  if (name === 'Лазерхауз*') return 'laserhouse';
  if (name === 'Адасса') return 'adassa';
  if (name === 'Полтава*') return 'distributor-chuguy';
  if (name === 'Черновцы*') return 'distributor-haylenko';
  // Коллцентр приходить як «Коллцентр Call center лидогенерация» — startsWith
  if (name.startsWith('Коллцентр')) return 'call-center';
  return null;
}

// === Типи відповіді нашого endpoint ===
interface SegmentTotals { plan: number; fact: number; prevFact: number; }
interface ManagerSummary { login: string; name: string; totalPlan: number; totalFact: number; }
/** Агрегат клієнтів по 5 категоріях. {total, bought} на категорію. */
interface ClientCategoryStats {
  active:   { total: number; bought: number };
  sleeping: { total: number; bought: number };
  lost:     { total: number; bought: number };
  new:      { total: number; bought: number };
  none:     { total: number; bought: number };
  totalClients: number;
  totalBought: number;
}
interface DivisionDetails {
  divisionName: string;        // як приходить з 1С
  groupKey: DivisionGroup;
  displayName: string;         // для UI («Полтава», «Колл-центр»...)
  segments: Record<string, SegmentTotals>;  // segmentCode → totals
  totalPlan: number;
  totalFact: number;
  totalPrevFact: number;
  hasFact: boolean;            // true якщо Action 5 повернув цей підрозділ
  managerCount: number;
  /** Per-manager breakdown — використовується для donut «Менеджери Представництв».
   *  Заповнюється тільки для groupKey='representations' (для решти груп — пусто). */
  managers?: ManagerSummary[];
  /** v2.5 Action 5 clientStats — агрегат купивших клієнтів по 5 категоріях.
   *  Сума по всіх менеджерах підрозділу. Поточний місяць. */
  clientStats?: ClientCategoryStats;
  /** Те саме що clientStats, але за попередній місяць — для порівняння */
  prevClientStats?: ClientCategoryStats;
}
interface CompanyOverviewResponse {
  asOfDate: string | null;
  prevMonthAsOfDate: string | null;
  divisions: DivisionDetails[];
  // Aggregates ready for UI:
  totalPlan: number;
  totalFact: number;
  totalPrevFact: number;
  divisionsWithoutFact: string[];  // displayNames
}

// Helper: zero clientStats baseline
function emptyClientStats(): ClientCategoryStats {
  return {
    active: { total: 0, bought: 0 },
    sleeping: { total: 0, bought: 0 },
    lost: { total: 0, bought: 0 },
    new: { total: 0, bought: 0 },
    none: { total: 0, bought: 0 },
    totalClients: 0,
    totalBought: 0,
  };
}
function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v) || 0;
  return 0;
}
function accumulateClientStats(target: ClientCategoryStats, src: Record<string, unknown>): void {
  for (const cat of ['active', 'sleeping', 'lost', 'new', 'none'] as const) {
    const s = src[cat] as { total: unknown; bought: unknown } | undefined;
    if (!s) continue;
    target[cat].total  += toNum(s.total);
    target[cat].bought += toNum(s.bought);
  }
  target.totalClients += toNum(src.totalClients);
  target.totalBought  += toNum(src.totalBought);
}

// === Helper: виклик до 1С ===
async function callOnec(action: string, payload: Record<string, unknown>) {
  const url = process.env.ONEC_BASE_URL;
  const login = process.env.ONEC_LOGIN;
  const password = process.env.ONEC_PASSWORD;
  if (!url) throw new Error('ONEC_BASE_URL not configured');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (login && password) {
    headers.Authorization = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
  }
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ action, payload }) });
  if (!r.ok) throw new Error(`1С ${action}: HTTP ${r.status}`);
  return r.json();
}

// === Display name мапінг (для UI) ===
const DISPLAY_NAMES: Record<DivisionGroup, string> = {
  representations: 'Представництва',
  'call-center': 'Колл-центр',
  laserhouse: 'Лазерхауз',
  adassa: 'Адасса',
  // У UI показуємо без прізвищ дистрибуторів — просто назви регіонів.
  // Імена (Чугуй / Хайленко) лишаються тільки у внутрішніх groupKey.
  'distributor-chuguy': 'Полтава',
  'distributor-haylenko': 'Чернівці',
};

export async function GET(request: NextRequest) {
  const auth = validateApiRequest(request);
  if (!auth.valid) return Response.json({ error: auth.error }, { status: 401 });
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return Response.json({ error: 'Admin only' }, { status: 403 });
  }

  // Period: ?period=YYYY-MM (default — поточний місяць)
  const { searchParams } = request.nextUrl;
  const periodParam = searchParams.get('period');
  let period: string;
  if (periodParam && /^\d{4}-\d{2}$/.test(periodParam)) {
    period = periodParam;
  } else {
    const now = new Date();
    period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  // Period bounds для Action 4
  const [yStr, mStr] = period.split('-');
  const y = parseInt(yStr, 10); const m = parseInt(mStr, 10);
  const dateFrom = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const dateTo = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Попередній місяць (для порівняння clientStats)
  const prevDate = new Date(y, m - 2, 1);  // m-2 бо m тут 1-based
  const prevPeriod = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  try {
    // === Fetch паралельно — план + факт поточного + факт попереднього (для клієнт-stats vs мин.міс) ===
    // includeAll: true — каже 1С повернути ВСІ підрозділи (Колл-центр, Адасса,
    // Чугуй, Хайленко) ігноруючи фільтр по менеджерах. Доступне ТІЛЬКИ admin —
    // у цьому endpoint вже є гард role==='admin' вище.
    const [a4, a5, a5prev] = await Promise.all([
      callOnec('getRegistryPlans', { dateFrom, dateTo }),
      callOnec('getRegionData', { login: DIRECTOR_PROXY_LOGIN, period, includeAll: true }),
      // Попередній місяць — лише для порівняння clientStats. Якщо впаде —
      // продовжуємо без prev (картка просто не покаже delta).
      callOnec('getRegionData', { login: DIRECTOR_PROXY_LOGIN, period: prevPeriod, includeAll: true })
        .catch(() => ({ status: 'error' as const, message: 'prev month fetch failed' })),
    ]);

    if (a4.status !== 'success') throw new Error(`Action 4: ${a4.message || 'unknown error'}`);
    if (a5.status !== 'success') throw new Error(`Action 5: ${a5.message || 'unknown error'}`);
    // a5prev може бути error — продовжимо без prev clientStats

    // === Aggregate plans (Action 4) по divisionName + segmentCode ===
    // Кожен план — це divisionName + managerLogin + segmentCode + planAmountUSD.
    // Сумуємо по managerLogin у межах (division, segment).
    // ⚠️ Ігноруємо $1 sentinel (trial-новачок без реального плану) — інакше
    // факт $950 / план $1 = 95000% і Адасса показує план $8,487 замість $1,686
    // (8 sentinel-планів + 1 реальний Vitaran).
    const planAgg = new Map<string, Map<string, number>>(); // div → seg → planSum
    for (const p of a4.data?.plans ?? []) {
      const divName = String(p.divisionName || '').trim();
      const segCode = mapSegmentCode(String(p.segmentCode || ''));
      const amt = Number(p.planAmountUSD || 0);
      if (!divName || !segCode) continue;
      if (isTrialBrandPlan(amt)) continue;  // sentinel — НЕ додаємо
      if (!planAgg.has(divName)) planAgg.set(divName, new Map());
      const seg = planAgg.get(divName)!;
      seg.set(segCode, (seg.get(segCode) || 0) + amt);
    }

    // === Aggregate fact (Action 5) по regionName + segmentCode + manager ===
    // + Aggregate clientStats per division (v2.5 Action 5 — купивши клієнти по 5 категоріях)
    const factAgg = new Map<string, {
      segments: Map<string, { fact: number; prevFact: number }>;
      managerCount: number;
      // Per-manager breakdown — для donut «Менеджери Представництв»
      managers: Map<string, ManagerSummary>;
      // Сумарні клієнт-категорії по підрозділу (сума всіх менеджерів)
      clientStats: ClientCategoryStats;
    }>();
    for (const reg of a5.data?.regions ?? []) {
      const regName = String(reg.regionName || '').trim();
      if (!regName) continue;
      if (!factAgg.has(regName)) {
        factAgg.set(regName, { segments: new Map(), managerCount: 0, managers: new Map(), clientStats: emptyClientStats() });
      }
      const slot = factAgg.get(regName)!;
      slot.managerCount += Array.isArray(reg.managers) ? reg.managers.length : 0;
      for (const mgr of reg.managers ?? []) {
        const mgrLogin = String(mgr.managerLogin || '').toLowerCase().trim();
        const mgrName = String(mgr.managerName || mgrLogin || '');
        const mgrTotalPlan = Number(mgr.totalPlan || 0);
        const mgrTotalFact = Number(mgr.totalFact || 0);
        // Тримаємо суму факту/плану per manager (накопичуємо якщо менеджер
        // з'являється у кількох регіонах — наприклад мульти-region РМ).
        if (mgrLogin) {
          const existing = slot.managers.get(mgrLogin);
          if (existing) {
            existing.totalPlan += mgrTotalPlan;
            existing.totalFact += mgrTotalFact;
          } else {
            slot.managers.set(mgrLogin, {
              login: mgrLogin,
              name: mgrName,
              totalPlan: mgrTotalPlan,
              totalFact: mgrTotalFact,
            });
          }
        }
        // ClientStats v2.5 — кількість купивших клієнтів по 5 категоріях
        if (mgr.clientStats) {
          accumulateClientStats(slot.clientStats, mgr.clientStats as Record<string, unknown>);
        }
        for (const seg of mgr.segments ?? []) {
          const segCode = mapSegmentCode(String(seg.segmentCode || ''));
          const fact = Number(seg.factAmountUSD || 0);
          const prevFact = Number(seg.prevMonthFactUSD || 0);
          if (!slot.segments.has(segCode)) slot.segments.set(segCode, { fact: 0, prevFact: 0 });
          const s = slot.segments.get(segCode)!;
          s.fact += fact;
          s.prevFact += prevFact;
        }
      }
    }

    // === Prev month clientStats — окремо агрегуємо з a5prev ===
    // Тільки clientStats (segments/managers вже маємо у поточному).
    const prevClientStatsAgg = new Map<string, ClientCategoryStats>();
    if (a5prev.status === 'success') {
      for (const reg of a5prev.data?.regions ?? []) {
        const regName = String(reg.regionName || '').trim();
        if (!regName) continue;
        if (!prevClientStatsAgg.has(regName)) prevClientStatsAgg.set(regName, emptyClientStats());
        const slot = prevClientStatsAgg.get(regName)!;
        for (const mgr of reg.managers ?? []) {
          if (mgr.clientStats) {
            accumulateClientStats(slot, mgr.clientStats as Record<string, unknown>);
          }
        }
      }
    }

    // === Build divisions list — merge plans + facts ===
    // Усі divisions з плану (це наш canonical список 13 підрозділів).
    const divisions: DivisionDetails[] = [];
    for (const [divName, planSegments] of planAgg.entries()) {
      const groupKey = classifyDivision(divName);
      if (!groupKey) continue;  // ігноруємо нерозпізнані типу «Маркетинг», «ейчарА HRA»
      const factSlot = factAgg.get(divName);
      const segments: Record<string, SegmentTotals> = {};
      // Збираємо всі сегменти що є у плані АБО у факті
      const allSegCodes = new Set<string>([
        ...planSegments.keys(),
        ...(factSlot?.segments.keys() ?? []),
      ]);
      let totalPlan = 0, totalFact = 0, totalPrevFact = 0;
      for (const segCode of allSegCodes) {
        const plan = planSegments.get(segCode) ?? 0;
        const factVals = factSlot?.segments.get(segCode);
        const fact = factVals?.fact ?? 0;
        const prevFact = factVals?.prevFact ?? 0;
        segments[segCode] = { plan, fact, prevFact };
        totalPlan += plan;
        totalFact += fact;
        totalPrevFact += prevFact;
      }
      divisions.push({
        divisionName: divName,
        groupKey,
        displayName: groupKey === 'representations' ? divName : DISPLAY_NAMES[groupKey],
        segments,
        totalPlan,
        totalFact,
        totalPrevFact,
        hasFact: !!factSlot && totalFact > 0,
        managerCount: factSlot?.managerCount ?? 0,
        // Заповнюємо managers тільки для Представництв — для frontend donut
        // «Менеджери Представництв». Решта груп — порожній масив щоб тип сходився.
        managers: groupKey === 'representations' && factSlot
          ? Array.from(factSlot.managers.values())
          : [],
        clientStats: factSlot?.clientStats,
        prevClientStats: prevClientStatsAgg.get(divName),
      });
    }

    // === Грубі агрегати по компанії ===
    const totalPlan = divisions.reduce((s, d) => s + d.totalPlan, 0);
    const totalFact = divisions.reduce((s, d) => s + d.totalFact, 0);
    const totalPrevFact = divisions.reduce((s, d) => s + d.totalPrevFact, 0);
    const divisionsWithoutFact = divisions
      .filter(d => !d.hasFact)
      .map(d => d.displayName);

    const resp: CompanyOverviewResponse = {
      asOfDate: a5.data?.asOfDate ?? null,
      prevMonthAsOfDate: a5.data?.prevMonthAsOfDate ?? null,
      divisions,
      totalPlan,
      totalFact,
      totalPrevFact,
      divisionsWithoutFact,
    };

    return Response.json(resp);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[company-overview] error:', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
