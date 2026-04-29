'use client';

import type { ReactNode } from 'react';
import { Target, DollarSign, TrendingUp, TrendingDown, MapPin, Users } from 'lucide-react';
import { formatUSD, formatPct } from '@/lib/format';

const PLAN = 91249;
const FACT = 14724;
const PCT = 16.1;
const NORM = 81.8;
const FORECAST = 19.7;
const EXPECTED = 66.5;
const PREV_DELTA = 315;
const PREV_DELTA_PCT = -0.2;
const REGIONS = 7;
const MANAGERS = 10;

export default function DesignPreviewPage() {
  return (
    <div className="min-h-screen bg-[#f4f7fb] p-8 space-y-12">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-extrabold mb-2">Дизайн-прев'ю топ-карток</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Скрол вниз — варіанти 1-6. Усі з однаковими mock-даними. Скажи який подобається (або комбінацію — наприклад «3 + caption з варіанта 4»).
        </p>

        <Variant
          n={1}
          title="Поточний — items-start, min-h-[88px]"
          desc="Контент прибитий до верху, низ карточки порожній. Іконка біля заголовка."
        >
          <V1 />
        </Variant>

        <Variant
          n={2}
          title="Items-center"
          desc="Контент і іконка центруються по вертикалі в min-h. Менше пустоти візуально, але іконка «плаває» в карточках з великим caption."
        >
          <V2 />
        </Variant>

        <Variant
          n={3}
          title="Auto-height (без min-h)"
          desc="Кожна картка свого розміру. Без пустоти, але топбар нерівний — згадай як було до рефакторингу."
        >
          <V3 />
        </Variant>

        <Variant
          n={4}
          title="Контент-fallback caption (мій улюблений)"
          desc="Усі картки мають caption — або реальний (vs мин.міс., норма), або контекстний (період, «у регіоні», структура). Усі однієї висоти, нічого не пусто."
        >
          <V4 />
        </Variant>

        <Variant
          n={5}
          title="Watermark-іконка"
          desc="Велика приглушена іконка в куті як декор. Текст компактно зліва. Стильно, але не всім подобається."
        >
          <V5 />
        </Variant>

        <Variant
          n={6}
          title="Stripe-style: іконка дрібна, акцент на цифрі"
          desc="Іконка маленька в куті, value величезний по центру, label дрібно зверху. Як у Stripe Dashboard."
        >
          <V6 />
        </Variant>

        <Variant
          n={7}
          title="Гібрид 4+5: контент-caption + watermark"
          desc="Велика приглушена іконка-декор у куті + повний caption на кожній картці. Найгустіший варіант — нічого не пусто, плюс декор."
        >
          <V7 />
        </Variant>

        <Variant
          n={8}
          title="Color-band: верхня кольорова смужка замість іконки"
          desc="Тонка горизонтальна смужка градієнтом зверху картки. Іконка маленька біля заголовка. Чистіше, менше «мультику»."
        >
          <V8 />
        </Variant>

        <Variant
          n={9}
          title="Big-number: гігантська цифра + caption знизу"
          desc="Layout як у фінансових дашбордах (Mercury/Linear): label дрібно, цифра 32px, caption знизу з border-top. Іконка крихітна біля заголовка."
        >
          <V9 />
        </Variant>
      </div>
    </div>
  );
}

function Variant({ n, title, desc, children }: { n: number; title: string; desc: string; children: ReactNode }) {
  return (
    <section className="mb-12">
      <div className="mb-4">
        <h2 className="text-lg font-bold">Варіант {n}: {title}</h2>
        <p className="text-[13px] text-muted-foreground mt-1">{desc}</p>
      </div>
      {children}
    </section>
  );
}

