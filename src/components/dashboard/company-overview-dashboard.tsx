'use client';

/**
 * <CompanyOverviewDashboard> — «Огляд компанії».
 *
 * Read-only візуалізація план/факт по всій компанії включно з не-планувальними
 * підрозділами (Колл-центр, Лазерхауз, Адасса, Чугуй=Полтава, Хайленко=Чернівці).
 *
 * Доступ контролюється у parent (page.tsx або toggle на головній сторінці).
 * Цей компонент НЕ має guard — рендерить контент. AppHeader теж не рендерить.
 *
 * Render внутрішнього `<main>` теж нема — це обгортка parent-а.
 */

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useAppStore } from '@/lib/store';
import { DonutChart } from '@/components/dashboard/donut-chart';
import { SEGMENTS } from '@/lib/mock-data';
import { getMonthProgressPct, getWorkingDaysInMonth, getPassedWorkingDays } from '@/lib/working-days';
import { Building2, RefreshCw, Zap } from 'lucide-react';

const HEADERS_JSON = {
  'Content-Type': 'application/json',
  'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '',
};

interface SegmentTotals { plan: number; fact: number; prevFact: number; }
interface ManagerSummary { login: string; name: string; totalPlan: number; totalFact: number; }
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
  divisionName: string;
  groupKey: 'representations' | 'call-center' | 'laserhouse' | 'adassa' | 'distributor-chuguy' | 'distributor-haylenko';
  displayName: string;
  segments: Record<string, SegmentTotals>;
  totalPlan: number;
  totalFact: number;
  totalPrevFact: number;
  hasFact: boolean;
  managerCount: number;
  managers?: ManagerSummary[];
  clientStats?: ClientCategoryStats;
  prevClientStats?: ClientCategoryStats;
}
interface CompanyOverviewData {
  asOfDate: string | null;
  prevMonthAsOfDate: string | null;
  divisions: DivisionDetails[];
  totalPlan: number;
  totalFact: number;
  totalPrevFact: number;
  divisionsWithoutFact: string[];
  divisionsNotInPlan?: string[];
}

const BRAND_CODES = SEGMENTS.map(s => s.code);
const BRAND_NAMES: Record<string, string> = Object.fromEntries(SEGMENTS.map(s => [s.code, s.name]));

const GROUP_ORDER: DivisionDetails['groupKey'][] = [
  'representations', 'call-center', 'laserhouse', 'adassa', 'distributor-chuguy', 'distributor-haylenko',
];
const GROUP_LABEL: Record<DivisionDetails['groupKey'], string> = {
  representations: 'Представництва',
  'call-center': 'Колл-центр',
  laserhouse: 'Лазерхауз',
  adassa: 'Адасса',
  'distributor-chuguy': 'Полтава',
  'distributor-haylenko': 'Чернівці',
};

const fmtUSD = (v: number) => '$' + Math.round(v).toLocaleString('en-US');
const fmtUSDCompact = (v: number) => {
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'K';
  return '$' + Math.round(v);
};
const fmtPct = (v: number) => v.toFixed(1) + '%';

function heatColor(pct: number | null): string {
  if (pct === null) return 'bg-slate-100/60 text-slate-500';
  if (pct >= 100) return 'bg-teal-400/55 text-teal-900';
  if (pct >= 80) return 'bg-teal-300/35 text-teal-800';
  if (pct >= 60) return 'bg-lime-300/30 text-lime-800';
  if (pct >= 40) return 'bg-orange-300/30 text-orange-800';
  return 'bg-rose-300/35 text-rose-800';
}

