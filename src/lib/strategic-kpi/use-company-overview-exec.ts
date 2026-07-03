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

/**
 * @param period 'YYYY-MM' (Огляд приймає лише місяць; для квартал/рік вертаємо null)
 * @param enabled чи можна фетчити (юзер авторизований на дашборд)
 */
export function useCompanyOverviewExec(period: string, enabled: boolean): ExecMap | null {
  const [exec, setExec] = useState<ExecMap | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExec(null);
    if (!enabled || !/^\d{4}-\d{2}$/.test(period)) return;
    fetch(`/api/admin/company-overview?period=${period}&light=1`, { credentials: 'same-origin', signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((co: CompanyOverviewResponse | null) => {
        if (ctrl.signal.aborted) return;
        if (co && Array.isArray(co.divisions)) setExec(buildExec(co));
      })
      .catch(() => { /* мовчки — фронт відкотиться на клієнтський % */ });
    return () => ctrl.abort();
  }, [period, enabled]);
  return exec;
}