// === Варіант 1: items-start (поточний) ===
function V1() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3 min-h-[88px]">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white flex items-center justify-center shrink-0"><Target className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">План місяця</p><p className="text-[22px] font-extrabold mt-1.5">{formatUSD(PLAN)}</p></div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3 min-h-[88px]">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0"><DollarSign className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Факт</p><p className="text-[22px] font-extrabold mt-1.5">{formatUSD(FACT)}</p><p className="text-[11px] mt-1.5 text-emerald-600 font-semibold"><TrendingUp className="inline h-3 w-3 -mt-0.5 mr-0.5" />vs мин. міс.: +${PREV_DELTA} ({PREV_DELTA_PCT.toFixed(1)}%)</p></div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3 min-h-[88px]">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 text-white flex items-center justify-center shrink-0"><TrendingDown className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Виконання</p><p className="text-[22px] font-extrabold mt-1.5">{formatPct(PCT)} <span className="text-[12px] text-rose-600">-{(NORM-PCT).toFixed(1)}%</span></p><p className="text-[11px] mt-1.5 text-muted-foreground">Норма: <span className="font-semibold text-foreground">{formatPct(NORM)}</span></p><p className="text-[11px] text-muted-foreground">Прогноз: <span className="font-semibold text-amber-600">{formatPct(FORECAST)}</span> · Очік.: <span className="font-semibold text-[#066aab]">{formatPct(EXPECTED)}</span></p></div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3 min-h-[88px]">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shrink-0"><Users className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Менеджерів</p><p className="text-[22px] font-extrabold mt-1.5">{MANAGERS}</p></div>
      </div>
    </div>
  );
}

// === Варіант 2: items-center ===
function V2() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 min-h-[88px]">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white flex items-center justify-center shrink-0"><Target className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">План місяця</p><p className="text-[22px] font-extrabold mt-1.5">{formatUSD(PLAN)}</p></div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 min-h-[88px]">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0"><DollarSign className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Факт</p><p className="text-[22px] font-extrabold mt-1.5">{formatUSD(FACT)}</p><p className="text-[11px] mt-1.5 text-emerald-600 font-semibold"><TrendingUp className="inline h-3 w-3 -mt-0.5 mr-0.5" />vs мин. міс.: +${PREV_DELTA} ({PREV_DELTA_PCT.toFixed(1)}%)</p></div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 min-h-[88px]">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 text-white flex items-center justify-center shrink-0"><TrendingDown className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Виконання</p><p className="text-[22px] font-extrabold mt-1.5">{formatPct(PCT)} <span className="text-[12px] text-rose-600">-{(NORM-PCT).toFixed(1)}%</span></p><p className="text-[11px] mt-1.5 text-muted-foreground">Норма: <span className="font-semibold text-foreground">{formatPct(NORM)}</span></p><p className="text-[11px] text-muted-foreground">Прогноз: <span className="font-semibold text-amber-600">{formatPct(FORECAST)}</span> · Очік.: <span className="font-semibold text-[#066aab]">{formatPct(EXPECTED)}</span></p></div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 min-h-[88px]">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shrink-0"><Users className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Менеджерів</p><p className="text-[22px] font-extrabold mt-1.5">{MANAGERS}</p></div>
      </div>
    </div>
  );
}

// === Варіант 3: Auto-height ===
function V3() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-start">
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white flex items-center justify-center shrink-0"><Target className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">План місяця</p><p className="text-[22px] font-extrabold mt-1.5">{formatUSD(PLAN)}</p></div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0"><DollarSign className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Факт</p><p className="text-[22px] font-extrabold mt-1.5">{formatUSD(FACT)}</p><p className="text-[11px] mt-1.5 text-emerald-600 font-semibold"><TrendingUp className="inline h-3 w-3 -mt-0.5 mr-0.5" />vs мин. міс.: +${PREV_DELTA} ({PREV_DELTA_PCT.toFixed(1)}%)</p></div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 text-white flex items-center justify-center shrink-0"><TrendingDown className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Виконання</p><p className="text-[22px] font-extrabold mt-1.5">{formatPct(PCT)} <span className="text-[12px] text-rose-600">-{(NORM-PCT).toFixed(1)}%</span></p><p className="text-[11px] mt-1.5 text-muted-foreground">Норма: <span className="font-semibold text-foreground">{formatPct(NORM)}</span></p><p className="text-[11px] text-muted-foreground">Прогноз: <span className="font-semibold text-amber-600">{formatPct(FORECAST)}</span> · Очік.: <span className="font-semibold text-[#066aab]">{formatPct(EXPECTED)}</span></p></div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shrink-0"><Users className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Менеджерів</p><p className="text-[22px] font-extrabold mt-1.5">{MANAGERS}</p></div>
      </div>
    </div>
  );
}

