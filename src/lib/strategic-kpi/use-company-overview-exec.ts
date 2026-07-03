'use client';

/**
 * Хук: тягне ГОТОВИЙ грошовий розрахунок з «Огляд компанії»
 * (/api/admin/company-overview) і згортає у мапу brand×channel → {план, факт}.
 *
 * Мета — щоб % виконання на /admin/strategic-kpi був 1-в-1 як в Огляді і в
 * Плануванні (той самий 1С Action 4 план + Action 5 факт), а не рахувався
 * окремо. Раніше strategic-kpi робив власні 1С-виклики — вони таймаутили і %
 * відкочувався на клієнтський. Тепер джерело істини одне.
 *
 * Створено 2026-07-03.
 */

import { useEffect, useState } from 'react';
import type { CompanyOverviewResponse, DivisionGroup } from '@/lib/company-overview-types';

export interface ExecCell { plan: number; fact: number }
/** brandKey → channel → {план, факт}. brandKey = 'Vitaran' | ... | 'IUSE'. */
export type ExecMap = Record<string, Record<string, ExecCell>>;

// Групи підрозділів Огляду → наші канали strategic-kpi.
const GROUP_TO_CHANNEL: Partial<Record<DivisionGroup, string>> = {
  representations: 'representatives',
  'call-center': 'call_center',
  'distributor-chuguy': 'distributors',
  'distributor-haylenko': 'distributors',
  // laserhouse / adassa — не частина strategic-kpi, пропускаємо
};

// segmentCode (1С, uppercase) → ключ бренду/сегмента на дашборді.
const SEGCODE_TO_KEY: Record<string, string> = {
  VITARAN: 'Vitaran',
  NEURONOX: 'Neuronox',
  ELLANSE: 'Ellanse',
  PETARAN: 'Petaran',
  NEURAMIS: 'Neuramis',
  EXOXE: 'EXOXE',
  ESSE: 'ESSE',
  IUSE: 'IUSE',
  BAD: 'БАД',
};

function buildExec(co: CompanyOverviewResponse): ExecMap {
  const out: ExecMap = {};
  for (const div of co.divisions) {
    const channel = GROUP_TO_CHANNEL[div.groupKey];
    if (!channel) continue;
    for (const [segCode, tot] of Object.entries(div.segments)) {
      const key = SEGCODE_TO_KEY[segCode.toUpperCase().trim()];
      if (!key) continue;
      const brand = (out[key] = out[key] ?? {});
      const cell = (brand[channel] = brand[channel] ?? { plan: 0, fact: 0 });
      cell.plan += tot.plan;
      cell.fact += tot.fact;
    }
  }
  return out;
}

/** Розбивка % по каналах бренду (план+факт з Огляду) — для hero-підпису.
 *  allow — предикат: рахуємо тільки канали зі стратег-тригерами (isChannelActive). */
export function channelBreakdown(
  exec: ExecMap | null,
  key: string,
  allow: (ch: string) => boolean,
): Array<{ channel: string; pct: number }> {
  const cells = exec?.[key];
  if (!cells) return [];
  const out: Array<{ channel: string; pct: number }> = [];
  for (const [ch, c] of Object.entries(cells)) {
    if (allow(ch) && c.plan > 0) out.push({ channel: ch, pct: (c.fact / c.plan) * 100 });
  }
  return out;
}

function curYM(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Розкладаємо період у список місяців 'YYYY-MM'. Огляд приймає лише місяць, тож
// для квартал/півріччя/рік беремо кожен місяць і сумуємо. Обрізаємо по поточний
// місяць — майбутні місяці не тягнемо (там немає факту, лише зайві виклики 1С).
function periodToMonths(period: string): string[] {
  const out: string[] = [];
  const mm = period.match(/^(\d{4})-(\d{2})$/);
  if (mm) {
    out.push(period);
  } else {
    const q = period.match(/^(\d{4})-Q([1-4])$/i);
    const h = period.match(/^(\d{4})-H([12])$/i);
    const y = period.match(/^(\d{4})$/);
    let year = 0, startM = 1, endM = 0;
    if (q) { year = +q[1]; startM = (+q[2] - 1) * 3 + 1; endM = startM + 2; }
    else if (h) { year = +h[1]; startM = (+h[2] - 1) * 6 + 1; endM = startM + 5; }
    else if (y) { year = +y[1]; startM = 1; endM = 12; }
    else return [];
    for (let m = startM; m <= endM; m++) out.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  const cur = curYM();
  return out.filter(ym => ym <= cur);
}

// Кеш ExecMap по місяцях на сесію: закриті місяці незмінні → кешуємо надовго;
// поточний місяць — короткий TTL (свіжий факт). Так рік тягне 1С один раз.
const MONTH_CACHE = new Map<string, { at: number; exec: ExecMap }>();
const CUR_TTL = 2 * 60 * 1000;

async function fetchMonthExec(ym: string, signal: AbortSignal): Promise<ExecMap | null> {
  const cached = MONTH_CACHE.get(ym);
  if (cached && (ym < curYM() || Date.now() - cached.at < CUR_TTL)) return cached.exec;
  const r = await fetch(`/api/admin/company-overview?period=${ym}&light=1`, { credentials: 'same-origin', signal });
  if (!r.ok) return null;
  const co = (await r.json()) as CompanyOverviewResponse | null;
  if (!co || !Array.isArray(co.divisions)) return null;
  const exec = buildExec(co);
  MONTH_CACHE.set(ym, { at: Date.now(), exec });
  return exec;
}

// Σ план/факт по місяцях per brand×channel.
function sumExecMaps(maps: ExecMap[]): ExecMap {
  const out: ExecMap = {};
  for (const m of maps) {
    for (const [brand, chans] of Object.entries(m)) {
      const b = (out[brand] = out[brand] ?? {});
      for (const [ch, cell] of Object.entries(chans)) {
        const c = (b[ch] = b[ch] ?? { plan: 0, fact: 0 });
        c.plan += cell.plan;
        c.fact += cell.fact;
      }
    }
  }
  return out;
}

/**
 * @param period 'YYYY-MM' | 'YYYY-QN' | 'YYYY-HN' | 'YYYY' — для багатомісячних
 *   сумуємо Огляд по місяцях (вар. A). Майбутні місяці пропускаємо.
 * @param enabled чи можна фетчити (юзер авторизований на дашборд)
 */
export function useCompanyOverviewExec(period: string, enabled: boolean): ExecMap | null {
  const [exec, setExec] = useState<ExecMap | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExec(null);
    if (!enabled) return;
    const months = periodToMonths(period);
    if (months.length === 0) return;
    (async () => {
      const maps: ExecMap[] = [];
      const CONC = 3; // по 3 місяці паралельно — не завалюємо 1С
      for (let i = 0; i < months.length; i += CONC) {
        const batch = months.slice(i, i + CONC);
        const res = await Promise.all(batch.map(m => fetchMonthExec(m, ctrl.signal).catch(() => null)));
        if (ctrl.signal.aborted) return;
        for (const r of res) if (r) maps.push(r);
      }
      if (ctrl.signal.aborted || maps.length === 0) return;
      setExec(sumExecMaps(maps));
    })().catch(() => { /* мовчки — фронт відкотиться на клієнтський % */ });
    return () => ctrl.abort();
  }, [period, enabled]);
  return exec;
}