export function CompanyOverviewDashboard() {
  const { user, currentPeriod, liveMode } = useAppStore();

  const now = new Date();
  // Period беремо з глобального стору (той самий що у шапці). Live-режим = поточний місяць.
  // Без локального state — щоб уникнути двох паралельних фільтрів.
  const period = liveMode
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    : currentPeriod.month.slice(0, 7);
  // asOfDate — дата зрізу. У live-режимі — сьогодні. Інакше — weekEnd
  // з обраного періоду (наприклад 17.05 коли вибрано «01.05 — 17.05»).
  // Передається у 1С — щоб реально отримати дані станом на ту дату, а
  // не «сьогодні», як було досі.
  const asOfDate = liveMode
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    : (currentPeriod.weekEnd || '');

  const [accordionMode, setAccordionMode] = useState<'by-div' | 'by-brand'>('by-div');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // Друга глибина: для Представництв розкриваємо регіон у бренди. Key = регіонaName.
  const [expandedSubKey, setExpandedSubKey] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<'all' | 'representations' | 'call-center' | 'laserhouse' | 'adassa' | 'distributors'>('all');

  const { data, error, isLoading, mutate } = useSWR<CompanyOverviewData>(
    user ? `company-overview-${period}-${asOfDate}-${user.login}` : null,
    async () => {
      // cache: 'no-store' — бо інакше браузер/Vercel CDN може віддавати
      // стару відповідь і кнопка «Оновити» не приводить до повторного
      // звернення до 1С (дані «затухають»).
      const qs = new URLSearchParams({ period });
      if (asOfDate) qs.set('asOfDate', asOfDate);
      const r = await fetch(`/api/admin/company-overview?${qs.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: HEADERS_JSON,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      return r.json();
    },
    { revalidateOnFocus: false, dedupingInterval: 0 },
  );

  const filteredDivisions = useMemo(() => {
    if (!data) return [];
    if (groupFilter === 'all') return data.divisions;
    if (groupFilter === 'distributors') {
      return data.divisions.filter(d => d.groupKey === 'distributor-chuguy' || d.groupKey === 'distributor-haylenko');
    }
    return data.divisions.filter(d => d.groupKey === groupFilter);
  }, [data, groupFilter]);

  const heatmapRows: Array<{
    key: string; label: string; subLabel: string;
    segments: Record<string, { plan: number; fact: number; hasFact: boolean }>;
  }> = [];
  if (data) {
    for (const groupKey of GROUP_ORDER) {
      const divsInGroup = filteredDivisions.filter(d => d.groupKey === groupKey);
      if (divsInGroup.length === 0) continue;
      const aggregated: Record<string, { plan: number; fact: number; hasFact: boolean }> = {};
      for (const code of BRAND_CODES) {
        let plan = 0, fact = 0, anyHasFact = false;
        for (const d of divsInGroup) {
          const seg = d.segments[code];
          if (seg) {
            plan += seg.plan;
            fact += seg.fact;
            if (d.hasFact && seg.fact > 0) anyHasFact = true;
          }
        }
        aggregated[code] = { plan, fact, hasFact: anyHasFact };
      }
      heatmapRows.push({
        key: groupKey,
        label: GROUP_LABEL[groupKey],
        // Лазерхауз/Адасса/Полтава/Чернівці — у Action 5 синтетичні менеджери,
        // показ "1 менедж." вводить в оману. Не виводимо subLabel для не-представництв.
        subLabel: groupKey === 'representations' ? `${divsInGroup.length} регіонів` : '',
        segments: aggregated,
      });
    }
  }

  const groupsForAccordion: Array<{
    key: string; label: string; isRepresentations: boolean;
    children: DivisionDetails[];
    totalPlan: number; totalFact: number; hasFact: boolean;
  }> = [];
  if (data) {
    for (const groupKey of GROUP_ORDER) {
      const divs = filteredDivisions.filter(d => d.groupKey === groupKey);
      if (divs.length === 0) continue;
      groupsForAccordion.push({
        key: groupKey,
        label: GROUP_LABEL[groupKey],
        isRepresentations: groupKey === 'representations',
        children: divs,
        totalPlan: divs.reduce((s, d) => s + d.totalPlan, 0),
        totalFact: divs.reduce((s, d) => s + d.totalFact, 0),
        hasFact: divs.some(d => d.hasFact),
      });
    }
  }

  // brandsForAccordion: для кожного бренду — список ПІДРОЗДІЛІВ (не груп) де його продають.
  // Раніше Vitaran у Представництвах показувався одним рядком «Представництва $332K»,
  // а має бути 8 рядків (Київ, Одеса, Дніпро...). Тут byDivision — плоский список.
  const brandsForAccordion: Array<{
    code: string; name: string;
    totalPlan: number; totalFact: number;
    byDivision: Array<{ divisionName: string; displayName: string; groupKey: string; plan: number; fact: number; hasFact: boolean; }>;
  }> = [];
  if (data) {
    for (const code of BRAND_CODES) {
      let totalPlan = 0, totalFact = 0;
      const byDivision: Array<{ divisionName: string; displayName: string; groupKey: string; plan: number; fact: number; hasFact: boolean }> = [];
      for (const d of filteredDivisions) {
        const seg = d.segments[code];
        if (!seg) continue;
        if (seg.plan === 0 && seg.fact === 0) continue;
        byDivision.push({
          divisionName: d.divisionName,
          displayName: d.groupKey === 'representations' ? d.divisionName : d.displayName,
          groupKey: d.groupKey,
          plan: seg.plan,
          fact: seg.fact,
          hasFact: d.hasFact && seg.fact > 0,
        });
        totalPlan += seg.plan;
        totalFact += seg.fact;
      }
      byDivision.sort((a, b) => b.fact - a.fact);
      brandsForAccordion.push({ code, name: BRAND_NAMES[code] || code, totalPlan, totalFact, byDivision });
    }
    brandsForAccordion.sort((a, b) => b.totalFact - a.totalFact);
  }

  // Контекстний суфікс для hero-карток («План усієї компанії», «План Колл-центру» тощо).
  // Міняється разом з фільтром Група — щоб число у картці відповідало підпису.
  const groupLabel = (() => {
    switch (groupFilter) {
      case 'all': return 'усієї компанії';
      case 'representations': return 'Представництв';
      case 'call-center': return 'Колл-центру';
      case 'laserhouse': return 'Лазерхаузу';
      case 'adassa': return 'Адасси';
      case 'distributors': return 'Дистрибуторів';
    }
  })();

  const filteredTotalPlan = filteredDivisions.reduce((s, d) => s + d.totalPlan, 0);
  const filteredTotalFact = filteredDivisions.reduce((s, d) => s + d.totalFact, 0);
  const filteredTotalPrevFact = filteredDivisions.reduce((s, d) => s + d.totalPrevFact, 0);
  const filteredActivePlan = filteredDivisions.filter(d => d.hasFact).reduce((s, d) => s + d.totalPlan, 0);
  const filteredWithoutFact = filteredDivisions.filter(d => !d.hasFact).map(d => d.displayName);

  const totalPct = filteredActivePlan > 0 ? (filteredTotalFact / filteredActivePlan) * 100 : 0;
  const factDelta = filteredTotalFact - filteredTotalPrevFact;

  const periodDate = new Date(`${period}-01T00:00:00`);
  // asOfDate (Date) — для розрахунку робочих днів і норми. Якщо live — сьогодні;
  // якщо фільтр історичний — weekEnd. Якщо weekEnd порожній — періодний місяць.
  const asOfForCalc = useMemo(() => {
    if (liveMode) return now;
    const [py, pm, pd] = (currentPeriod.weekEnd || '').split('-').map(Number);
    if (Number.isFinite(py) && Number.isFinite(pm) && Number.isFinite(pd)) return new Date(py, pm - 1, pd);
    return now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMode, currentPeriod.weekEnd]);
  const calcPct = getMonthProgressPct(periodDate.getFullYear(), periodDate.getMonth(), asOfForCalc);
  // «Норма на ранок» = % робочих днів пройдено станом на ВЧОРА (asOf − 1). Дає
  // baseline «що було на початку дня vs зараз».
  const morningDate = useMemo(() => {
    const d = new Date(asOfForCalc);
    d.setDate(d.getDate() - 1);
    return d;
  }, [asOfForCalc]);
  const morningPct = getMonthProgressPct(periodDate.getFullYear(), periodDate.getMonth(), morningDate);
  const deviation = totalPct - calcPct;
  // Робочі дні — для 1-ї hero (passed / total)
  const totalWD = getWorkingDaysInMonth(periodDate.getFullYear(), periodDate.getMonth());
  const passedWD = getPassedWorkingDays(periodDate.getFullYear(), periodDate.getMonth(), asOfForCalc);
  // Прогноз (темп): екстраполюємо поточний факт на весь місяць — fact * (totalWD / passedWD).
  // Це дає очікуваний % виконання у кінці місяця при поточному темпі продажів.
  const forecastFact = passedWD > 0 ? filteredTotalFact * (totalWD / passedWD) : 0;
  const forecastPct = filteredActivePlan > 0 ? (forecastFact / filteredActivePlan) * 100 : 0;

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#066aab] to-[#5bd5bc] text-white flex items-center justify-center shadow-lg shadow-blue-500/15">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Огляд компанії</h1>
          <p className="text-[12px] text-muted-foreground">
            План / факт по всіх підрозділах компанії
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data?.asOfDate && (
            <span className="text-[10px] text-muted-foreground" title={`Зріз даних з 1С: ${data.asOfDate}`}>
              станом на {data.asOfDate}
            </span>
          )}
          <button onClick={() => mutate(undefined, { revalidate: true })} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-[#066aab] transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Оновити
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 rounded-xl bg-rose-50/60 backdrop-blur-md border border-rose-200/70 text-[12px] text-rose-700">
          Помилка завантаження: {String(error.message || error)}
        </div>
      )}

      {isLoading && !data && (
        <div className="glass-card p-12 text-center">
          <RefreshCw className="h-6 w-6 animate-spin text-[#066aab] mx-auto mb-3" />
          <p className="text-[13px] text-muted-foreground">Збираємо дані з 1С (план + факт)…</p>
        </div>
      )}

      {data && (
        <>
          {/* Контекст періоду (із шапки) + фільтр Група.
              Період БЕРЕМО з глобального PeriodFilter у шапці — не дублюємо тут. */}
          <div className="glass-card-soft p-3 flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-[12px] font-semibold text-foreground">
              {liveMode ? (
                <>
                  <Zap className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                  <span className="uppercase tracking-wider text-[10px] font-bold text-amber-700">LIVE</span>
                  <span className="text-muted-foreground">·</span>
                </>
              ) : null}
              {new Date(`${period}-01T00:00:00`).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })}
            </span>
            <div className="flex-1" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mr-1">Група</span>
              {([
                ['all', 'Усі підрозділи'],
                ['representations', 'Представництва'],
                ['call-center', 'Колл-центр'],
                ['laserhouse', 'Лазерхауз'],
                ['adassa', 'Адасса'],
                ['distributors', 'Дистрибутори'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setGroupFilter(key); setExpandedKey(null); }}
                  className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                    groupFilter === key
                      ? 'bg-gradient-to-r from-[#066aab] to-[#0880cc] text-white shadow-md shadow-[#066aab]/25'
                      : 'bg-white/60 backdrop-blur-md border border-white/50 text-muted-foreground hover:bg-white/90 hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Hero — у preview-стилі: colored dot у label, великий $ з sup, delta pills.
              Підписи (План X, Факт X) міняються разом з фільтром Група. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="glass-card p-6 transition-all hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(6,42,61,0.08)]">
              <div className="flex items-center gap-2 mb-3">
                <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-[#066aab] shadow-[0_0_6px_#066aab]" />
                <p className="text-[10px] uppercase tracking-[1.1px] text-muted-foreground font-bold">План {groupLabel}</p>
              </div>
              <p className="text-[36px] font-bold tracking-[-1px] tabular-nums leading-none">
                <span className="text-[22px] font-medium text-muted-foreground align-top mr-0.5">$</span>
                <span className="amount">{Math.round(filteredTotalPlan).toLocaleString('en-US')}</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-3">
                {filteredDivisions.length} підрозділів · {passedWD} / {totalWD} робочих днів
              </p>
            </div>

            <div className="glass-card p-6 transition-all hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(6,42,61,0.08)]">
              <div className="flex items-center gap-2 mb-3">
                <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-[#5bd5bc] shadow-[0_0_6px_#5bd5bc]" />
                <p className="text-[10px] uppercase tracking-[1.1px] text-muted-foreground font-bold">Факт {groupLabel}</p>
              </div>
              <p className="text-[36px] font-bold tracking-[-1px] tabular-nums leading-none">
                <span className="text-[22px] font-medium text-muted-foreground align-top mr-0.5">$</span>
                <span className="amount">{Math.round(filteredTotalFact).toLocaleString('en-US')}</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-3">по підрозділах де є факт</p>
              {filteredTotalPrevFact > 0 && (
                <span className={`inline-flex items-center gap-1 mt-3 px-2.5 py-1 rounded-full text-[11px] font-bold ${factDelta >= 0 ? 'bg-teal-100/70 text-teal-800' : 'bg-rose-100/70 text-rose-800'}`}>
                  {factDelta >= 0 ? '↑' : '↓'} {fmtUSD(Math.abs(factDelta))} vs мин.міс.
                </span>
              )}
            </div>

            <div className="glass-card p-6 transition-all hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(6,42,61,0.08)]">
              <div className="flex items-center gap-2 mb-3">
                <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-[#5bd5bc] shadow-[0_0_6px_#5bd5bc]" />
                <p className="text-[10px] uppercase tracking-[1.1px] text-muted-foreground font-bold">Виконання</p>
              </div>
              <p className="text-[36px] font-bold tracking-[-1px] tabular-nums leading-none">{fmtPct(totalPct)}</p>
              <p className="text-[11px] text-muted-foreground mt-2">
                Норма на {asOfForCalc.getDate().toString().padStart(2, '0')}.{(asOfForCalc.getMonth() + 1).toString().padStart(2, '0')}: <span className="font-semibold text-foreground">{fmtPct(calcPct)}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Норма на ранок: <span className="font-semibold text-foreground">{fmtPct(morningPct)}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Прогноз (темп): <span className={`font-semibold ${forecastPct >= 100 ? 'text-teal-700' : forecastPct >= 80 ? 'text-amber-600' : 'text-rose-700'}`}>{fmtPct(forecastPct)}</span>
              </p>
              <span className={`inline-flex items-center gap-1 mt-3 px-2.5 py-1 rounded-full text-[11px] font-bold ${deviation >= 0 ? 'bg-teal-100/70 text-teal-800' : 'bg-rose-100/70 text-rose-800'}`}>
                {deviation >= 0 ? '+' : ''}{deviation.toFixed(1)}% vs норма
              </span>
            </div>

            {(() => {
              // 4-та hero — три режими:
              //   filter='all' → «Підрозділи не в плані» (контроль повноти даних з 1С)
              //   filter=reps/call-center → «Купивши клієнти» (бо є клієнтська база)
              //   filter=Лазерхауз/Адасса/Дистрибутори → «Робочі дні» (клієнтських даних нема,
              //     великої категорійної карти не показуємо)
              if (groupFilter === 'all') {
                // Підрозділи що ВІДСТАЮТЬ від норми (pct < calcPct).
                const behind = filteredDivisions
                  .filter(d => d.totalPlan > 0)
                  .map(d => {
                    const pct = d.hasFact ? (d.totalFact / d.totalPlan) * 100 : 0;
                    return { name: d.displayName, pct, delta: pct - calcPct };
                  })
                  .filter(x => x.delta < 0)
                  .sort((a, b) => a.delta - b.delta);
                const totalDivs = filteredDivisions.filter(d => d.totalPlan > 0).length;
                return (
                  <div className="glass-card p-5 transition-all hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(6,42,61,0.08)] relative">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-[#fb923c] shadow-[0_0_6px_#fb923c]" />
                      <p className="text-[10px] uppercase tracking-[1.1px] text-muted-foreground font-bold flex-1">Відстають від плану</p>
                      <span className="text-[20px] font-bold tabular-nums leading-none">
                        {behind.length}<span className="text-[13px] font-medium text-muted-foreground">/{totalDivs}</span>
                      </span>
                    </div>
                    {behind.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">— усі тримають темп</p>
                    ) : (
                      <div className="flex flex-col gap-0.5 max-h-[150px] overflow-y-auto pr-1">
                        {behind.map(b => (
                          <div key={b.name} className="flex items-center justify-between text-[11px] gap-2">
                            <span className="text-muted-foreground truncate">{b.name}</span>
                            <span className="font-bold tabular-nums text-rose-700 shrink-0">{b.delta.toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              const isClientGroup = groupFilter === 'representations' || groupFilter === 'call-center';
              if (!isClientGroup) {
                // Робочі дні місяця: пройшло / всього
                const py = periodDate.getFullYear();
                const pm = periodDate.getMonth();
                const totalWD = getWorkingDaysInMonth(py, pm);
                const passedWD = getPassedWorkingDays(py, pm, now);
                const remainingWD = Math.max(0, totalWD - passedWD);
                return (
                  <div className="glass-card p-6 transition-all hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(6,42,61,0.08)] relative">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-[#a855f7] shadow-[0_0_6px_#a855f7]" />
                      <p className="text-[10px] uppercase tracking-[1.1px] text-muted-foreground font-bold">Робочі дні</p>
                    </div>
                    <p className="text-[36px] font-bold tracking-[-1px] tabular-nums leading-none">
                      {passedWD} <span className="text-[22px] font-medium text-muted-foreground">/ {totalWD}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-3">{remainingWD > 0 ? `лишилось ${remainingWD} ${remainingWD === 1 ? 'день' : remainingWD < 5 ? 'дні' : 'днів'} до кінця` : 'місяць завершено'}</p>
                  </div>
                );
              }
              // Тільки reps+call-center дані для клієнтської картки
              const clientDivs = filteredDivisions.filter(d => d.groupKey === 'representations' || d.groupKey === 'call-center');
              const agg = clientDivs.reduce((a, d) => {
                if (d.clientStats) {
                  a.totalBought  += d.clientStats.totalBought;
                  a.totalClients += d.clientStats.totalClients;
                  a.active   += d.clientStats.active.bought;
                  a.sleeping += d.clientStats.sleeping.bought;
                  a.lost     += d.clientStats.lost.bought;
                  a.new      += d.clientStats.new.bought;
                  a.none     += d.clientStats.none.bought;
                }
                if (d.prevClientStats) {
                  a.prevTotalBought += d.prevClientStats.totalBought;
                }
                return a;
              }, { totalBought: 0, totalClients: 0, prevTotalBought: 0, active: 0, sleeping: 0, lost: 0, new: 0, none: 0 });
              const deltaBought = agg.totalBought - agg.prevTotalBought;
              return (
                <div className="glass-card p-6 transition-all hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(6,42,61,0.08)] relative">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-[#fb923c] shadow-[0_0_6px_#fb923c]" />
                    <p className="text-[10px] uppercase tracking-[1.1px] text-muted-foreground font-bold">Покупці місяця · {groupLabel}</p>
                  </div>
                  <p className="text-[36px] font-bold tracking-[-1px] tabular-nums leading-none">
                    {agg.totalBought}
                    {agg.totalClients > 0 && (
                      <span className="text-[22px] font-medium text-muted-foreground"> / {agg.totalClients}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-3">
                    {agg.totalClients > 0
                      ? `${((agg.totalBought / agg.totalClients) * 100).toFixed(1)}% активність клієнтської бази`
                      : 'немає даних з 1С'}
                  </p>
                  {agg.prevTotalBought > 0 && (
                    <span className={`inline-flex items-center gap-1 mt-3 px-2.5 py-1 rounded-full text-[11px] font-bold ${deltaBought >= 0 ? 'bg-teal-100/70 text-teal-800' : 'bg-rose-100/70 text-rose-800'}`}>
                      {deltaBought >= 0 ? '↑' : '↓'} {Math.abs(deltaBought)} клієнтів vs мин.міс.
                    </span>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Велика інформаційна карта: купивші клієнти по 5 категоріях × vs минулий місяць.
              Показуємо ТІЛЬКИ для груп з реальною клієнтською базою —
              Представництва і Колл-центр. Для Лазерхауз/Адасса/Дистрибуторів
              дані з 1С сумбурні (наприклад «2/1 = 200%»), категорійна логіка
              не застосовується. */}
          {(groupFilter === 'all' || groupFilter === 'representations' || groupFilter === 'call-center') && (() => {
            // Враховуємо ТІЛЬКИ Представництва і Колл-центр (інші підрозділи мають
            // sentinel-дані типу 2/1=200% які не мають сенсу у розрізі категорій).
            const clientDivs = filteredDivisions.filter(d =>
              d.groupKey === 'representations' || d.groupKey === 'call-center'
            );
            const agg = clientDivs.reduce((a, d) => {
              if (d.clientStats) {
                a.cur.active.total   += d.clientStats.active.total;    a.cur.active.bought   += d.clientStats.active.bought;
                a.cur.sleeping.total += d.clientStats.sleeping.total;  a.cur.sleeping.bought += d.clientStats.sleeping.bought;
                a.cur.lost.total     += d.clientStats.lost.total;      a.cur.lost.bought     += d.clientStats.lost.bought;
                a.cur.new.total      += d.clientStats.new.total;       a.cur.new.bought      += d.clientStats.new.bought;
                a.cur.none.total     += d.clientStats.none.total;      a.cur.none.bought     += d.clientStats.none.bought;
                a.cur.totalClients   += d.clientStats.totalClients;    a.cur.totalBought     += d.clientStats.totalBought;
              }
              if (d.prevClientStats) {
                a.prev.active.bought   += d.prevClientStats.active.bought;
                a.prev.sleeping.bought += d.prevClientStats.sleeping.bought;
                a.prev.lost.bought     += d.prevClientStats.lost.bought;
                a.prev.new.bought      += d.prevClientStats.new.bought;
                a.prev.none.bought     += d.prevClientStats.none.bought;
                a.prev.totalBought     += d.prevClientStats.totalBought;
              }
              return a;
            }, {
              cur: { active: {total:0,bought:0}, sleeping:{total:0,bought:0}, lost:{total:0,bought:0}, new:{total:0,bought:0}, none:{total:0,bought:0}, totalClients:0, totalBought:0 },
              prev: { active:{bought:0}, sleeping:{bought:0}, lost:{bought:0}, new:{bought:0}, none:{bought:0}, totalBought:0 },
            });

            const hasAnyData = agg.cur.totalClients > 0;
            if (!hasAnyData) return null;
            const hasPrev = agg.prev.totalBought > 0;
            const cats = [
              { key: 'active',   label: 'Активні',  color: '#10b981', curT: agg.cur.active.total,   curB: agg.cur.active.bought,   prevB: agg.prev.active.bought },
              { key: 'sleeping', label: 'Сплячі',   color: '#fb923c', curT: agg.cur.sleeping.total, curB: agg.cur.sleeping.bought, prevB: agg.prev.sleeping.bought },
              { key: 'new',      label: 'Нові',     color: '#0880cc', curT: agg.cur.new.total,      curB: agg.cur.new.bought,      prevB: agg.prev.new.bought },
              { key: 'lost',     label: 'Втрачені', color: '#94a3b8', curT: agg.cur.lost.total,     curB: agg.cur.lost.bought,     prevB: agg.prev.lost.bought },
              { key: 'none',     label: 'Без закупок', color: '#cbd5e1', curT: agg.cur.none.total, curB: agg.cur.none.bought,     prevB: agg.prev.none.bought },
            ];
            return (
              <div className="glass-card p-6 transition-all">
                <div className="flex items-center gap-2 mb-1">
                  <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-[#066aab] shadow-[0_0_6px_#066aab]" />
                  <h3 className="text-[14px] font-bold">
                    Клієнти-покупці по категоріях
                    {groupFilter === 'representations' && ' · Представництва'}
                    {groupFilter === 'call-center' && ' · Колл-центр'}
                    {groupFilter === 'all' && ' · Представництва + Колл-центр'}
                  </h3>
                </div>
                <p className="text-[11px] text-muted-foreground mb-4">
                  Скільки клієнтів кожної категорії купили хоча б щось цього місяця.
                  {hasPrev ? ' Поряд — кількість за минулий місяць.' : ' Дані за минулий місяць недоступні.'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {cats.map(c => {
                    const pct = c.curT > 0 ? (c.curB / c.curT) * 100 : 0;
                    const delta = c.curB - c.prevB;
                    return (
                      <div key={c.key} className="glass-card-soft p-4 flex flex-col">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                          <span className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">{c.label}</span>
                        </div>
                        <p className="text-[28px] font-bold tabular-nums leading-none">
                          {c.curB}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {c.curT > 0 ? `${pct.toFixed(1)}% купили` : 'купили'}
                        </p>
                        {hasPrev && (
                          <span className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold self-start ${delta >= 0 ? 'bg-teal-100/70 text-teal-800' : 'bg-rose-100/70 text-rose-800'}`}>
                            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)} vs {agg.prev.totalBought > 0 ? `мин.міс ($${c.prevB})` : 'мин.міс'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {(() => {
            const tealPalette = ['#066aab', '#0880cc', '#5bd5bc', '#14b8a6', '#0d9488', '#0e7490', '#67e8f9', '#a7f3d0'];
            const mixedPalette = ['#066aab', '#fb923c', '#fbbf24', '#a855f7', '#5bd5bc'];
            const brandPalette = ['#066aab', '#0880cc', '#5bd5bc', '#14b8a6', '#0d9488', '#fb923c', '#fbbf24', '#a855f7', '#ec4899'];

            const reps = filteredDivisions.filter(d => d.groupKey === 'representations');
            const regionsTotalFact = reps.reduce((s, d) => s + d.totalFact, 0);
            const repsSegments = reps
              .filter(d => d.totalFact > 0)
              .sort((a, b) => b.totalFact - a.totalFact)
              .map((d, i) => ({ name: d.divisionName, value: d.totalFact, color: tealPalette[i % tealPalette.length] }));

            // Donut «Підрозділи у компанії» — будуємо по ФАКТУ (не плану).
            // План йде у subtitle як база для % виконання.
            // При filter=distributors — розщеплюємо Полтаву та Чернівці окремими
            // сегментами (інакше один сегмент «Дистрибутори» = немає donut).
            const divisionSegments: { name: string; value: number; plan: number; color: string }[] = [];
            if (groupFilter === 'distributors') {
              for (const distKey of ['distributor-chuguy', 'distributor-haylenko'] as const) {
                const divs = filteredDivisions.filter(d => d.groupKey === distKey);
                const fact = divs.reduce((s, d) => s + d.totalFact, 0);
                const plan = divs.reduce((s, d) => s + d.totalPlan, 0);
                if (fact > 0) {
                  divisionSegments.push({
                    name: GROUP_LABEL[distKey],  // «Полтава» / «Чернівці»
                    value: fact,
                    plan,
                    color: mixedPalette[divisionSegments.length % mixedPalette.length],
                  });
                }
              }
            } else {
              const distributorsFactSum = filteredDivisions
                .filter(d => d.groupKey === 'distributor-chuguy' || d.groupKey === 'distributor-haylenko')
                .reduce((s, d) => s + d.totalFact, 0);
              const distributorsPlanSum = filteredDivisions
                .filter(d => d.groupKey === 'distributor-chuguy' || d.groupKey === 'distributor-haylenko')
                .reduce((s, d) => s + d.totalPlan, 0);
              for (const groupKey of GROUP_ORDER) {
                if (groupKey === 'distributor-chuguy' || groupKey === 'distributor-haylenko') continue;
                const divs = filteredDivisions.filter(d => d.groupKey === groupKey);
                const groupFact = divs.reduce((s, d) => s + d.totalFact, 0);
                const groupPlan = divs.reduce((s, d) => s + d.totalPlan, 0);
                if (groupFact > 0) {
                  divisionSegments.push({
                    name: GROUP_LABEL[groupKey],
                    value: groupFact,
                    plan: groupPlan,
                    color: mixedPalette[divisionSegments.length % mixedPalette.length],
                  });
                }
              }
              if (distributorsFactSum > 0) {
                divisionSegments.push({
                  name: 'Дистрибутори',
                  value: distributorsFactSum,
                  plan: distributorsPlanSum,
                  color: mixedPalette[divisionSegments.length % mixedPalette.length],
                });
              }
            }
            const divTotalFact = divisionSegments.reduce((s, x) => s + x.value, 0);
            const divTotalPlanSum = divisionSegments.reduce((s, x) => s + x.plan, 0);
            const divPct = divTotalPlanSum > 0 ? (divTotalFact / divTotalPlanSum) * 100 : 0;

            const brandFactMap = new Map<string, number>();
            for (const d of filteredDivisions) {
              for (const [code, seg] of Object.entries(d.segments)) {
                if (d.hasFact && seg.fact > 0) {
                  brandFactMap.set(code, (brandFactMap.get(code) || 0) + seg.fact);
                }
              }
            }
            const brandSegments = Array.from(brandFactMap.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([code, value], i) => ({
                name: BRAND_NAMES[code] || code,
                value,
                color: brandPalette[i % brandPalette.length],
              }));
            const brandTotalFact = brandSegments.reduce((s, x) => s + x.value, 0);

            const fmtUsdLegend = (_v: number, pct: number) => pct.toFixed(1) + '%';

            const show1 = repsSegments.length > 1;
            const show2 = divisionSegments.length > 1;
            const show3 = brandSegments.length > 1;
            const visibleCount = [show1, show2, show3].filter(Boolean).length;

            if (visibleCount === 0) {
              return (
                <div className="glass-card p-5 text-center text-[12px] text-muted-foreground">
                  Для обраного фільтру donut-діаграми не показуються — недостатньо даних (потрібно ≥ 2 сегменти).
                </div>
              );
            }

            const gridCols = visibleCount === 1 ? 'grid-cols-1'
              : visibleCount === 2 ? 'grid-cols-1 lg:grid-cols-2'
              : 'grid-cols-1 lg:grid-cols-3';

            return (
              <div className={`grid ${gridCols} gap-3`}>
                {show1 && (
                  <DonutChart
                    title="Регіони у Представництвах"
                    subtitle={`Частка кожного у факті (${fmtUSD(regionsTotalFact)})`}
                    centerLabel={fmtUSDCompact(regionsTotalFact)}
                    centerSub="факт"
                    segments={repsSegments}
                    formatValue={fmtUsdLegend}
                  />
                )}
                {show2 && (
                  <DonutChart
                    title={groupFilter === 'distributors' ? 'Дистрибутори' : 'Підрозділи у компанії'}
                    subtitle={`Частка кожного у факті (${fmtUSD(divTotalFact)}) · виконання ${divPct.toFixed(1)}% плану`}
                    centerLabel={fmtUSDCompact(divTotalFact)}
                    centerSub="факт"
                    segments={divisionSegments}
                    formatValue={fmtUsdLegend}
                  />
                )}
                {show3 && (
                  <DonutChart
                    title={(() => {
                      switch (groupFilter) {
                        case 'all': return 'Бренди у компанії';
                        case 'representations': return 'Бренди у Представництвах';
                        case 'call-center': return 'Бренди у Колл-центрі';
                        case 'laserhouse': return 'Бренди у Лазерхаузі';
                        case 'adassa': return 'Бренди в Адассі';
                        case 'distributors': return 'Бренди у Дистрибуторів';
                      }
                    })()}
                    subtitle={`Частка кожного у факті (${fmtUSD(brandTotalFact)})`}
                    centerLabel={fmtUSDCompact(brandTotalFact)}
                    centerSub="факт"
                    segments={brandSegments}
                    formatValue={fmtUsdLegend}
                  />
                )}
              </div>
            );
          })()}

          <div className="glass-card p-5">
            <div className="mb-3">
              <h3 className="text-[14px] font-bold">Теплова карта · Підрозділ × Бренд</h3>
              <p className="text-[11px] text-muted-foreground">Колір = % виконання плану. Сірий = немає факту з 1С.</p>
            </div>
            <div className="overflow-x-auto">
              {(() => {
                // Показуємо тільки бренди де є план хоча б в одному рядку
                // (інакше для Колл-центру було б 6 порожніх «—» колонок).
                const activeBrandCodes = BRAND_CODES.filter(code =>
                  heatmapRows.some(row => (row.segments[code]?.plan ?? 0) > 0 || (row.segments[code]?.fact ?? 0) > 0)
                );
                return (
                  <table className="w-full border-separate border-spacing-1 text-[11px]">
                    <thead>
                      <tr>
                        <th className="text-left p-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold whitespace-nowrap">Підрозділ</th>
                        {activeBrandCodes.map(code => (
                          <th key={code} className="p-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{BRAND_NAMES[code]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heatmapRows.map(row => (
                        <tr key={row.key}>
                          <td className="text-left p-2 font-bold text-[12px] whitespace-nowrap">
                            {row.label}
                            {row.subLabel && <div className="text-[9px] text-muted-foreground font-medium">{row.subLabel}</div>}
                          </td>
                          {activeBrandCodes.map(code => {
                            const seg = row.segments[code];
                            if (!seg || (seg.plan === 0 && seg.fact === 0)) {
                              return <td key={code} className={`rounded-lg p-2 text-center ${heatColor(null)}`}><span className="text-[10px] font-medium">—</span></td>;
                            }
                            // Якщо план є — рахуємо % (навіть якщо факту 0 → 0.0%).
                            // Раніше вимагали hasFact=true → 8 брендів Адасси показувались «н/д»
                            // хоча плани реально існують і факту реально нема (=0% виконання).
                            const pct = seg.plan > 0 ? (seg.fact / seg.plan) * 100 : null;
                            return (
                              <td key={code} className={`rounded-lg p-2 text-center min-h-[44px] font-mono font-bold ${heatColor(pct)}`}>
                                <div className="text-[11px]">{pct !== null ? fmtPct(pct) : 'н/д'}</div>
                                {seg.plan > 0 && (
                                  <div className="text-[9px] opacity-75 mt-0.5 font-medium">{fmtUSD(seg.fact)}/{fmtUSD(seg.plan)}</div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
            <div className="flex gap-4 mt-3 text-[10px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-teal-400/55" /> &gt;100%</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-teal-300/35" /> 80-100%</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-lime-300/30" /> 60-80%</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-300/30" /> 40-60%</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-300/35" /> &lt;40%</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-100/60" /> н/д</span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-[16px] font-bold">Деталізація</h2>
              <div className="flex gap-1 bg-white/60 backdrop-blur-md p-1 rounded-full border border-white/50 ml-auto">
                <button
                  onClick={() => { setAccordionMode('by-div'); setExpandedKey(null); }}
                  className={`px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all ${accordionMode === 'by-div' ? 'bg-gradient-to-r from-[#066aab] to-[#0880cc] text-white shadow' : 'text-muted-foreground'}`}
                >
                  Підрозділи → бренди
                </button>
                <button
                  onClick={() => { setAccordionMode('by-brand'); setExpandedKey(null); }}
                  className={`px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all ${accordionMode === 'by-brand' ? 'bg-gradient-to-r from-[#066aab] to-[#0880cc] text-white shadow' : 'text-muted-foreground'}`}
                >
                  Бренди → підрозділи
                </button>
              </div>
            </div>

            {accordionMode === 'by-div' && (
              <div className="space-y-2">
                {/* Заголовки колонок верхнього рівня */}
                <div className="grid grid-cols-[20px_1fr_180px_80px_60px] gap-3 items-center px-4 text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                  <span />
                  <span>Підрозділ</span>
                  <span className="text-right">Факт / План</span>
                  <span className="text-right">Виконан.</span>
                  <span />
                </div>
                {groupsForAccordion.map(g => {
                  const isExpanded = expandedKey === g.key;
                  const pct = g.hasFact && g.totalPlan > 0 ? (g.totalFact / g.totalPlan) * 100 : null;
                  return (
                    <div key={g.key} className={`glass-card p-4 transition-all ${isExpanded ? 'ring-1 ring-[#066aab]/30' : ''}`}>
                      <button
                        onClick={() => { setExpandedKey(isExpanded ? null : g.key); setExpandedSubKey(null); }}
                        className="w-full grid grid-cols-[20px_1fr_180px_80px_60px] gap-3 items-center text-left"
                      >
                        <span className={`text-[12px] text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                        <span className="font-bold text-[14px]">
                          {g.label}
                          {g.isRepresentations && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider bg-[#066aab]/10 text-[#066aab] px-2 py-0.5 rounded-full">{g.children.length} регіонів</span>}
                          {!g.hasFact && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider bg-slate-100/70 text-slate-600 px-2 py-0.5 rounded-full">Без факту</span>}
                        </span>
                        <span className="font-mono tabular-nums text-[12px] text-right">
                          {g.hasFact ? <><strong>{fmtUSD(g.totalFact)}</strong> / </> : '— / '}
                          <span className="text-muted-foreground">{fmtUSD(g.totalPlan)}</span>
                        </span>
                        <span className={`text-[13px] font-bold tabular-nums text-right ${pct === null ? 'text-slate-400' : pct >= 80 ? 'text-teal-700' : pct >= 60 ? 'text-lime-700' : pct >= 40 ? 'text-orange-700' : 'text-rose-700'}`}>
                          {pct !== null ? fmtPct(pct) : 'н/д'}
                        </span>
                        <span className="text-[11px] text-muted-foreground text-right">›</span>
                      </button>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-200/60">
                          {g.isRepresentations ? (
                            // Представництва: 8 регіонів + кожен розкривається у бренди
                            <>
                              <div className="grid grid-cols-[16px_1fr_70px_180px_70px] gap-3 items-center px-3 text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-2">
                                <span />
                                <span>Регіон</span>
                                <span className="text-right">% групи</span>
                                <span className="text-right">Факт / План</span>
                                <span className="text-right">Виконан.</span>
                              </div>
                              <div className="space-y-2">
                                {g.children
                                  .slice()
                                  .sort((a, b) => b.totalFact - a.totalFact)
                                  .map(d => {
                                  const childPct = d.hasFact && d.totalPlan > 0 ? (d.totalFact / d.totalPlan) * 100 : null;
                                  const shareOfGroup = g.totalFact > 0 ? (d.totalFact / g.totalFact) * 100 : 0;
                                  const subKey = `${g.key}:${d.divisionName}`;
                                  const isSubExpanded = expandedSubKey === subKey;
                                  // Бренди цього регіону з планом
                                  const regionBrands = Object.entries(d.segments)
                                    .filter(([_, s]) => s.plan > 0)
                                    .sort((a, b) => b[1].fact - a[1].fact);
                                  return (
                                    <div key={d.divisionName} className={`glass-card-soft transition-all ${isSubExpanded ? 'ring-1 ring-[#066aab]/30' : ''}`}>
                                      <button
                                        onClick={() => setExpandedSubKey(isSubExpanded ? null : subKey)}
                                        className="w-full p-3 grid grid-cols-[16px_1fr_70px_180px_70px] gap-3 items-center text-left"
                                      >
                                        <span className={`text-[11px] text-muted-foreground transition-transform ${isSubExpanded ? 'rotate-90' : ''}`}>▶</span>
                                        <span className="text-[13px] font-semibold">{d.divisionName}</span>
                                        <span className="font-mono tabular-nums text-[12px] text-right font-bold text-[#066aab]">
                                          {d.hasFact ? fmtPct(shareOfGroup) : '—'}
                                        </span>
                                        <span className="font-mono tabular-nums text-[11px] text-right">
                                          {d.hasFact ? <><strong>{fmtUSD(d.totalFact)}</strong> / </> : '— / '}
                                          <span className="text-muted-foreground">{fmtUSD(d.totalPlan)}</span>
                                        </span>
                                        <span className={`text-[12px] font-bold tabular-nums text-right ${childPct === null ? 'text-slate-400' : childPct >= 80 ? 'text-teal-700' : childPct >= 40 ? 'text-orange-700' : 'text-rose-700'}`}>
                                          {childPct !== null ? fmtPct(childPct) : 'н/д'}
                                        </span>
                                      </button>
                                      {isSubExpanded && (
                                        <div className="px-3 pb-3 pt-1 border-t border-slate-200/60">
                                          <div className="grid grid-cols-[1fr_70px_180px_70px] gap-3 items-center px-3 text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-2 mt-2">
                                            <span>Бренд</span>
                                            <span className="text-right">% регіону</span>
                                            <span className="text-right">Факт / План</span>
                                            <span className="text-right">Виконан.</span>
                                          </div>
                                          <div className="space-y-1.5">
                                            {regionBrands.length === 0 ? (
                                              <div className="text-[12px] text-muted-foreground text-center py-2">Немає брендів з планом</div>
                                            ) : regionBrands.map(([code, s]) => {
                                              const brandPct = s.plan > 0 ? (s.fact / s.plan) * 100 : null;
                                              const shareOfRegion = d.totalFact > 0 ? (s.fact / d.totalFact) * 100 : 0;
                                              return (
                                                <div key={code} className="bg-white/40 rounded-lg p-2.5 grid grid-cols-[1fr_70px_180px_70px] gap-3 items-center">
                                                  <span className="text-[12px] font-medium">{BRAND_NAMES[code] || code}</span>
                                                  <span className="font-mono tabular-nums text-[11px] text-right font-bold text-[#066aab]">
                                                    {s.fact > 0 ? fmtPct(shareOfRegion) : '—'}
                                                  </span>
                                                  <span className="font-mono tabular-nums text-[11px] text-right">
                                                    <strong>{fmtUSD(s.fact)}</strong> / <span className="text-muted-foreground">{fmtUSD(s.plan)}</span>
                                                  </span>
                                                  <span className={`text-[11px] font-bold tabular-nums text-right ${brandPct === null ? 'text-slate-400' : brandPct >= 80 ? 'text-teal-700' : brandPct >= 40 ? 'text-orange-700' : 'text-rose-700'}`}>
                                                    {brandPct !== null ? fmtPct(brandPct) : 'н/д'}
                                                  </span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          ) : (
                            // Не-представництва: бренди підрозділу + % внеску у факт підрозділу
                            (() => {
                              const brandAgg = new Map<string, { plan: number; fact: number }>();
                              for (const d of g.children) {
                                for (const [code, s] of Object.entries(d.segments)) {
                                  if (s.plan === 0 && s.fact === 0) continue;
                                  const cur = brandAgg.get(code) || { plan: 0, fact: 0 };
                                  cur.plan += s.plan;
                                  cur.fact += s.fact;
                                  brandAgg.set(code, cur);
                                }
                              }
                              const brandRows = Array.from(brandAgg.entries())
                                .filter(([_, s]) => s.plan > 0)
                                .sort((a, b) => b[1].fact - a[1].fact);
                              if (brandRows.length === 0) {
                                return <div className="text-[12px] text-muted-foreground text-center py-2">Немає брендів з планом</div>;
                              }
                              return (
                                <>
                                  <div className="grid grid-cols-[1fr_70px_180px_70px] gap-3 items-center px-3 text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-2">
                                    <span>Бренд</span>
                                    <span className="text-right">% підрозділу</span>
                                    <span className="text-right">Факт / План</span>
                                    <span className="text-right">Виконан.</span>
                                  </div>
                                  <div className="space-y-2">
                                    {brandRows.map(([code, s]) => {
                                      const segPct = s.plan > 0 ? (s.fact / s.plan) * 100 : null;
                                      const shareOfDiv = g.totalFact > 0 ? (s.fact / g.totalFact) * 100 : 0;
                                      return (
                                        <div key={code} className="glass-card-soft p-3 grid grid-cols-[1fr_70px_180px_70px] gap-3 items-center">
                                          <span className="text-[13px] font-semibold">{BRAND_NAMES[code] || code}</span>
                                          <span className="font-mono tabular-nums text-[12px] text-right font-bold text-[#066aab]">
                                            {s.fact > 0 ? fmtPct(shareOfDiv) : '—'}
                                          </span>
                                          <span className="font-mono tabular-nums text-[11px] text-right">
                                            <strong>{fmtUSD(s.fact)}</strong> / <span className="text-muted-foreground">{fmtUSD(s.plan)}</span>
                                          </span>
                                          <span className={`text-[12px] font-bold tabular-nums text-right ${segPct === null ? 'text-slate-400' : segPct >= 80 ? 'text-teal-700' : segPct >= 40 ? 'text-orange-700' : 'text-rose-700'}`}>
                                            {segPct !== null ? fmtPct(segPct) : 'н/д'}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </>
                              );
                            })()
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {accordionMode === 'by-brand' && (
              <div className="space-y-2">
                {/* Заголовки колонок */}
                <div className="grid grid-cols-[20px_1fr_180px_80px_60px] gap-3 items-center px-4 text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                  <span />
                  <span>Бренд</span>
                  <span className="text-right">Факт / План</span>
                  <span className="text-right">Виконан.</span>
                  <span />
                </div>
                {brandsForAccordion
                  .filter(b => b.totalPlan > 0)  // ховаємо бренди без плану
                  .map(b => {
                  const isExpanded = expandedKey === b.code;
                  const pct = b.totalPlan > 0 ? (b.totalFact / b.totalPlan) * 100 : null;
                  return (
                    <div key={b.code} className={`glass-card p-4 transition-all ${isExpanded ? 'ring-1 ring-[#066aab]/30' : ''}`}>
                      <button
                        onClick={() => setExpandedKey(isExpanded ? null : b.code)}
                        className="w-full grid grid-cols-[20px_1fr_180px_80px_60px] gap-3 items-center text-left"
                      >
                        <span className={`text-[12px] text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                        <span className="font-bold text-[14px]">{b.name}</span>
                        <span className="font-mono tabular-nums text-[12px] text-right">
                          <strong>{fmtUSD(b.totalFact)}</strong>
                          <span className="text-muted-foreground"> / {fmtUSD(b.totalPlan)}</span>
                        </span>
                        <span className={`text-[13px] font-bold tabular-nums text-right ${pct === null ? 'text-slate-400' : pct >= 80 ? 'text-teal-700' : pct >= 60 ? 'text-lime-700' : pct >= 40 ? 'text-orange-700' : 'text-rose-700'}`}>
                          {pct !== null ? fmtPct(pct) : 'н/д'}
                        </span>
                        <span className="text-[11px] text-muted-foreground text-right">›</span>
                      </button>

                      {isExpanded && (
                        <>
                          {/* Заголовки nested-таблиці з % внеску підрозділу */}
                          <div className="mt-3 pt-3 border-t border-slate-200/60">
                            <div className="grid grid-cols-[1fr_70px_180px_70px] gap-3 items-center px-3 text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-2">
                              <span>Підрозділ</span>
                              <span className="text-right">% бренду</span>
                              <span className="text-right">Факт / План</span>
                              <span className="text-right">Виконан.</span>
                            </div>
                            <div className="space-y-2">
                              {b.byDivision.map(d => {
                                const divPct = d.plan > 0 ? (d.fact / d.plan) * 100 : null;
                                const shareOfBrand = b.totalFact > 0 ? (d.fact / b.totalFact) * 100 : 0;
                                return (
                                  <div key={d.divisionName} className="glass-card-soft p-3 grid grid-cols-[1fr_70px_180px_70px] gap-3 items-center">
                                    <span className="text-[13px] font-semibold">{d.displayName}</span>
                                    {/* % внеску підрозділу у загальний факт бренду — щоб бачити хто головний драйвер */}
                                    <span className="font-mono tabular-nums text-[12px] text-right font-bold text-[#066aab]">
                                      {d.fact > 0 ? fmtPct(shareOfBrand) : '—'}
                                    </span>
                                    <span className="font-mono tabular-nums text-[11px] text-right">
                                      <strong>{fmtUSD(d.fact)}</strong> / <span className="text-muted-foreground">{fmtUSD(d.plan)}</span>
                                    </span>
                                    <span className={`text-[12px] font-bold tabular-nums text-right ${divPct === null ? 'text-slate-400' : divPct >= 80 ? 'text-teal-700' : divPct >= 40 ? 'text-orange-700' : 'text-rose-700'}`}>
                                      {divPct !== null ? fmtPct(divPct) : 'н/д'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