// === Варіант 4: Контент-fallback caption ===
function V4() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3 min-h-[100px]">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white flex items-center justify-center shrink-0"><Target className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">План місяця</p><p className="text-[22px] font-extrabold mt-1.5">{formatUSD(PLAN)}</p><p className="text-[11px] mt-1.5 text-muted-foreground">Квітень 2026 · 22 робочих дні</p></div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3 min-h-[100px]">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0"><DollarSign className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Факт</p><p className="text-[22px] font-extrabold mt-1.5">{formatUSD(FACT)}</p><p className="text-[11px] mt-1.5 text-emerald-600 font-semibold"><TrendingUp className="inline h-3 w-3 -mt-0.5 mr-0.5" />vs мин. міс.: +${PREV_DELTA} ({PREV_DELTA_PCT.toFixed(1)}%)</p></div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3 min-h-[100px]">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 text-white flex items-center justify-center shrink-0"><TrendingDown className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Виконання</p><p className="text-[22px] font-extrabold mt-1.5">{formatPct(PCT)} <span className="text-[12px] text-rose-600">-{(NORM-PCT).toFixed(1)}%</span></p><p className="text-[11px] mt-1.5 text-muted-foreground">Норма: <span className="font-semibold text-foreground">{formatPct(NORM)}</span></p><p className="text-[11px] text-muted-foreground">Прогноз: <span className="font-semibold text-amber-600">{formatPct(FORECAST)}</span> · Очік.: <span className="font-semibold text-[#066aab]">{formatPct(EXPECTED)}</span></p></div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3 min-h-[100px]">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shrink-0"><Users className="h-5 w-5" /></div>
        <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Структура</p><p className="text-[22px] font-extrabold mt-1.5"><span className="tabular-nums">{REGIONS}</span><span className="text-[11px] text-muted-foreground font-medium ml-1">регіонів</span> <span className="text-muted-foreground/30">·</span> <span className="tabular-nums">{MANAGERS}</span><span className="text-[11px] text-muted-foreground font-medium ml-1">менеджерів</span></p><p className="text-[11px] mt-1.5 text-muted-foreground">2 менеджери — Дніпро</p></div>
      </div>
    </div>
  );
}

// === Варіант 5: Watermark-іконка ===
function V5() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="bg-white rounded-2xl p-5 shadow-sm relative overflow-hidden min-h-[110px]">
        <Target className="absolute right-3 -bottom-2 h-24 w-24 text-[#066aab]/10" />
        <div className="relative"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">План місяця</p><p className="text-[26px] font-extrabold mt-2 amount">{formatUSD(PLAN)}</p></div>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm relative overflow-hidden min-h-[110px]">
        <DollarSign className="absolute right-3 -bottom-2 h-24 w-24 text-emerald-500/10" />
        <div className="relative"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Факт</p><p className="text-[26px] font-extrabold mt-2 amount">{formatUSD(FACT)}</p><p className="text-[11px] mt-1.5 text-emerald-600 font-semibold"><TrendingUp className="inline h-3 w-3 -mt-0.5 mr-0.5" />+${PREV_DELTA} vs мин. міс.</p></div>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm relative overflow-hidden min-h-[110px]">
        <TrendingDown className="absolute right-3 -bottom-2 h-24 w-24 text-rose-500/10" />
        <div className="relative"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Виконання</p><p className="text-[26px] font-extrabold mt-2"><span className="text-rose-600">{formatPct(PCT)}</span></p><p className="text-[11px] mt-1.5 text-muted-foreground">Норма: <span className="font-semibold text-foreground">{formatPct(NORM)}</span> · Прогноз: <span className="font-semibold text-amber-600">{formatPct(FORECAST)}</span></p></div>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm relative overflow-hidden min-h-[110px]">
        <Users className="absolute right-3 -bottom-2 h-24 w-24 text-amber-500/10" />
        <div className="relative"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Менеджерів</p><p className="text-[26px] font-extrabold mt-2">{MANAGERS}</p></div>
      </div>
    </div>
  );
}

