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
import { getMonthProgressPct } from '@/lib/working-days';
import { Building2, RefreshCw } from 'lucide-react';

const HEADERS_JSON = {
  'Content-Type': 'application/json',
  'x-api-key': process.env.NEXT_PUBLIC_API_SECRET_KEY || '',
};

interface SegmentTotals { plan: number; fact: number; prevFact: number; }
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
}
interface CompanyOverviewData {
  asOfDate: string | null;
  prevMonthAsOfDate: string | null;
  divisions: DivisionDetails[];
  totalPlan: number;
  totalFact: number;
  totalPrevFact: number;
  divisionsWithoutFact: string[];
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
  const { user } = useAppStore();

  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [period, setPeriod] = useState(defaultPeriod);

  const availablePeriods = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const monthNames = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
                        'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = i === 0
        ? `${monthNames[d.getMonth()]} ${d.getFullYear()} (поточний)`
        : `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      out.push({ value: v, label });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [accordionMode, setAccordionMode] = useState<'by-div' | 'by-brand'>('by-div');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<'all' | 'representations' | 'call-center' | 'laserhouse' | 'adassa' | 'distributors'>('all');

  const { data, error, isLoading, mutate } = useSWR<CompanyOverviewData>(
    user ? `company-overview-${period}-${user.login}` : null,
    async () => {
      const r = await fetch(`/api/admin/company-overview?period=${period}`, {
        credentials: 'include',
        headers: HEADERS_JSON,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      return r.json();
    },
    { revalidateOnFocus: false },
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
        subLabel: groupKey === 'representations'
          ? `${divsInGroup.length} регіонів`
          : `${divsInGroup.reduce((s, d) => s + d.managerCount, 0)} менедж.`,
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

  const brandsForAccordion: Array<{
    code: string; name: string;
    totalPlan: number; totalFact: number;
    byGroup: Array<{ groupKey: string; label: string; plan: number; fact: number; hasFact: boolean; }>;
  }> = [];
  if (data) {
    for (const code of BRAND_CODES) {
      let totalPlan = 0, totalFact = 0;
      const byGroup: Array<{ groupKey: string; label: string; plan: number; fact: number; hasFact: boolean }> = [];
      for (const groupKey of GROUP_ORDER) {
        const divs = filteredDivisions.filter(d => d.groupKey === groupKey);
        let plan = 0, fact = 0, hasFact = false;
        for (const d of divs) {
          const seg = d.segments[code];
          if (seg) { plan += seg.plan; fact += seg.fact; if (d.hasFact && seg.fact > 0) hasFact = true; }
        }
        if (plan > 0 || fact > 0) {
          byGroup.push({ groupKey, label: GROUP_LABEL[groupKey as DivisionDetails['groupKey']], plan, fact, hasFact });
          totalPlan += plan; totalFact += fact;
        }
      }
      brandsForAccordion.push({ code, name: BRAND_NAMES[code] || code, totalPlan, totalFact, byGroup });
    }
    brandsForAccordion.sort((a, b) => b.totalFact - a.totalFact);
  }

  const filteredTotalPlan = filteredDivisions.reduce((s, d) => s + d.totalPlan, 0);
  const filteredTotalFact = filteredDivisions.reduce((s, d) => s + d.totalFact, 0);
  const filteredTotalPrevFact = filteredDivisions.reduce((s, d) => s + d.totalPrevFact, 0);
  const filteredActivePlan = filteredDivisions.filter(d => d.hasFact).reduce((s, d) => s + d.totalPlan, 0);
  const filteredWithoutFact = filteredDivisions.filter(d => !d.hasFact).map(d => d.displayName);

  const totalPct = filteredActivePlan > 0 ? (filteredTotalFact / filteredActivePlan) * 100 : 0;
  const factDelta = filteredTotalFact - filteredTotalPrevFact;

  const periodDate = new Date(`${period}-01T00:00:00`);
  const calcPct = getMonthProgressPct(periodDate.getFullYear(), periodDate.getMonth(), now);
  const deviation = totalPct - calcPct;

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
            Усі підрозділи · план/факт без фільтра по плануванню · read-only
          </p>
        </div>
        <button onClick={() => mutate()} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-[#066aab] transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Оновити
        </button>
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
          {/* Фільтри Період + Група — в одному ряду (як preview) */}
          <div className="glass-card-soft p-3 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mr-1">Період</span>
              {availablePeriods.map(p => (
                <button
                  key={p.value}
                  onClick={() => { setPeriod(p.value); setExpandedKey(null); }}
                  className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                    period === p.value
                      ? 'bg-gradient-to-r from-[#066aab] to-[#0880cc] text-white shadow-md shadow-[#066aab]/25'
                      : 'bg-white/60 backdrop-blur-md border border-white/50 text-muted-foreground hover:bg-white/90 hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
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

          {/* Hero — у preview-стилі: colored dot у label, великий $ з sup, delta pills */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="glass-card p-6 transition-all hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(6,42,61,0.08)]">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[#066aab] shadow-[0_0_6px_#066aab]" />
                <p className="text-[10px] uppercase tracking-[1.1px] text-muted-foreground font-bold">План усієї компанії</p>
              </div>
              <p className="text-[36px] font-bold tracking-[-1px] tabular-nums leading-none">
                <span className="text-[22px] font-medium text-muted-foreground align-top mr-0.5">$</span>
                <span className="amount">{Math.round(filteredTotalPlan).toLocaleString('en-US')}</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-3">{filteredDivisions.length} підрозділів · {periodDate.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long' })}</p>
            </div>

            <div className="glass-card p-6 transition-all hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(6,42,61,0.08)]">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[#5bd5bc] shadow-[0_0_6px_#5bd5bc]" />
                <p className="text-[10px] uppercase tracking-[1.1px] text-muted-foreground font-bold">Факт</p>
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
                <span className="w-1.5 h-1.5 rounded-full bg-[#5bd5bc] shadow-[0_0_6px_#5bd5bc]" />
                <p className="text-[10px] uppercase tracking-[1.1px] text-muted-foreground font-bold">Виконання</p>
              </div>
              <p className="text-[36px] font-bold tracking-[-1px] tabular-nums leading-none">{fmtPct(totalPct)}</p>
              <p className="text-[11px] text-muted-foreground mt-3">
                Норма {now.getDate().toString().padStart(2, '0')}.{(now.getMonth() + 1).toString().padStart(2, '0')}: <span className="font-semibold text-foreground">{fmtPct(calcPct)}</span>
              </p>
              <span className={`inline-flex items-center gap-1 mt-3 px-2.5 py-1 rounded-full text-[11px] font-bold ${deviation >= 0 ? 'bg-teal-100/70 text-teal-800' : 'bg-rose-100/70 text-rose-800'}`}>
                {deviation >= 0 ? '+' : ''}{deviation.toFixed(1)}% vs норма
              </span>
            </div>

            <div className="glass-card p-6 transition-all hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(6,42,61,0.08)]">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[#fb923c] shadow-[0_0_6px_#fb923c]" />
                <p className="text-[10px] uppercase tracking-[1.1px] text-muted-foreground font-bold">Без факту</p>
              </div>
              <p className="text-[36px] font-bold tracking-[-1px] tabular-nums leading-none">{filteredWithoutFact.length} <span className="text-[22px] font-medium text-muted-foreground">/ {filteredDivisions.length}</span></p>
              <p className="text-[11px] text-muted-foreground mt-3 truncate" title={filteredWithoutFact.join(', ')}>
                {filteredWithoutFact.length > 0 ? filteredWithoutFact.join(', ') : '— усі з фактом'}
              </p>
              {filteredWithoutFact.length > 0 && (
                <span className="inline-flex items-center gap-1 mt-3 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-100/70 text-orange-800">
                  1С не повертає факт
                </span>
              )}
            </div>
          </div>

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

            const divisionSegments: { name: string; value: number; color: string }[] = [];
            const distributorsPlanSum = filteredDivisions
              .filter(d => d.groupKey === 'distributor-chuguy' || d.groupKey === 'distributor-haylenko')
              .reduce((s, d) => s + d.totalPlan, 0);
            for (const groupKey of GROUP_ORDER) {
              if (groupKey === 'distributor-chuguy' || groupKey === 'distributor-haylenko') continue;
              const divs = filteredDivisions.filter(d => d.groupKey === groupKey);
              const groupPlan = divs.reduce((s, d) => s + d.totalPlan, 0);
              if (groupPlan > 0) {
                divisionSegments.push({
                  name: GROUP_LABEL[groupKey],
                  value: groupPlan,
                  color: mixedPalette[divisionSegments.length % mixedPalette.length],
                });
              }
            }
            if (distributorsPlanSum > 0) {
              divisionSegments.push({
                name: 'Дистрибутори',
                value: distributorsPlanSum,
                color: mixedPalette[divisionSegments.length % mixedPalette.length],
              });
            }
            const divTotalPlan = divisionSegments.reduce((s, x) => s + x.value, 0);

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
                    title="Підрозділи у компанії"
                    subtitle={`Частка кожного у плані (${fmtUSD(divTotalPlan)})`}
                    centerLabel={fmtUSDCompact(divTotalPlan)}
                    centerSub="план"
                    segments={divisionSegments}
                    formatValue={fmtUsdLegend}
                  />
                )}
                {show3 && (
                  <DonutChart
                    title="Бренди у компанії"
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
              <table className="w-full border-separate border-spacing-1 text-[11px]">
                <thead>
                  <tr>
                    <th className="text-left p-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold whitespace-nowrap">Підрозділ</th>
                    {BRAND_CODES.map(code => (
                      <th key={code} className="p-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{BRAND_NAMES[code]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmapRows.map(row => (
                    <tr key={row.key}>
                      <td className="text-left p-2 font-bold text-[12px] whitespace-nowrap">
                        {row.label}
                        <div className="text-[9px] text-muted-foreground font-medium">{row.subLabel}</div>
                      </td>
                      {BRAND_CODES.map(code => {
                        const seg = row.segments[code];
                        if (!seg || (seg.plan === 0 && seg.fact === 0)) {
                          return <td key={code} className={`rounded-lg p-2 text-center ${heatColor(null)}`}><span className="text-[10px] font-medium">—</span></td>;
                        }
                        const hasFact = seg.hasFact || seg.fact > 0;
                        const pct = hasFact && seg.plan > 0 ? (seg.fact / seg.plan) * 100 : null;
                        return (
                          <td key={code} className={`rounded-lg p-2 text-center min-h-[44px] font-mono font-bold ${heatColor(pct)}`}>
                            <div className="text-[11px]">{pct !== null ? fmtPct(pct) : 'н/д'}</div>
                            {hasFact && (
                              <div className="text-[9px] opacity-75 mt-0.5 font-medium">{fmtUSD(seg.fact)}/{fmtUSD(seg.plan)}</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
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
                {groupsForAccordion.map(g => {
                  const isExpanded = expandedKey === g.key;
                  const pct = g.hasFact && g.totalPlan > 0 ? (g.totalFact / g.totalPlan) * 100 : null;
                  return (
                    <div key={g.key} className={`glass-card p-4 transition-all ${isExpanded ? 'ring-1 ring-[#066aab]/30' : ''}`}>
                      <button
                        onClick={() => setExpandedKey(isExpanded ? null : g.key)}
                        className="w-full grid grid-cols-[20px_1fr_120px_140px_80px_60px] gap-3 items-center text-left"
                      >
                        <span className={`text-[12px] text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                        <span className="font-bold text-[14px]">{g.label} {g.isRepresentations && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider bg-[#066aab]/10 text-[#066aab] px-2 py-0.5 rounded-full">{g.children.length} регіонів</span>}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full text-center ${g.hasFact ? 'bg-teal-100/70 text-teal-800' : 'bg-slate-100/70 text-slate-600'}`}>
                          {g.hasFact ? 'З фактом' : 'Без факту'}
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
                        <div className="mt-3 pt-3 border-t border-slate-200/60 space-y-2">
                          {g.children.map(d => {
                            const childPct = d.hasFact && d.totalPlan > 0 ? (d.totalFact / d.totalPlan) * 100 : null;
                            return (
                              <div key={d.divisionName} className="glass-card-soft p-3 grid grid-cols-[1fr_120px_140px_70px] gap-3 items-center">
                                <span className="text-[13px] font-semibold">
                                  {g.isRepresentations ? d.divisionName : d.displayName}
                                </span>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full text-center ${d.hasFact ? 'bg-teal-100/70 text-teal-800' : 'bg-slate-100/70 text-slate-600'}`}>
                                  {d.hasFact ? 'З фактом' : 'Без факту'}
                                </span>
                                <span className="font-mono tabular-nums text-[11px] text-right">
                                  {d.hasFact ? <><strong>{fmtUSD(d.totalFact)}</strong> / </> : '— / '}
                                  <span className="text-muted-foreground">{fmtUSD(d.totalPlan)}</span>
                                </span>
                                <span className={`text-[12px] font-bold tabular-nums text-right ${childPct === null ? 'text-slate-400' : childPct >= 80 ? 'text-teal-700' : childPct >= 40 ? 'text-orange-700' : 'text-rose-700'}`}>
                                  {childPct !== null ? fmtPct(childPct) : 'н/д'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {accordionMode === 'by-brand' && (
              <div className="space-y-2">
                {brandsForAccordion.map(b => {
                  const isExpanded = expandedKey === b.code;
                  const pct = b.totalPlan > 0 ? (b.totalFact / b.totalPlan) * 100 : null;
                  return (
                    <div key={b.code} className={`glass-card p-4 transition-all ${isExpanded ? 'ring-1 ring-[#066aab]/30' : ''}`}>
                      <button
                        onClick={() => setExpandedKey(isExpanded ? null : b.code)}
                        className="w-full grid grid-cols-[20px_1fr_140px_80px_60px] gap-3 items-center text-left"
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
                        <div className="mt-3 pt-3 border-t border-slate-200/60 space-y-2">
                          {b.byGroup.map(g => {
                            const groupPct = g.hasFact && g.plan > 0 ? (g.fact / g.plan) * 100 : null;
                            return (
                              <div key={g.groupKey} className="glass-card-soft p-3 grid grid-cols-[1fr_140px_70px] gap-3 items-center">
                                <span className="text-[13px] font-semibold">{g.label}</span>
                                <span className="font-mono tabular-nums text-[11px] text-right">
                                  {g.hasFact ? <><strong>{fmtUSD(g.fact)}</strong> / </> : '— / '}
                                  <span className="text-muted-foreground">{fmtUSD(g.plan)}</span>
                                </span>
                                <span className={`text-[12px] font-bold tabular-nums text-right ${groupPct === null ? 'text-slate-400' : groupPct >= 80 ? 'text-teal-700' : groupPct >= 40 ? 'text-orange-700' : 'text-rose-700'}`}>
                                  {groupPct !== null ? fmtPct(groupPct) : 'н/д'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
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
