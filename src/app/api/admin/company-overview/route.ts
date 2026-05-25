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
interface DivisionDetails {
  divisionName: string;        // як приходить з 1С
  groupKey: DivisionGroup;
  displayName: string;         // для UI («Чугуй (Полтава)», «Колл-центр»...)
  segments: Record<string, SegmentTotals>;  // segmentCode → totals
  totalPlan: number;
  totalFact: number;
  totalPrevFact: number;
  hasFact: boolean;            // true якщо Action 5 повернув цей підрозділ
  managerCount: number;
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

  try {
    // === Fetch обидва Action паралельно ===
    const [a4, a5] = await Promise.all([
      callOnec('getRegistryPlans', { dateFrom, dateTo }),
      callOnec('getRegionData', { login: DIRECTOR_PROXY_LOGIN, period }),
    ]);

    if (a4.status !== 'success') throw new Error(`Action 4: ${a4.message || 'unknown error'}`);
    if (a5.status !== 'success') throw new Error(`Action 5: ${a5.message || 'unknown error'}`);

    // === Aggregate plans (Action 4) по divisionName + segmentCode ===
    // Кожен план — це divisionName + managerLogin + segmentCode + planAmountUSD.
    // Сумуємо по managerLogin у межах (division, segment).
    const planAgg = new Map<string, Map<string, number>>(); // div → seg → planSum
    for (const p of a4.data?.plans ?? []) {
      const divName = String(p.divisionName || '').trim();
      const segCode = mapSegmentCode(String(p.segmentCode || ''));
      const amt = Number(p.planAmountUSD || 0);
      if (!divName || !segCode) continue;
      if (!planAgg.has(divName)) planAgg.set(divName, new Map());
      const seg = planAgg.get(divName)!;
      seg.set(segCode, (seg.get(segCode) || 0) + amt);
    }

    // === Aggregate fact (Action 5) по regionName + segmentCode ===
    const factAgg = new Map<string, { segments: Map<string, { fact: number; prevFact: number }>; managerCount: number }>();
    for (const reg of a5.data?.regions ?? []) {
      const regName = String(reg.regionName || '').trim();
      if (!regName) continue;
      if (!factAgg.has(regName)) factAgg.set(regName, { segments: new Map(), managerCount: 0 });
      const slot = factAgg.get(regName)!;
      slot.managerCount += Array.isArray(reg.managers) ? reg.managers.length : 0;
      for (const mgr of reg.managers ?? []) {
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