// === Варіант 7: Гібрид 4+5 (caption + watermark) ===
function V7() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="bg-white rounded-2xl p-5 shadow-sm relative overflow-hidden min-h-[110px]">
        <Target className="absolute right-3 -bottom-2 h-24 w-24 text-[#066aab]/10" />
        <div className="relative">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">План місяця</p>
          <p className="text-[24px] font-extrabold mt-2 amount tabular-nums">{formatUSD(PLAN)}</p>
          <p className="text-[11px] mt-1.5 text-muted-foreground">Квітень 2026 · 22 робочих дні</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm relative overflow-hidden min-h-[110px]">
        <DollarSign className="absolute right-3 -bottom-2 h-24 w-24 text-emerald-500/10" />
        <div className="relative">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Факт</p>
          <p className="text-[24px] font-extrabold mt-2 amount tabular-nums">{formatUSD(FACT)}</p>
          <p className="text-[11px] mt-1.5 text-emerald-600 font-semibold">
            <TrendingUp className="inline h-3 w-3 -mt-0.5 mr-0.5" />
            vs мин. міс.: <span className="amount whitespace-nowrap">+${PREV_DELTA}</span>
            <span className="whitespace-nowrap"> ({PREV_DELTA_PCT.toFixed(1)}%)</span>
          </p>
        </div>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm relative overflow-hidden min-h-[110px]">
        <TrendingDown className="absolute right-3 -bottom-2 h-24 w-24 text-rose-500/10" />
        <div className="relative">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Виконання</p>
          <p className="text-[24px] font-extrabold mt-2 leading-none">
            <span className="text-rose-600">{formatPct(PCT)}</span>
            <span className="text-[14px] text-rose-600 ml-1.5">-{(NORM-PCT).toFixed(1)}%</span>
          </p>
          <p className="text-[11px] mt-1 text-muted-foreground">Норма: <span className="font-semibold text-foreground">{formatPct(NORM)}</span></p>
          <p className="text-[11px] text-muted-foreground">Прогноз: <span className="font-semibold text-amber-600">{formatPct(FORECAST)}</span> · Очік.: <span className="font-semibold text-[#066aab]">{formatPct(EXPECTED)}</span></p>
        </div>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm relative overflow-hidden min-h-[110px]">
        <MapPin className="absolute right-3 -bottom-2 h-24 w-24 text-amber-500/10" />
        <div className="relative">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Структура</p>
          <p className="text-[24px] font-extrabold mt-2 leading-none">
            <span className="tabular-nums">{REGIONS}</span>
            <span className="text-[11px] text-muted-foreground font-medium ml-1">регіонів</span>
            <span className="text-muted-foreground/30 mx-1.5">·</span>
            <span className="tabular-nums">{MANAGERS}</span>
            <span className="text-[11px] text-muted-foreground font-medium ml-1">менеджерів</span>
          </p>
          <p className="text-[11px] mt-1.5 text-muted-foreground">Активні: 10 · вакансій: 0</p>
        </div>
      </div>
    </div>
  );
}

