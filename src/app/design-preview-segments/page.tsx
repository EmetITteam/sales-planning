'use client';

/**
 * Тимчасова сторінка для preview варіантів виводу
 * «Розклад продажів по сегментах клієнтів» (Активні / Нові / Активація / Незаплановані)
 * на BrandRow (РМ + Директор) + чорновий Q1 (форма планування).
 *
 * Відкривається на /design-preview-segments. Видалити коли користувач обере фінальний варіант.
 */

import { useState } from 'react';
import {
  ChevronDown, ChevronRight, Users, UserPlus, RefreshCw, Sparkles,
} from 'lucide-react';
import { formatUSD, formatPct, pctOf } from '@/lib/format';

// ─────────────────────────────────────────────────────────────
// MOCK DATA — реалістичні цифри з прикладу Petaran у скріні
// ─────────────────────────────────────────────────────────────
const SEGMENT_META = [
  { key: 'active', label: 'Активні', icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'new', label: 'Нові', icon: UserPlus, color: 'text-[#066aab]', bg: 'bg-blue-50' },
  { key: 'activation', label: 'Активація', icon: RefreshCw, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'unplanned', label: 'Незаплановані', icon: Sparkles, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50' },
] as const;

interface BrandData {
  name: string;
  planAmount: number;
  factAmount: number;
  prevMonthFact: number;
  segments: Record<string, { planned: number; bought: number; planSum: number; factSum: number }>;
}

const BRANDS: BrandData[] = [
  {
    name: 'Petaran',
    planAmount: 64490,
    factAmount: 14734,
    prevMonthFact: 13262,
    segments: {
      active:     { planned: 10, bought: 4, planSum: 8200, factSum: 8200 },
      new:        { planned: 2,  bought: 1, planSum: 1500, factSum: 800 },
      activation: { planned: 5,  bought: 2, planSum: 4790, factSum: 3000 },
      unplanned:  { planned: 0,  bought: 3, planSum: 0,    factSum: 2734 },
    },
  },
  {
    name: 'Neuramis',
    planAmount: 32000,
    factAmount: 8500,
    prevMonthFact: 9100,
    segments: {
      active:     { planned: 8, bought: 3, planSum: 6500, factSum: 4500 },
      new:        { planned: 1, bought: 0, planSum: 1000, factSum: 0 },
      activation: { planned: 3, bought: 2, planSum: 2500, factSum: 1800 },
      unplanned:  { planned: 0, bought: 2, planSum: 0,    factSum: 2200 },
    },
  },
  {
    name: 'Ellanse',
    planAmount: 12000,
    factAmount: 1200,
    prevMonthFact: 800,
    segments: {
      active:     { planned: 4, bought: 1, planSum: 8000, factSum: 600 },
      new:        { planned: 0, bought: 0, planSum: 0,    factSum: 0 },
      activation: { planned: 2, bought: 0, planSum: 1500, factSum: 0 },
      unplanned:  { planned: 0, bought: 1, planSum: 0,    factSum: 600 },
    },
  },
];

// ─────────────────────────────────────────────────────────────
// VARIANT A — Expandable BrandRow (chevron click → block under)
// ─────────────────────────────────────────────────────────────
function VariantA({ brand }: { brand: BrandData }) {
  const [expanded, setExpanded] = useState(false);
  const factPct = pctOf(brand.factAmount, brand.planAmount);

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full p-4 flex items-center gap-4 hover:bg-slate-50/50 transition"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
        <span className="text-[14px] font-bold w-[110px] text-left">{brand.name}</span>
        <span className="text-[11px] text-muted-foreground">Факт</span>
        <span className="text-[20px] font-extrabold tracking-tight">{formatPct(factPct)}</span>
        <div className="flex-1" />
        <div className="text-right">
          <p className="text-[9px] text-muted-foreground uppercase">План</p>
          <p className="text-[12px] font-bold amount">{formatUSD(brand.planAmount)}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-muted-foreground uppercase">Факт</p>
          <p className="text-[12px] font-bold amount">{formatUSD(brand.factAmount)}</p>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground/50 transition-transform ${expanded ? 'rotate-180 text-[#066aab]' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t bg-slate-50/60 p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">
            Розклад по сегментах клієнтів
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {SEGMENT_META.map(meta => {
              const s = brand.segments[meta.key];
              const Icon = meta.icon;
              const isUnplanned = meta.key === 'unplanned';
              return (
                <div key={meta.key} className="bg-white rounded-xl p-3 border border-slate-100">
                  <div className={`flex items-center gap-2 mb-2 ${meta.color}`}>
                    <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[12px] font-semibold">{meta.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">Куп./План</p>
                      <p className="text-[14px] font-bold">
                        {s.bought}{isUnplanned ? '' : `/${s.planned}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">Факт</p>
                      <p className="text-[12px] font-bold amount text-emerald-700">
                        {formatUSD(s.factSum)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VARIANT B — Inline mini-chips на самому BrandRow
// ─────────────────────────────────────────────────────────────
function VariantB({ brand }: { brand: BrandData }) {
  const factPct = pctOf(brand.factAmount, brand.planAmount);
  return (
    <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
      {/* Верхній рядок (як зараз у BrandRow) */}
      <div className="flex items-center gap-4">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
        <span className="text-[14px] font-bold w-[110px]">{brand.name}</span>
        <span className="text-[11px] text-muted-foreground">Факт</span>
        <span className="text-[20px] font-extrabold tracking-tight">{formatPct(factPct)}</span>
        <div className="flex-1" />
        <div className="text-right">
          <p className="text-[9px] text-muted-foreground uppercase">План</p>
          <p className="text-[12px] font-bold amount">{formatUSD(brand.planAmount)}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-muted-foreground uppercase">Факт</p>
          <p className="text-[12px] font-bold amount">{formatUSD(brand.factAmount)}</p>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground/30" />
      </div>

      {/* Нижній рядок — чіпи сегментів */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
        {SEGMENT_META.map(meta => {
          const s = brand.segments[meta.key];
          const Icon = meta.icon;
          const isUnplanned = meta.key === 'unplanned';
          if (isUnplanned && s.bought === 0) return null;
          return (
            <div
              key={meta.key}
              className={`px-3 py-1.5 rounded-xl ${meta.bg} flex items-center gap-2 text-[11px]`}
            >
              <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
              <span className={`font-semibold ${meta.color}`}>{meta.label}</span>
              <span className="text-muted-foreground">
                {s.bought}{isUnplanned ? ' клієнт.' : `/${s.planned}`}
              </span>
              <span className={`font-bold amount ${meta.color}`}>{formatUSD(s.factSum)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VARIANT C — Окрема матриця-таблиця нижче
// ─────────────────────────────────────────────────────────────
function VariantCBrandRow({ brand }: { brand: BrandData }) {
  const factPct = pctOf(brand.factAmount, brand.planAmount);
  return (
    <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] flex items-center gap-4">
      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
      <span className="text-[14px] font-bold w-[110px]">{brand.name}</span>
      <span className="text-[11px] text-muted-foreground">Факт</span>
      <span className="text-[20px] font-extrabold tracking-tight">{formatPct(factPct)}</span>
      <div className="flex-1" />
      <div className="text-right">
        <p className="text-[9px] text-muted-foreground uppercase">План</p>
        <p className="text-[12px] font-bold amount">{formatUSD(brand.planAmount)}</p>
      </div>
      <div className="text-right">
        <p className="text-[9px] text-muted-foreground uppercase">Факт</p>
        <p className="text-[12px] font-bold amount">{formatUSD(brand.factAmount)}</p>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground/30" />
    </div>
  );
}

function VariantCMatrix() {
  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      <div className="p-4 border-b">
        <h3 className="text-[15px] font-bold">Розклад продажів по сегментах клієнтів × ТМ</h3>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          Кількість «купили / запланували» · сума факту USD
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3 font-semibold">ТМ</th>
              {SEGMENT_META.map(meta => {
                const Icon = meta.icon;
                return (
                  <th key={meta.key} className="text-right p-3 font-semibold">
                    <div className={`flex items-center justify-end gap-1.5 ${meta.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {meta.label}
                    </div>
                  </th>
                );
              })}
              <th className="text-right p-3 font-semibold bg-slate-100">Всього факт</th>
            </tr>
          </thead>
          <tbody>
            {BRANDS.map(b => (
              <tr key={b.name} className="border-t hover:bg-slate-50/50">
                <td className="p-3 font-bold">{b.name}</td>
                {SEGMENT_META.map(meta => {
                  const s = b.segments[meta.key];
                  const isUnplanned = meta.key === 'unplanned';
                  return (
                    <td key={meta.key} className="p-3 text-right">
                      <p className="text-[10px] text-muted-foreground">
                        {s.bought}{isUnplanned ? '' : ` / ${s.planned}`}
                      </p>
                      <p className={`font-bold amount ${s.factSum > 0 ? 'text-emerald-700' : 'text-muted-foreground/40'}`}>
                        {formatUSD(s.factSum)}
                      </p>
                    </td>
                  );
                })}
                <td className="p-3 text-right font-bold amount bg-slate-50">
                  {formatUSD(b.factAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Q1 — Чорновий вигляд НОВОЇ таблиці у формі планування
// (Активні / Нові / Активація + Незаплановані; додаємо колонки замість заміни)
// ─────────────────────────────────────────────────────────────
function Q1NewPlanningTable() {
  const brand = BRANDS[0];
  const totals = SEGMENT_META.reduce(
    (acc, m) => {
      const s = brand.segments[m.key];
      acc.planned += s.planned;
      acc.bought += s.bought;
      acc.planSum += s.planSum;
      acc.factSum += s.factSum;
      return acc;
    },
    { planned: 0, bought: 0, planSum: 0, factSum: 0 },
  );

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
      <div className="p-4 border-b">
        <h3 className="text-[15px] font-bold">Дані по клієнтах по ТМ — нова версія (Petaran, квітень)</h3>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          Додано: «купили» (факт кількості), «факт сума», «факт.закр.%», новий рядок «Незаплановані»
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-slate-50 text-muted-foreground">
            <tr>
              <th className="text-left p-3 font-semibold">Сегмент</th>
              <th className="text-right p-3 font-semibold">Купили / План</th>
              <th className="text-right p-3 font-semibold">Очікувана сума</th>
              <th className="text-right p-3 font-semibold">Факт</th>
              <th className="text-right p-3 font-semibold">План.закр.%</th>
              <th className="text-right p-3 font-semibold">Факт.закр.%</th>
            </tr>
          </thead>
          <tbody>
            {SEGMENT_META.map(meta => {
              const s = brand.segments[meta.key];
              const Icon = meta.icon;
              const isUnplanned = meta.key === 'unplanned';
              const planClose = brand.planAmount > 0 ? (s.planSum / brand.planAmount) * 100 : 0;
              const factClose = brand.planAmount > 0 ? (s.factSum / brand.planAmount) * 100 : 0;
              return (
                <tr key={meta.key} className="border-t">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center`}>
                        <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                      </div>
                      <span className="font-semibold">{meta.label}</span>
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <span className="font-semibold">{s.bought}</span>
                    <span className="text-muted-foreground"> / {isUnplanned ? '—' : s.planned}</span>
                  </td>
                  <td className="p-3 text-right amount">
                    {isUnplanned ? <span className="text-muted-foreground/40">—</span> : formatUSD(s.planSum)}
                  </td>
                  <td className={`p-3 text-right font-bold amount ${s.factSum > 0 ? 'text-emerald-700' : 'text-muted-foreground/40'}`}>
                    {formatUSD(s.factSum)}
                  </td>
                  <td className="p-3 text-right text-[#066aab] font-semibold">
                    {isUnplanned ? <span className="text-muted-foreground/40">—</span> : formatPct(planClose)}
                  </td>
                  <td className="p-3 text-right text-emerald-700 font-semibold">
                    {formatPct(factClose)}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-slate-200 bg-slate-50/60 font-bold">
              <td className="p-3">Всього</td>
              <td className="p-3 text-right">
                <span>{totals.bought}</span>
                <span className="text-muted-foreground"> / {totals.planned}</span>
              </td>
              <td className="p-3 text-right amount">{formatUSD(totals.planSum)}</td>
              <td className="p-3 text-right amount text-emerald-700">{formatUSD(totals.factSum)}</td>
              <td className="p-3 text-right text-[#066aab]">{formatPct((totals.planSum / brand.planAmount) * 100)}</td>
              <td className="p-3 text-right text-emerald-700">{formatPct((totals.factSum / brand.planAmount) * 100)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────
export default function DesignPreviewSegmentsPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-12">
        <header>
          <h1 className="text-2xl font-extrabold">Preview — сегменти клієнтів на дашборді РМ/Директора + нова таблиця у формі</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Тимчасова сторінка для вибору варіанту візуалізації. Оберіть один варіант (А / Б / В) для дашборда + підтвердіть Q1.
          </p>
        </header>

        {/* Q1 — нова таблиця у формі планування */}
        <section>
          <h2 className="text-lg font-bold mb-3">
            Q1 · Нова таблиця у формі планування (приклад — Petaran)
          </h2>
          <Q1NewPlanningTable />
        </section>

        {/* Q2 — три варіанти BrandRow на дашборді */}
        <section>
          <h2 className="text-lg font-bold mb-1">Q2 · Дашборд РМ/Директора — три варіанти</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Один і той самий бренд показано трьома способами. Дані: 4 сегменти (3 запланованих + «Незаплановані» — клієнти яким продали без плану).
          </p>

          {/* Variant A */}
          <div className="mb-10">
            <h3 className="text-base font-bold text-[#066aab] mb-3">
              Варіант А — Розгортається при кліку (експанд інлайн)
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              ↓ Натисни на стрілку щоб побачити розклад. Компактно, але потрібен клік.
            </p>
            <div className="space-y-2">
              {BRANDS.map(b => <VariantA key={b.name} brand={b} />)}
            </div>
          </div>

          {/* Variant B */}
          <div className="mb-10">
            <h3 className="text-base font-bold text-[#066aab] mb-3">
              Варіант Б — Чіпи знизу прямо в рядку (завжди видно)
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Все відразу видно, але рядок стає вищим. Незаплановані ховаються якщо їх 0.
            </p>
            <div className="space-y-2">
              {BRANDS.map(b => <VariantB key={b.name} brand={b} />)}
            </div>
          </div>

          {/* Variant C */}
          <div className="mb-10">
            <h3 className="text-base font-bold text-[#066aab] mb-3">
              Варіант В — Окрема матриця-таблиця знизу дашборда
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              BrandRows лишаються компактні, нижче — велика таблиця з усіма брендами в розрізі сегментів.
            </p>
            <div className="space-y-2 mb-4">
              {BRANDS.map(b => <VariantCBrandRow key={b.name} brand={b} />)}
            </div>
            <VariantCMatrix />
          </div>
        </section>

        <footer className="text-xs text-muted-foreground border-t pt-4">
          Тимчасова сторінка. Видалити після вибору фінального варіанту.
        </footer>
      </div>
    </div>
  );
}
