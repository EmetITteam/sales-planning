'use client';

import { useState } from 'react';
import { formatUSD, formatPct, formatDateShort, getTrafficLight, pctOf, calcForecastPercent } from '@/lib/format';
import { getMonthProgressPct, getWorkingDaysInMonth, getPassedWorkingDays } from '@/lib/working-days';
import { getMonthName } from '@/lib/periods';
import { MOCK_ALL_REGIONS, SEGMENTS, getFactScaleRatio, getMockClientStatsCompany } from '@/lib/mock-data';
import { useAppStore } from '@/lib/store';
import { RMDashboard } from './rm-dashboard';
import { BrandRow } from './brand-row';
import { MetricCard } from './metric-card';
import { ClientStatsCard } from './client-stats-card';
import { Target, DollarSign, TrendingUp, TrendingDown, MapPin, ChevronRight, ChevronDown } from 'lucide-react';

type DirView = 'dashboard' | 'region';

export function DirectorDashboard() {
  const [view, setView] = useState<DirView>('dashboard');
  const [selectedRegion, setSelectedRegion] = useState('');
  const { currentPeriod, liveMode } = useAppStore();
  const asOfDate = liveMode ? new Date() : new Date(currentPeriod.weekEnd);
  const asOfLabel = liveMode ? 'сьогодні' : formatDateShort(currentPeriod.weekEnd);
  const factScale = getFactScaleRatio(asOfDate);

  const regions = MOCK_ALL_REGIONS;

  const calcPct = getMonthProgressPct(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate);

  const regionSummaries = regions.map(region => {
    let totalPlan = 0, totalFact = 0, totalPrevFact = 0, totalPrevPlan = 0;
    const segTotals: Record<string, { plan: number; fact: number; prevFact: number; prevPlan: number }> = {};
    SEGMENTS.forEach(seg => { segTotals[seg.code] = { plan: 0, fact: 0, prevFact: 0, prevPlan: 0 }; });
    // Короткий зріз по кожному менеджеру — для відображення у згорнутому регіоні
    const managersBrief = region.managers.map(m => {
      let mPlan = 0, mFact = 0;
      m.segments.forEach(s => {
        const factAmount = Math.round(s.factAmount * factScale);
        const prevMonthFactAmount = Math.round((s.prevMonthFactAmount ?? 0) * factScale);
        totalPlan += s.planAmount;
        totalFact += factAmount;
        totalPrevFact += prevMonthFactAmount;
        totalPrevPlan += s.prevMonthPlanAmount ?? 0;
        if (segTotals[s.segmentCode]) {
          segTotals[s.segmentCode].plan += s.planAmount;
          segTotals[s.segmentCode].fact += factAmount;
          segTotals[s.segmentCode].prevFact += prevMonthFactAmount;
          segTotals[s.segmentCode].prevPlan += s.prevMonthPlanAmount ?? 0;
        }
        mPlan += s.planAmount;
        mFact += factAmount;
      });
      const mPct = pctOf(mFact, mPlan);
      const mDev = mPct - calcPct;
      return { name: m.name, login: m.login, pct: mPct, dev: mDev, onPlan: mPct >= calcPct };
    });
    return {
      ...region, totalPlan, totalFact,
      totalPrevFact, totalPrevPlan,
      pct: pctOf(totalFact, totalPlan),
      prevPct: pctOf(totalPrevFact, totalPrevPlan),
      segTotals,
      managersBrief,
    };
  });

  const grandPlan = regionSummaries.reduce((s, r) => s + r.totalPlan, 0);
  const grandFact = regionSummaries.reduce((s, r) => s + r.totalFact, 0);
  const grandPct = pctOf(grandFact, grandPlan);
  const grandPrevFact = regionSummaries.reduce((s, r) => s + r.totalPrevFact, 0);
  const grandPrevPlan = regionSummaries.reduce((s, r) => s + r.totalPrevPlan, 0);
  const grandPrevPct = pctOf(grandPrevFact, grandPrevPlan);
  // Прогноз (run-rate) і Очікуваний (mock = факт + 60% розриву)
  const totalWD = getWorkingDaysInMonth(asOfDate.getFullYear(), asOfDate.getMonth());
  const passedWD = getPassedWorkingDays(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate);
  const grandForecastPct = calcForecastPercent(grandFact, grandPlan, passedWD, totalWD);
  const grandExpectedPct = pctOf(grandFact + 0.6 * Math.max(0, grandPlan - grandFact), grandPlan);
  const totalManagers = regions.reduce((s, r) => s + r.managers.length, 0);

  // Drill-down в регіон — показуємо дашборд РМ
  if (view === 'region') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('dashboard')} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ChevronRight className="h-4 w-4 rotate-180" /> Всі регіони
        </button>
        <RMDashboard regionCode={selectedRegion} />
      </div>
    );
  }

  // Розбивка кожного бренду по регіонах — для другого блоку у директора
  const brandsByRegion = SEGMENTS.map(seg => {
    const perRegion = regionSummaries.map(r => ({
      regionCode: r.regionCode,
      regionName: r.regionName,
      plan: r.segTotals[seg.code]?.plan ?? 0,
      fact: r.segTotals[seg.code]?.fact ?? 0,
      prevFact: r.segTotals[seg.code]?.prevFact ?? 0,
      prevPlan: r.segTotals[seg.code]?.prevPlan ?? 0,
    }));
    const totalPlan = perRegion.reduce((s, x) => s + x.plan, 0);
    const totalFact = perRegion.reduce((s, x) => s + x.fact, 0);
    const totalPrevFact = perRegion.reduce((s, x) => s + x.prevFact, 0);
    const totalPrevPlan = perRegion.reduce((s, x) => s + x.prevPlan, 0);
    return {
      code: seg.code, name: seg.name,
      totalPlan, totalFact, totalPrevFact, totalPrevPlan,
      regions: perRegion,
    };
  });

  const segGrandTotals = SEGMENTS.map(seg => {
    let plan = 0, fact = 0, prevFact = 0, prevPlan = 0;
    regionSummaries.forEach(r => {
      plan += r.segTotals[seg.code]?.plan ?? 0;
      fact += r.segTotals[seg.code]?.fact ?? 0;
      prevFact += r.segTotals[seg.code]?.prevFact ?? 0;
      prevPlan += r.segTotals[seg.code]?.prevPlan ?? 0;
    });
    const pct = pctOf(fact, plan);
    return {
      code: seg.code, name: seg.name,
      plan, fact, pct,
      prevFact, prevPlan,
      deviation: pct - calcPct,
    };
  });

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-bold">Зведена по компанії</h2>

      {/* Metrics — компактний watermark layout: 5 карток в ряд */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard
          iconSize="md"
          icon={<Target />}
          iconColor="text-[#066aab]"
          label="Загальний план"
          value={formatUSD(grandPlan)}
          isAmount
          caption={<span className="text-muted-foreground">{getMonthName(asOfDate.getFullYear(), asOfDate.getMonth())} · {totalWD} робочих дні</span>}
        />
        <MetricCard
          iconSize="md"
          icon={<DollarSign />}
          iconColor="text-emerald-500"
          label="Факт"
          value={formatUSD(grandFact)}
          isAmount
          caption={grandPrevFact > 0 && (() => {
            const dyn = grandFact - grandPrevFact;
            const dynPct = grandPct - grandPrevPct;
            const better = dyn >= 0;
            const Arrow = better ? TrendingUp : TrendingDown;
            return (
              <span className={`font-semibold ${better ? 'text-emerald-600' : 'text-rose-600'}`}>
                <Arrow className="inline h-3 w-3 -mt-0.5 mr-0.5" />
                vs мин. міс.: <span className="amount whitespace-nowrap">{better ? '+' : ''}{formatUSD(dyn)}</span>
                <span className="whitespace-nowrap"> ({better ? '+' : ''}{dynPct.toFixed(1)}%)</span>
              </span>
            );
          })()}
        />
        <MetricCard
          iconSize="md"
          icon={grandPct >= calcPct ? <TrendingUp /> : <TrendingDown />}
          iconColor={grandPct >= calcPct ? 'text-emerald-500' : 'text-rose-500'}
          label="Виконання"
          value={(
            <span className="flex items-baseline gap-2">
              <span>{grandPct.toFixed(1)}%</span>
              <span className={`text-[12px] font-bold ${grandPct >= calcPct ? 'text-emerald-600' : 'text-rose-600'}`}>
                {grandPct - calcPct >= 0 ? '+' : ''}{(grandPct - calcPct).toFixed(1)}%
              </span>
            </span>
          )}
          caption={(
            <div className="space-y-0.5 leading-snug">
              <p className="text-muted-foreground">Норма на {asOfLabel}: <span className="font-semibold text-foreground">{formatPct(calcPct)}</span></p>
              <p className="text-muted-foreground">Прогноз: <span className="font-semibold text-amber-600">{formatPct(grandForecastPct)}</span> · Очік.: <span className="font-semibold text-[#066aab]">{formatPct(grandExpectedPct)}</span></p>
            </div>
          )}
        />
        <MetricCard
          iconSize="md"
          icon={<MapPin />}
          iconColor="text-amber-500"
          label="Структура"
          value={(
            <div className="space-y-1">
              <p className="leading-none">
                <span className="tabular-nums">{regions.length}</span>
                <span className="text-[12px] text-muted-foreground font-medium ml-1.5">регіонів</span>
              </p>
              <p className="leading-none">
                <span className="tabular-nums">{totalManagers}</span>
                <span className="text-[12px] text-muted-foreground font-medium ml-1.5">менеджерів</span>
              </p>
            </div>
          )}
        />
        <ClientStatsCard stats={getMockClientStatsCompany()} />
      </div>

      {/* Region cards — accordion (тап = розгорнути), drill-down через окрему іконку */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Регіони</h3>
        <div className="space-y-3">
          {regionSummaries.map(region => {
            const allSegs = SEGMENTS.map(seg => ({
              ...seg,
              fact: region.segTotals[seg.code]?.fact ?? 0,
              plan: region.segTotals[seg.code]?.plan ?? 0,
              prevFact: region.segTotals[seg.code]?.prevFact ?? 0,
              prevPlan: region.segTotals[seg.code]?.prevPlan ?? 0,
            }));

            return (
              <RegionAccordion
                key={region.regionCode}
                region={region}
                allSegs={allSegs}
                calcPct={calcPct}
                asOfDate={asOfDate}
                onDrillDown={() => { setSelectedRegion(region.regionCode); setView('region'); }}
              />
            );
          })}
        </div>
      </div>

      {/* По брендах з розбивкою по регіонах — згруповані аккордеони */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">По брендах — з розбивкою по регіонах</h3>
        <div className="space-y-3">
          {brandsByRegion.map(brand => (
            <BrandRegionGroup
              key={brand.code}
              brand={brand}
              calcPct={calcPct}
              asOfDate={asOfDate}
              onRegionClick={(regionCode) => { setSelectedRegion(regionCode); setView('region'); }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface BrandRegionGroupProps {
  brand: {
    code: string;
    name: string;
    totalPlan: number;
    totalFact: number;
    totalPrevFact: number;
    totalPrevPlan: number;
    regions: Array<{
      regionCode: string;
      regionName: string;
      plan: number;
      fact: number;
      prevFact: number;
      prevPlan: number;
    }>;
  };
  calcPct: number;
  asOfDate: Date;
  onRegionClick: (regionCode: string) => void;
}

function BrandRegionGroup({ brand, calcPct, asOfDate, onRegionClick }: BrandRegionGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const totalPrevPct = pctOf(brand.totalPrevFact, brand.totalPrevPlan);

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      {/* Заголовок-сводка по бренду — реюзаем BrandRow */}
      <BrandRow
        segmentName={brand.name}
        planAmount={brand.totalPlan}
        factAmount={brand.totalFact}
        calcPct={calcPct}
        asOfDate={asOfDate}
        prevMonthFactAmount={brand.totalPrevFact}
        prevMonthFactPercent={totalPrevPct}
        onClick={() => setExpanded(!expanded)}
        expandable
        expanded={expanded}
      />
      {/* Розгорнутий список регіонів */}
      {expanded && (
        <div className="px-3 md:px-5 py-3 space-y-1.5 bg-[#fafbfe] border-t border-[#f0f2f8]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 ml-1">
            <ChevronDown className="inline h-3 w-3 mr-1" />Регіони
          </p>
          {brand.regions.map(r => {
            const rPrevPct = pctOf(r.prevFact, r.prevPlan);
            return (
              <BrandRow
                key={r.regionCode}
                segmentName={r.regionName}
                planAmount={r.plan}
                factAmount={r.fact}
                calcPct={calcPct}
                asOfDate={asOfDate}
                prevMonthFactAmount={r.prevFact}
                prevMonthFactPercent={rPrevPct}
                onClick={() => onRegionClick(r.regionCode)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface RegionAccordionProps {
  region: {
    regionCode: string;
    regionName: string;
    managers: Array<unknown>;
    totalPlan: number;
    totalFact: number;
    totalPrevFact: number;
    totalPrevPlan: number;
    pct: number;
    prevPct: number;
    managersBrief: Array<{ name: string; login: string; pct: number; dev: number; onPlan: boolean }>;
  };
  allSegs: Array<{
    code: string;
    name: string;
    plan: number;
    fact: number;
    prevFact: number;
    prevPlan: number;
  }>;
  calcPct: number;
  asOfDate: Date;
  onDrillDown: () => void;
}

/** Прізвище І. — наприклад "Сірик Наталія" → "Сірик Н." */
function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0]} ${parts[1].charAt(0)}.`;
}

function RegionAccordion({ region, allSegs, calcPct, asOfDate, onDrillDown }: RegionAccordionProps) {
  const [expanded, setExpanded] = useState(false);
  const tl = getTrafficLight(region.pct, calcPct);
  const regionDeviation = region.pct - calcPct;
  const dynAmount = region.totalFact - region.totalPrevFact;
  const dynPct = region.pct - region.prevPct;
  const dynBetter = dynAmount >= 0;

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      {/* === DESKTOP (md+): один рядок === */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="hidden md:flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#fafbfe] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-[#e8f4fc] flex items-center justify-center shrink-0">
            <MapPin className="h-5 w-5 text-[#066aab]" />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold truncate">{region.regionName}</p>
            <p className="text-[11px] text-muted-foreground">{region.managers.length} менеджерів</p>
          </div>
        </div>

        {/* Мини-список менеджерів — 2 колонки (для регіонів з 5-6 менеджерами) */}
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-4 gap-y-1 px-2">
          {region.managersBrief.map(m => (
            <span
              key={m.login}
              className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap"
              title={`${m.name}: ${m.pct.toFixed(1)}% (${m.dev >= 0 ? '+' : ''}${m.dev.toFixed(1)}% vs норма)`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${m.onPlan ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span className="font-semibold text-foreground/80 truncate">{shortName(m.name)}</span>
              <span className={`font-bold ml-auto ${m.onPlan ? 'text-emerald-600' : 'text-rose-600'}`}>
                {m.pct.toFixed(0)}%
              </span>
              <span className={`text-[10px] shrink-0 ${m.dev >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                ({m.dev >= 0 ? '+' : ''}{m.dev.toFixed(1)}%)
              </span>
            </span>
          ))}
        </div>

        {/* Всі блоки align-top: label завжди на 1-му рядку, value на 2-му, sub на 3-му.
            Висота 56px фіксована, items-start. 1-рядкові елементи (бейдж/chevron/drill)
            вирівняні до value-рядка через pt-[18px] (label-висота + gap). */}
        <div className="flex items-start gap-4 justify-end shrink-0 min-h-[56px]">
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none h-[12px]">Факт / План</p>
            <p className="text-[14px] font-bold font-mono leading-none mt-1.5">
              <span className="amount">{formatUSD(region.totalFact)}</span>
              <span className="text-muted-foreground/50 font-normal"> / </span>
              <span className="amount text-muted-foreground/70">{formatUSD(region.totalPlan)}</span>
            </p>
          </div>
          {region.totalPrevFact > 0 && (
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none h-[12px]">vs мин. міс.</p>
              <p className={`text-[12px] font-bold leading-none mt-1.5 ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                {dynBetter ? <TrendingUp className="inline h-3 w-3 -mt-0.5 mr-0.5" /> : <TrendingDown className="inline h-3 w-3 -mt-0.5 mr-0.5" />}
                <span className="amount whitespace-nowrap">{dynBetter ? '+' : ''}{formatUSD(dynAmount)}</span>
              </p>
              <p className={`text-[10px] font-semibold leading-none mt-1 ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                {dynBetter ? '+' : ''}{dynPct.toFixed(1)}%
              </p>
            </div>
          )}
          <div className="flex flex-col items-center gap-1">
            <div className="w-14 h-2 rounded-full bg-[#f0f2f8] overflow-hidden">
              <div className={`h-full rounded-full ${region.pct >= calcPct ? 'bg-gradient-to-r from-[#066aab] to-[#0880cc]' : 'bg-gradient-to-r from-rose-400 to-rose-500'}`}
                style={{ width: `${Math.min(region.pct, 100)}%` }} />
            </div>
            <span className={`text-[11px] font-bold leading-none ${tl.color}`}>{region.pct.toFixed(1)}%</span>
            <span className={`text-[10px] font-bold leading-none ${regionDeviation >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {regionDeviation >= 0 ? '+' : ''}{regionDeviation.toFixed(1)}%
            </span>
          </div>
          {/* 1-рядкові елементи з порожнім label-placeholder вгорі для вирівнювання */}
          <div>
            <div className="h-[12px] leading-none mb-1.5" aria-hidden />
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${tl.bg} ${tl.color}`}>{tl.label}</span>
          </div>
          <div>
            <div className="h-[12px] leading-none mb-1.5" aria-hidden />
            <ChevronDown className={`h-4 w-4 text-muted-foreground/40 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDrillDown(); }}
            title="Перейти у дашборд регіону (планування менеджерів)"
            className="mt-[16px] p-1.5 rounded-lg hover:bg-[#e8f4fc] text-muted-foreground/40 hover:text-[#066aab] transition-colors cursor-pointer shrink-0"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* === MOBILE (<md): stacked === */}
      <div className="md:hidden">
        <div
          onClick={() => setExpanded(!expanded)}
          className="flex items-start gap-2.5 px-3 py-3 cursor-pointer active:bg-[#f4f7fb]"
        >
          <div className="w-9 h-9 rounded-xl bg-[#e8f4fc] flex items-center justify-center shrink-0 mt-0.5">
            <MapPin className="h-4.5 w-4.5 text-[#066aab]" />
          </div>
          <div className="flex-1 min-w-0">
            {/* Рядок 1: назва + бейдж + chevron + drill-down */}
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[14px] font-bold truncate flex-1">{region.regionName}</p>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase whitespace-nowrap ${tl.bg} ${tl.color}`}>{tl.label}</span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground/40 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              <button
                onClick={(e) => { e.stopPropagation(); onDrillDown(); }}
                className="p-1 rounded-lg text-muted-foreground/40 hover:text-[#066aab] hover:bg-[#e8f4fc] transition-colors cursor-pointer shrink-0"
                title="Дашборд регіону"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {/* Рядок 2: менеджерів + % + відхилення */}
            <div className="flex items-center gap-2 mb-1.5 text-[11px] text-muted-foreground">
              <span>{region.managers.length} менеджерів</span>
              <span className="text-muted-foreground/40">·</span>
              <span className={`font-bold ${tl.color}`}>{region.pct.toFixed(1)}%</span>
              <span className={`font-bold ${regionDeviation >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {regionDeviation >= 0 ? '+' : ''}{regionDeviation.toFixed(1)}%
              </span>
            </div>
            {/* Прогрес-бар */}
            <div className="w-full h-1.5 rounded-full bg-[#f0f2f8] overflow-hidden mb-2">
              <div className={`h-full rounded-full ${region.pct >= calcPct ? 'bg-gradient-to-r from-[#066aab] to-[#0880cc]' : 'bg-gradient-to-r from-rose-400 to-rose-500'}`}
                style={{ width: `${Math.min(region.pct, 100)}%` }} />
            </div>
            {/* Рядок 3: суми */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">
                Факт <span className="font-bold text-foreground amount">{formatUSD(region.totalFact)}</span>
                <span className="text-muted-foreground/50"> / </span>
                <span className="amount text-muted-foreground/70">{formatUSD(region.totalPlan)}</span>
              </span>
              {region.totalPrevFact > 0 && (
                <span className={`flex items-center gap-0.5 font-semibold ${dynBetter ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {dynBetter ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span className="amount">{dynBetter ? '+' : ''}{formatUSD(dynAmount)}</span>
                  <span>({dynBetter ? '+' : ''}{dynPct.toFixed(1)}%)</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Розгорнутий список брендів */}
      {expanded && (
        <div className="px-3 md:px-5 pb-4 space-y-1.5 bg-[#fafbfe] border-t border-[#f0f2f8]">
          {allSegs.map(seg => (
            <BrandRow
              key={seg.code}
              segmentName={seg.name}
              planAmount={seg.plan}
              factAmount={seg.fact}
              calcPct={calcPct}
              asOfDate={asOfDate}
              prevMonthFactAmount={seg.prevFact}
              prevMonthFactPercent={pctOf(seg.prevFact, seg.prevPlan)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