// === Варіант 8: Color-band (верхня смужка) ===
function V8() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden min-h-[110px]">
        <div className="h-1 bg-gradient-to-r from-[#066aab] to-[#0880cc]" />
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Target className="h-3.5 w-3.5 text-[#066aab]" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">План місяця</p>
          </div>
          <p className="text-[24px] font-extrabold tabular-nums leading-none">{formatUSD(PLAN)}</p>
          <p className="text-[11px] mt-2 text-muted-foreground">Квітень 2026 · 22 робочих дні</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden min-h-[110px]">
        <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Факт</p>
          </div>
          <p className="text-[24px] font-extrabold tabular-nums leading-none amount">{formatUSD(FACT)}</p>
          <p className="text-[11px] mt-2 text-emerald-600 font-semibold">
            <TrendingUp className="inline h-3 w-3 -mt-0.5 mr-0.5" />
            vs мин. міс.: <span className="amount whitespace-nowrap">+${PREV_DELTA}</span>
            <span className="whitespace-nowrap"> ({PREV_DELTA_PCT.toFixed(1)}%)</span>
          </p>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden min-h-[110px]">
        <div className="h-1 bg-gradient-to-r from-rose-500 to-red-600" />
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Виконання</p>
          </div>
          <p className="text-[24px] font-extrabold leading-none">
            <span className="text-rose-600">{formatPct(PCT)}</span>
            <span className="text-[14px] text-rose-600 ml-1.5">-{(NORM-PCT).toFixed(1)}%</span>
          </p>
          <p className="text-[11px] mt-1 text-muted-foreground">Норма: <span className="font-semibold text-foreground">{formatPct(NORM)}</span></p>
          <p className="text-[11px] text-muted-foreground">Прогноз: <span className="font-semibold text-amber-600">{formatPct(FORECAST)}</span> · Очік.: <span className="font-semibold text-[#066aab]">{formatPct(EXPECTED)}</span></p>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden min-h-[110px]">
        <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-600" />
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <MapPin className="h-3.5 w-3.5 text-amber-600" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Структура</p>
          </div>
          <p className="text-[24px] font-extrabold leading-none">
            <span className="tabular-nums">{REGIONS}</span>
            <span className="text-[11px] text-muted-foreground font-medium ml-1">регіонів</span>
            <span className="text-muted-foreground/30 mx-1.5">·</span>
            <span className="tabular-nums">{MANAGERS}</span>
            <span className="text-[11px] text-muted-foreground font-medium ml-1">менеджерів</span>
          </p>
          <p className="text-[11px] mt-2 text-muted-foreground">Активні: 10 · вакансій: 0</p>
        </div>
      </div>
    </div>
  );
}

// === Варіант 9: Big-number з border-top для caption ===
function V9() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col min-h-[120px]">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-5 h-5 rounded-md bg-[#066aab]/10 flex items-center justify-center"><Target className="h-3 w-3 text-[#066aab]" /></div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">План місяця</p>
        </div>
        <p className="text-[28px] font-extrabold tracking-tight tabular-nums leading-none">{formatUSD(PLAN)}</p>
        <div className="mt-auto pt-2 border-t border-[#f0f2f8]">
          <p className="text-[11px] text-muted-foreground">Квітень 2026 · 22 робочих дні</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col min-h-[120px]">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center"><DollarSign className="h-3 w-3 text-emerald-600" /></div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Факт</p>
        </div>
        <p className="text-[28px] font-extrabold tracking-tight tabular-nums leading-none amount">{formatUSD(FACT)}</p>
        <div className="mt-auto pt-2 border-t border-[#f0f2f8]">
          <p className="text-[11px] text-emerald-600 font-semibold">
            <TrendingUp className="inline h-3 w-3 -mt-0.5 mr-0.5" />
            vs мин. міс.: <span className="amount whitespace-nowrap">+${PREV_DELTA}</span>
            <span className="whitespace-nowrap"> ({PREV_DELTA_PCT.toFixed(1)}%)</span>
          </p>
        </div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col min-h-[120px]">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-5 h-5 rounded-md bg-rose-500/10 flex items-center justify-center"><TrendingDown className="h-3 w-3 text-rose-600" /></div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Виконання</p>
        </div>
        <p className="text-[28px] font-extrabold tracking-tight leading-none">
          <span className="text-rose-600">{formatPct(PCT)}</span>
          <span className="text-[14px] text-rose-600 ml-1.5">-{(NORM-PCT).toFixed(1)}%</span>
        </p>
        <div className="mt-auto pt-2 border-t border-[#f0f2f8]">
          <p className="text-[11px] text-muted-foreground">Норма: <span className="font-semibold text-foreground">{formatPct(NORM)}</span> · Прогноз: <span className="font-semibold text-amber-600">{formatPct(FORECAST)}</span> · Очік.: <span className="font-semibold text-[#066aab]">{formatPct(EXPECTED)}</span></p>
        </div>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col min-h-[120px]">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-5 h-5 rounded-md bg-amber-500/10 flex items-center justify-center"><MapPin className="h-3 w-3 text-amber-600" /></div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Структура</p>
        </div>
        <p className="text-[28px] font-extrabold tracking-tight leading-none">
          <span className="tabular-nums">{REGIONS}</span>
          <span className="text-[11px] text-muted-foreground font-medium ml-1">рег.</span>
          <span className="text-muted-foreground/30 mx-1.5">·</span>
          <span className="tabular-nums">{MANAGERS}</span>
          <span className="text-[11px] text-muted-foreground font-medium ml-1">мен.</span>
        </p>
        <div className="mt-auto pt-2 border-t border-[#f0f2f8]">
          <p className="text-[11px] text-muted-foreground">Активні: 10 · вакансій: 0</p>
        </div>
      </div>
    </div>
  );
}

// === Варіант 6: Stripe-style ===
function V6() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="bg-white rounded-2xl p-5 shadow-sm relative min-h-[110px]">
        <div className="flex items-start justify-between mb-2"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">План місяця</p><div className="w-7 h-7 rounded-lg bg-[#066aab]/10 flex items-center justify-center"><Target className="h-3.5 w-3.5 text-[#066aab]" /></div></div>
        <p className="text-[28px] font-extrabold tracking-tight tabular-nums leading-none">{formatUSD(PLAN)}</p>
        <p className="text-[11px] mt-2 text-muted-foreground">Квітень 2026</p>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm relative min-h-[110px]">
        <div className="flex items-start justify-between mb-2"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Факт</p><div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center"><DollarSign className="h-3.5 w-3.5 text-emerald-600" /></div></div>
        <p className="text-[28px] font-extrabold tracking-tight tabular-nums leading-none">{formatUSD(FACT)}</p>
        <p className="text-[11px] mt-2 text-emerald-600 font-semibold"><TrendingUp className="inline h-3 w-3 -mt-0.5 mr-0.5" />+${PREV_DELTA} ({PREV_DELTA_PCT.toFixed(1)}%) vs мин. міс.</p>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm relative min-h-[110px]">
        <div className="flex items-start justify-between mb-2"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Виконання</p><div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center"><TrendingDown className="h-3.5 w-3.5 text-rose-600" /></div></div>
        <p className="text-[28px] font-extrabold tracking-tight leading-none"><span>{formatPct(PCT)}</span> <span className="text-[14px] text-rose-600">-{(NORM-PCT).toFixed(1)}%</span></p>
        <p className="text-[11px] mt-1 text-muted-foreground">Норма: <span className="font-semibold text-foreground">{formatPct(NORM)}</span></p>
        <p className="text-[11px] text-muted-foreground">Прогноз: <span className="font-semibold text-amber-600">{formatPct(FORECAST)}</span> · Очік.: <span className="font-semibold text-[#066aab]">{formatPct(EXPECTED)}</span></p>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm relative min-h-[110px]">
        <div className="flex items-start justify-between mb-2"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Структура</p><div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center"><MapPin className="h-3.5 w-3.5 text-amber-600" /></div></div>
        <div className="flex items-baseline gap-3">
          <span className="text-[28px] font-extrabold tracking-tight tabular-nums leading-none">{REGIONS}</span><span className="text-[12px] text-muted-foreground">регіонів</span>
          <span className="text-muted-foreground/30">·</span>
          <span className="text-[28px] font-extrabold tracking-tight tabular-nums leading-none">{MANAGERS}</span><span className="text-[12px] text-muted-foreground">менеджерів</span>
        </div>
      </div>
    </div>
  );
}
