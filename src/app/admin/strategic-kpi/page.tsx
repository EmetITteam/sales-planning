'use client';

/** /admin/strategic-kpi — стратегічний дашборд KPI (admin + sdu). */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import { useGlassHover } from '@/hooks/use-glass-hover';
import { isStrategicKpiLogin } from '@/lib/feature-flags';
import {
  STRATEGIC_BRANDS,
  STRATEGIC_PICKER_ITEMS,
  STRATEGIC_SEGMENTS,
  CHANNEL_LABEL,
  ELLANSE_BRAND,
  isChannelActive,
  isSegment,
  type StrategicBrand,
  type StrategicChannel,
} from '@/lib/strategic-kpi/brands';
import {
  ArrowLeft,
  Users,
  Calendar,
  Package,
  DollarSign,
  Building2,
  PhoneCall,
  Truck,
  Tag,
  GraduationCap,
} from 'lucide-react';
import {
  MetricCard, CategoryCard, ChannelCategoriesRow, SubBrandRow, SeminarStatCard, StaticRow, PeriodPicker, SkeletonHero,
} from './components';
import { ReactivationBlock } from './reactivation-block';

interface Block {
  brand: string;
  channel: string;
  target: {
    unique_clients_annual: number | null;
    avg_check_annual: number | null;
    buyers_monthly: number | null;
    avg_qty_per_client: number | null;
    new_trained_annual: number | null;
    trainings_annual: number | null;
    trainings_repeat: number | null;
    conversion_repeat_pct: number | null;
    retention_monthly: number | null;
  } | null;
  month: { unique_clients: number; total_qty: number; total_sum_usd: number; avg_qty_per_client: number; avg_check_usd: number } | null;
  ytd: { unique_clients: number; total_sum_usd: number; avg_check_usd: number } | null;
  execution: {
    buyers_monthly_pct: number | null;
    avg_qty_per_client_pct: number | null;
    unique_clients_simple_pct: number | null;
    unique_clients_pace_pct: number | null;
    unique_clients_forecast: number | null;
    avg_check_annual_pct: number | null;
  };
  promos: Array<{
    name: string; unique_clients: number; total_qty: number; total_sum_usd: number;
    is_gift: boolean; gift_brand: string | null;
    overlap_with?: { name: string; is_gift: boolean; clients: number };
  }>;
  seminars_actual?: SeminarActual;
  sub_brands?: Array<{
    brand: string;
    month_uc: number;
    month_qty: number;
    month_sum: number;
    month_avg_qty: number;
    month_avg_check: number;
    ytd_uc: number;
    ytd_sum: number;
    target_uc_annual: number | null;
    target_buyers_monthly: number | null;
  }>;
}

interface SeminarActual {
  period: { seminars_held: number; new_trained: number };
  ytd: { seminars_held: number; new_trained: number };
  by_location: Array<{
    location: string;
    period: { seminars_held: number; new_trained: number };
    ytd: { seminars_held: number; new_trained: number };
  }>;
}
interface Categories {
  new: number; active: number; sleeping: number; lost: number; total: number;
}
interface ApiResponse {
  period: string;
  periodKind: 'month' | 'quarter' | 'half' | 'year';
  year: number;
  monthIndex: number;
  monthPace: number;
  blocks: Block[];
  categories: Categories | null;
  channel_categories: Record<string, Categories> | null;
  first_trained: { period: number; ytd: number } | null;
  rep_seminars: Array<{ seminar: string; division: string; unique_clients: number }> | null;
  ellanse_seminars_summary: { plan: number; actual_ytd: number } | null;
  segment_summary: {
    brand: string;
    month_uc: number;
    month_sum: number;
    ytd_uc: number;
    ytd_sum: number;
    plan_month_uc: number;
    plan_month_sum_derived: number;
    plan_ytd_uc: number;
  } | null;
}

const CHANNEL_ICON: Record<StrategicChannel, React.ComponentType<{ size?: number }>> = {
  representatives: Building2,
  call_center: PhoneCall,
  distributors: Truck,
};
const MONTHS_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

function statusColor(pct: number | null): 'good' | 'ok' | 'warn' | 'bad' | 'na' {
  // Пороги: ≥100 зел · 60-99 жовт · <60 черв · null сірий
  if (pct == null) return 'na';
  if (pct >= 100) return 'good';
  if (pct >= 60) return 'warn';
  return 'bad';
}
function fmtUSD(n: number) { return `$${Math.round(n).toLocaleString('en-US')}`; }
function fmtPct(n: number | null | undefined) { return n == null ? '—' : `${n.toFixed(1)}%`; }
function fmtNum(n: number | null | undefined, decimal = false) {
  if (n == null) return '—';
  return decimal ? n.toFixed(1) : Math.round(n).toLocaleString('en-US');
}

export default function StrategicKpiPage() {
  const router = useRouter();
  const { user } = useAppStore();
  useGlassHover();  // cursor-follow spotlight на .glass-card як на інших бордах

  const defaultPeriod = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const [period, setPeriod] = useState(defaultPeriod);
  const [selectedBrand, setSelectedBrand] = useState<StrategicBrand | 'reactivation'>('Vitaran');
  const isReactivationMode = selectedBrand === 'reactivation';
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (user && !isStrategicKpiLogin(user.login)) router.replace('/'); }, [user, router]);

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    if (selectedBrand === 'reactivation') {  // Акції — власний fetch
      setData(null);
      setLoading(false);
      return;
    }
    fetch(
      `/api/analytics/strategic-kpi?period=${period}&brand=${encodeURIComponent(selectedBrand)}`,
      { credentials: 'same-origin', signal },
    )
      .then(r => r.json())
      .then((s: ApiResponse & { error?: string }) => {
        if (signal?.aborted) return;
        if (s.error) throw new Error(s.error);
        setData(s);
      })
      .catch(e => {
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message);
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  }, [period, selectedBrand]);

  useEffect(() => {
    if (!user || !isStrategicKpiLogin(user.login)) return;
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [user, load]);

  const brandBlocks = useMemo(() => {
    if (!data) return [];
    // Для сегмента (IUSE) блоки — це aggregated per-channel entries з brand=IUSE.
    return data.blocks.filter(b => b.brand === selectedBrand);
  }, [data, selectedBrand]);

  const periodLabel = useMemo(() => {
    const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
    if (monthMatch) {
      const yr = Number(monthMatch[1]);
      const mo = Number(monthMatch[2]);
      return `${MONTHS_UA[mo - 1]} ${yr}`;
    }
    const qMatch = period.match(/^(\d{4})-Q([1-4])$/i);
    if (qMatch) return `${qMatch[2]} квартал ${qMatch[1]}`;
    const hMatch = period.match(/^(\d{4})-H([12])$/i);
    if (hMatch) return `${hMatch[2] === '1' ? 'І' : 'ІІ'} півріччя ${hMatch[1]}`;
    const yMatch = period.match(/^(\d{4})$/);
    if (yMatch) return `Рік ${yMatch[1]}`;
    return period;
  }, [period]);
  const m = data?.monthIndex ?? 0;

  // Грошовий % (fact_$ / sum(buyers_monthly × avg_check)). Fallback — клієнтський.
  const brandExecution = useMemo(() => {
    if (isSegment(selectedBrand) && data?.segment_summary?.plan_month_sum_derived) {
      return (data.segment_summary.month_sum / data.segment_summary.plan_month_sum_derived) * 100;
    }
    let factSum = 0, planSum = 0;
    for (const b of brandBlocks) {
      if (b.month?.total_sum_usd) factSum += b.month.total_sum_usd;
      if (b.target?.buyers_monthly && b.target.avg_check_annual) planSum += b.target.buyers_monthly * b.target.avg_check_annual;
    }
    if (planSum > 0) return (factSum / planSum) * 100;
    const pcts = brandBlocks.filter(b => b.month?.unique_clients && b.execution.buyers_monthly_pct != null).map(b => b.execution.buyers_monthly_pct!);
    return pcts.length ? pcts.reduce((s, p) => s + p, 0) / pcts.length : null;
  }, [brandBlocks, data, selectedBrand]);

  if (!user || !isStrategicKpiLogin(user.login)) return null;

  return (
    <>
      <style jsx global>{`
        .sk-page { font-family: var(--font-sans); color: #062a3d; position: relative; min-height: 100vh; }
        .sk-page .num, .sk-page .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; letter-spacing: -0.5px; }
        .sk-mesh { position: fixed; inset: 0; z-index: -2; pointer-events: none;
          background: radial-gradient(at 20% 20%, #ecfeff 0%, transparent 55%),
            radial-gradient(at 80% 30%, #f0fdfa 0%, transparent 55%),
            radial-gradient(at 60% 80%, #eff6ff 0%, transparent 55%),
            radial-gradient(at 20% 90%, #e0f7fa 0%, transparent 55%),
            linear-gradient(135deg, #f8fbfd 0%, #f0fdfa 50%, #ecfeff 100%);
        }
        .sk-blob { position: fixed; border-radius: 50%; filter: blur(90px); z-index: -1; pointer-events: none; opacity: 0.32; animation: skDrift 25s ease-in-out infinite; }
        .sk-blob.a { width: 520px; height: 520px; background: rgba(6,106,171,0.35); top: -100px; left: -100px; }
        .sk-blob.b { width: 440px; height: 440px; background: rgba(91,213,188,0.4); top: 30%; right: -80px; animation-delay: -8s; }
        .sk-blob.c { width: 380px; height: 380px; background: rgba(8,128,204,0.3); bottom: -100px; left: 30%; animation-delay: -16s; }
        @keyframes skDrift { 0%,100% { transform: translate(0,0) scale(1); } 25% { transform: translate(80px,-60px) scale(1.1); } 50% { transform: translate(-40px,100px) scale(0.95); } 75% { transform: translate(60px,40px) scale(1.05); } }
        .sk-glass { background: rgba(255,255,255,0.42); backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%); border: 1px solid rgba(255,255,255,0.85); border-radius: 24px; box-shadow: 0 8px 32px rgba(31,38,135,0.08), inset 0 1px 0 rgba(255,255,255,0.7); }
        .sk-glass-soft { background: rgba(255,255,255,0.32); backdrop-filter: blur(16px) saturate(160%); -webkit-backdrop-filter: blur(16px) saturate(160%); border: 1px solid rgba(255,255,255,0.75); border-radius: 18px; }
        .sk-hero-title { font-family: var(--font-sans); font-weight: 200; font-size: 30px; letter-spacing: -1px; line-height: 1.05; }
        .sk-hero-title strong { font-weight: 700; }
        .sk-mega-pct { font-family: var(--font-mono); font-weight: 700; font-size: 52px; letter-spacing: -2px; line-height: 1; font-variant-numeric: tabular-nums; }
        .sk-brand-pill { padding: 10px 16px; border-radius: 16px; font-weight: 700; font-size: 13px; letter-spacing: -0.2px; transition: all 0.2s; cursor: pointer; border: 1px solid rgba(6,42,61,0.08); background: rgba(255,255,255,0.5); color: rgba(6,42,61,0.58); min-width: 118px; text-align: center; }
        .sk-brand-pill:hover { transform: translateY(-1px); background: rgba(255,255,255,0.75); color: #062a3d; }
        .sk-brand-pill.active { background: linear-gradient(135deg, #066aab 0%, #0284c7 100%); color: white; border-color: transparent; box-shadow: 0 4px 14px rgba(6,106,171,0.35); }
        .sk-brand-pill.active:hover { transform: translateY(-1px); }
        .sk-brand-pill.active-warn { background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%); color: white; border-color: transparent; box-shadow: 0 4px 14px rgba(217,119,6,0.35); }
        .sk-brand-pill.active-warn:hover { transform: translateY(-1px); }
        .sk-text-good { color: #0f766e; } .sk-text-ok { color: #0284c7; } .sk-text-warn { color: #c2410c; } .sk-text-bad { color: #be123c; }
        .sk-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.2px; }
        .sk-chip-good { background: rgba(20,184,166,0.14); color: #0f766e; }
        .sk-chip-ok   { background: rgba(2,132,199,0.14); color: #0284c7; }
        .sk-chip-warn { background: rgba(251,146,60,0.16); color: #c2410c; }
        .sk-chip-bad  { background: rgba(225,29,72,0.14); color: #be123c; }
        .sk-progress-track { height: 3px; border-radius: 2px; background: rgba(6,42,61,0.08); overflow: hidden; }
        .sk-progress-fill { height: 100%; border-radius: 2px; transition: width 0.6s ease; }
        .sk-progress-fill.good { background: linear-gradient(90deg, #14b8a6, #5bd5bc); }
        .sk-progress-fill.ok   { background: linear-gradient(90deg, #0284c7, #38bdf8); }
        .sk-progress-fill.warn { background: linear-gradient(90deg, #fb923c, #fbbf24); }
        .sk-progress-fill.bad  { background: linear-gradient(90deg, #e11d48, #fb7185); }
        .sk-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.7px; color: rgba(6,42,61,0.58); font-weight: 700; }
        .sk-muted { color: rgba(6,42,61,0.58); }
      `}</style>

      <div className="sk-mesh" />
      <div className="sk-blob a" />
      <div className="sk-blob b" />
      <div className="sk-blob c" />

      <AppHeader />
      <main className="sk-page p-5 max-w-6xl mx-auto space-y-6">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-[13px] sk-muted hover:text-foreground cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Адмін-панель
        </Link>

        {/* Toolbar */}
        <div className="sk-glass p-5 space-y-4">
          <PeriodPicker period={period} onChange={setPeriod} />
          <div>
            <div className="sk-lbl mb-2">Бренд · Режим</div>
            <div className="flex flex-wrap gap-2 items-center">
              {STRATEGIC_PICKER_ITEMS.map(b => (
                <button key={b} type="button" onClick={() => setSelectedBrand(b as StrategicBrand)}
                  className={`sk-brand-pill ${b === selectedBrand ? 'active' : ''}`}>
                  {b}
                </button>
              ))}
              {/* Роздільник */}
              <span className="mx-1 h-6 w-px bg-[rgba(6,42,61,0.15)]" aria-hidden="true" />
              {/* Спеціальний mode — показує ReactivationBlock замість брендового дашборду */}
              <button
                type="button"
                onClick={() => setSelectedBrand('reactivation')}
                className={`sk-brand-pill ${isReactivationMode ? 'active-warn' : ''}`}
                title="Реактивація категорій: 2 таблиці — по акціях та по брендах, для Нових / Сплячих / Втрачених клієнтів"
              >
                Акції
              </button>
            </div>
          </div>
        </div>

        {error && !isReactivationMode && (
          <div className="sk-glass p-4 border-l-4 border-rose-500 text-[13px] text-rose-700">
            <strong>Помилка:</strong> {error}
          </div>
        )}
        {loading && !isReactivationMode && <SkeletonHero />}

        {/* РЕЖИМ «АКЦІЇ»: тільки блок реактивації, брендових метрик не показуємо */}
        {isReactivationMode && <ReactivationBlock period={period} />}

        {!isReactivationMode && !loading && !error && brandBlocks.length === 0 && (
          <div className="sk-glass p-6 text-[13px] sk-muted">
            Нема даних для <strong>{selectedBrand}</strong> у {periodLabel}.
            Введи таргети у <Link href="/admin/strategic-targets" className="text-emet-blue underline">/admin/strategic-targets</Link>.
          </div>
        )}

        {/* Hero */}
        {!isReactivationMode && !loading && brandBlocks.length > 0 && (
          <div className="sk-glass px-5 pt-4 pb-4 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none opacity-40" style={{
              background: 'radial-gradient(circle at 85% 20%, rgba(91,213,188,0.22) 0%, transparent 60%)',
            }} />
            <div className="relative flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="sk-hero-title">
                  <strong>{selectedBrand}</strong> <span className="sk-muted">·</span> <span className="sk-muted font-light">{periodLabel}</span>
                </div>
                {m > 0 && (
                  <div className="text-[11.5px] sk-muted mt-1.5">
                    По {m}-му міс. з 12
                  </div>
                )}
              </div>
              {brandExecution !== null && (
                <div className="text-right">
                  <div className={`sk-mega-pct sk-text-${statusColor(brandExecution)}`}>{brandExecution.toFixed(1)}%</div>
                  <div className="sk-lbl mt-1">% виконання плану</div>
                </div>
              )}
            </div>

            {/* Категорії клієнтів (для selected brand) */}
            {data?.categories && data.categories.total > 0 && (
              <div className="relative mt-3 pt-3 border-t border-[rgba(6,42,61,0.08)]">
                <div className="flex items-baseline gap-2 mb-2">
                  <div className="sk-lbl">Клієнти бренду у періоді</div>
                  <div className="text-[11px] sk-muted">
                    · Разом <span className="mono font-bold">{data.categories.total}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <CategoryCard label="Нові" value={data.categories.new} total={data.categories.total}
                    hint="Ніколи не купували цей бренд до цього періоду" accent="mint" />
                  <CategoryCard label="Активні" value={data.categories.active} total={data.categories.total}
                    hint="Купували цей бренд ≤ 4 міс. до періоду" accent="good" />
                  <CategoryCard label="Сплячі" value={data.categories.sleeping} total={data.categories.total}
                    hint="Купували 4-6 міс. тому" accent="warn" />
                  <CategoryCard label="Втрачені" value={data.categories.lost} total={data.categories.total}
                    hint="Не купували > 6 міс." accent="bad" />
                </div>
              </div>
            )}

            {/* Warning якщо категорії пусті (немає даних за період) */}
            {data?.categories && data.categories.total === 0 && (
              <div className="relative mt-4 pt-3.5 border-t border-[rgba(6,42,61,0.08)]">
                <div className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
                  style={{
                    background: 'linear-gradient(135deg, rgba(251,146,60,0.10) 0%, rgba(251,146,60,0.03) 100%)',
                    border: '1px solid rgba(251,146,60,0.25)',
                  }}>
                  <div className="text-[16px] leading-none text-amber-600 mt-0.5">⚠</div>
                  <div>
                    <div className="text-[12px] font-bold text-amber-800">Немає даних за цей період</div>
                    <div className="text-[11px] text-amber-700/80 mt-0.5">
                      У БД немає продажів <strong>{selectedBrand}</strong> у {periodLabel}. Останні дані — по {' '}
                      <span className="mono font-bold">30.06.2026</span>. Виберіть інший період.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Channel blocks */}
        {!isReactivationMode && !loading && brandBlocks.map(block => {
          const channel = block.channel as StrategicChannel;
          if (isReactivationMode) return null;
          const brand = selectedBrand as StrategicBrand | string;
          // Для сегмента (напр. IUSE): канал активний якщо він активний
          // хоч у одного sub-brand.
          if (isSegment(brand)) {
            const subs = STRATEGIC_SEGMENTS[brand as keyof typeof STRATEGIC_SEGMENTS];
            if (!subs.some(sb => isChannelActive(sb, channel))) return null;
          } else if (!isChannelActive(brand as StrategicBrand, channel)) {
            return null;
          }
          // Приховуємо канальний блок якщо у періоді для нього немає даних
          // AND нема таргетів AND нема семінарів (Ellanse) AND нема промо.
          // Тобто нема сенсу показувати порожній блок.
          const hasMonth = block.month && block.month.unique_clients > 0;
          const hasYtd = block.ytd && block.ytd.unique_clients > 0;
          const hasSeminars = block.seminars_actual && (
            block.seminars_actual.ytd.seminars_held > 0 || block.seminars_actual.period.seminars_held > 0
          );
          const hasPromos = block.promos.length > 0;
          if (!hasMonth && !hasYtd && !hasSeminars && !hasPromos && !block.target) return null;
          const Icon = CHANNEL_ICON[channel];
          // Грошовий % per канал: fact_$ / (target.buyers_monthly × target.avg_check_annual)
          const planDollar = (block.target?.buyers_monthly ?? 0) * (block.target?.avg_check_annual ?? 0);
          const overallPct = planDollar > 0 && block.month?.total_sum_usd
            ? (block.month.total_sum_usd / planDollar) * 100
            : block.execution.buyers_monthly_pct;
          const overallStatus = statusColor(overallPct);

          return (
            <div key={block.channel} className="sk-glass px-5 py-4 space-y-4">
              <div className="flex items-center gap-3.5 pb-3 border-b border-[rgba(6,42,61,0.08)]">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0284c7] text-white flex items-center justify-center shadow-lg shadow-[rgba(6,106,171,0.25)]">
                  <Icon size={17} />
                </div>
                <div className="flex-1">
                  <h3 className="text-[15px] font-bold tracking-tight">{CHANNEL_LABEL[channel]}</h3>
                  {!block.target && (
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Таргети не введено · <Link href="/admin/strategic-targets" className="underline">Ввести</Link>
                    </p>
                  )}
                </div>
                {overallPct !== null && (
                  <div className="text-right">
                    <div className={`num text-[26px] font-bold leading-none sk-text-${overallStatus}`}>{fmtPct(overallPct)}</div>
                    <div className="sk-lbl mt-0.5">Виконання</div>
                  </div>
                )}
              </div>

              {/* 4 KPI-картки — тільки для Представництв і КЦ.
                  Для Дистриб'юторів (Ellanse) знаємо тільки кількість семінарів
                  — інших метрик у 1С немає, тому 4 карти не показуємо. */}
              {channel !== 'distributors' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <MetricCard
                    label="Унікальні за рік"
                    Icon={Users}
                    ytdValue={block.ytd?.unique_clients ?? null}
                    target={block.target?.unique_clients_annual ?? null}
                    simplePct={block.execution.unique_clients_simple_pct}
                    pacePct={block.execution.unique_clients_pace_pct}
                    forecast={block.execution.unique_clients_forecast}
                  />
                  <MetricCard
                    label="Купують у міс."
                    Icon={Calendar}
                    monthValue={block.month?.unique_clients ?? null}
                    target={block.target?.buyers_monthly ?? null}
                    simplePct={block.execution.buyers_monthly_pct}
                  />
                  <MetricCard
                    label="ср/уп на клієнта"
                    Icon={Package}
                    monthValue={block.month?.avg_qty_per_client ?? null}
                    target={block.target?.avg_qty_per_client ?? null}
                    simplePct={block.execution.avg_qty_per_client_pct}
                    isDecimal
                  />
                  <MetricCard
                    label="Середній чек"
                    Icon={DollarSign}
                    monthValue={block.month?.avg_check_usd ?? null}
                    target={block.target?.avg_check_annual ?? null}
                    simplePct={block.execution.avg_check_annual_pct}
                    isUsd
                  />
                </div>
              )}

              {/* Розкладка категорій клієнтів по цьому каналу (RPC 036).
                  Показуємо ТІЛЬКИ коли у бренду є КЦ (представництва + КЦ).
                  Для дистрибуторів (Ellanse Полтава/Чернівці) даних per-client
                  немає — і так пусто. Для лише-Представництва — дубль hero. */}
              {channel !== 'distributors' && data?.channel_categories?.[channel] && (() => {
                const brand = selectedBrand as StrategicBrand | string;
                const hasKC = isSegment(brand)
                  ? STRATEGIC_SEGMENTS[brand as keyof typeof STRATEGIC_SEGMENTS].some(s => isChannelActive(s, 'call_center'))
                  : isChannelActive(brand as StrategicBrand, 'call_center');
                if (!hasKC) return null;
                return (
                  <ChannelCategoriesRow
                    data={data.channel_categories[channel]}
                    channelLabel={channel === 'representatives' ? 'Представництвах' : 'Колл-центрі'}
                    periodLabel={periodLabel}
                  />
                );
              })()}

              {/* Segment mode (IUSE): розкладка по підбрендах без % */}
              {block.sub_brands && <SubBrandRow subBrands={block.sub_brands} />}

              {/* ELLANSE Представництва — «Впервые обучені» + факт семінарів */}
              {selectedBrand === ELLANSE_BRAND && channel === 'representatives' && data?.first_trained && (
                <div className="pt-5 border-t border-dashed border-[rgba(6,42,61,0.15)]">
                  {/* Річна зведена картина: план vs факт YTD семінарів */}
                  {data.ellanse_seminars_summary && data.ellanse_seminars_summary.plan > 0 && (() => {
                    const s = data.ellanse_seminars_summary;
                    const pct = (s.actual_ytd / s.plan) * 100;
                    const st = statusColor(pct);
                    const barColor = { good: '#10b981', ok: '#5bd5bc', warn: '#fb923c', bad: '#e11d48', na: '#cbd5e1' }[st];
                    return (
                      <div
                        className="glass-card mb-3 px-4 py-3 flex items-center gap-3 flex-wrap"
                        style={{ background: `${barColor}0d` }}
                        title="Разом семінарів проведено з початку року (представництва + дистрибутори) vs річний план"
                      >
                        <GraduationCap className="h-4 w-4" style={{ color: barColor }} />
                        <div className="text-[12px]">
                          <span className="font-bold">Семінари за {data.year}: </span>
                          <span className="mono font-bold">{s.actual_ytd}</span>
                          <span className="text-muted-foreground"> з </span>
                          <span className="mono font-bold">{s.plan}</span>
                        </div>
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border mono ml-auto"
                          style={{
                            background: `${barColor}22`,
                            borderColor: `${barColor}66`,
                            color: st === 'ok' ? '#0f766e' : barColor,
                          }}
                        >
                          {pct.toFixed(1)}% плану
                        </span>
                      </div>
                    );
                  })()}
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-[rgba(6,42,61,0.65)] mb-2 flex items-center gap-1.5">
                    <GraduationCap className="h-3 w-3 text-amber-700" /> Вперше пройшли навчання
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div
                      className="rounded-2xl p-4 border relative"
                      style={{
                        background: 'linear-gradient(135deg, rgba(91,213,188,0.18) 0%, rgba(20,184,166,0.08) 100%)',
                        borderColor: 'rgba(91,213,188,0.4)',
                      }}
                      title="Клієнти для яких Ellanse-семінарська покупка у цьому періоді — перша в історії бази (з 2022)"
                    >
                      <div className="sk-lbl mb-1.5" style={{ color: '#0f766e', opacity: 0.85 }}>
                        За період
                      </div>
                      <div className="mono font-bold text-[32px] leading-none tabular-nums" style={{ color: '#0f766e' }}>
                        {data.first_trained.period}
                      </div>
                      <div className="text-[10.5px] mt-1.5" style={{ color: '#0f766e', opacity: 0.7 }}>
                        новий клієнт з Ellanse-семінаром вперше
                      </div>
                    </div>
                    <div
                      className="rounded-2xl p-4 border relative"
                      style={{
                        background: 'linear-gradient(135deg, rgba(2,132,199,0.10) 0%, rgba(8,128,204,0.04) 100%)',
                        borderColor: 'rgba(2,132,199,0.28)',
                      }}
                      title="Скільки нових обучених за YTD (з початку року по кінець періоду)"
                    >
                      <div className="sk-lbl mb-1.5" style={{ color: '#0284c7', opacity: 0.85 }}>
                        Всього за {data.year}
                      </div>
                      <div className="mono font-bold text-[32px] leading-none tabular-nums" style={{ color: '#0284c7' }}>
                        {data.first_trained.ytd}
                      </div>
                      <div className="text-[10.5px] mt-1.5" style={{ color: '#0284c7', opacity: 0.7 }}>
                        від січня по кінець періоду
                      </div>
                    </div>
                  </div>

                  {/* Семінари у представництвах — автоматично зі sales
                      Групуємо (seminar, division) → 1 подія, count-distinct client
                      = учасники. */}
                  {data.rep_seminars && data.rep_seminars.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-[rgba(6,42,61,0.65)] mb-2 flex items-center gap-1.5">
                        <GraduationCap className="h-3 w-3 text-amber-700" />
                        Семінари у представництвах · {data.rep_seminars.length} подій, {new Set(data.rep_seminars.map(s => s.division)).size} міст
                      </p>
                      <div className="space-y-1.5">
                        {data.rep_seminars.map((s, i) => (
                          <div
                            key={`${s.seminar}-${s.division}-${i}`}
                            className="glass-card px-3 py-2.5 text-[12px] grid items-center gap-3"
                            style={{ gridTemplateColumns: '90px 1fr auto' }}
                          >
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-teal-500/15 border border-teal-300/40 text-teal-800 whitespace-nowrap">
                              {s.division}
                            </span>
                            <span className="min-w-0 truncate" title={s.seminar}>
                              {s.seminar}
                            </span>
                            <span className="mono font-bold text-[13px] text-[#0f766e] whitespace-nowrap tabular-nums text-right">
                              {s.unique_clients} <span className="text-[10px] font-medium text-muted-foreground">кл.</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ELLANSE Дистриб'ютори — факт семінарів (Полтава + Чернівці) */}
              {selectedBrand === ELLANSE_BRAND && channel === 'distributors' && (
                <div className="pt-5 border-t border-dashed border-[rgba(6,42,61,0.15)] space-y-4">
                  <p className="sk-lbl flex items-center gap-1.5 text-amber-700">
                    <GraduationCap className="h-3 w-3" /> Навчання Ellanse — Полтава + Чернівці
                  </p>

                  {/* Факт семінарів (з ellanse_seminars_actual) */}
                  {block.seminars_actual && (
                    <div>
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-[rgba(6,42,61,0.65)] mb-2">
                        Факт семінарів · {periodLabel}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <SeminarStatCard
                          label="Разом семінарів"
                          period={block.seminars_actual.period.seminars_held}
                          ytd={block.seminars_actual.ytd.seminars_held}
                        />
                        <div className="rounded-2xl sk-glass-soft p-3.5 flex items-center justify-center">
                          <Link href="/admin/ellanse-seminars"
                            className="text-[11px] text-[#066aab] font-bold underline hover:no-underline">
                            Редагувати факт →
                          </Link>
                        </div>
                      </div>
                      {block.seminars_actual.by_location.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                          {block.seminars_actual.by_location.map(loc => (
                            <div key={loc.location} className="rounded-2xl sk-glass-soft p-3.5">
                              <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#066aab] mb-2">
                                {loc.location === 'poltava' ? 'Полтава' : 'Чернівці'}
                              </p>
                              <div>
                                <div className="sk-muted text-[10px]">Семінарів (період)</div>
                                <div className="mono font-bold text-[22px] leading-none">{loc.period.seminars_held}</div>
                                <div className="sk-muted text-[10px] mt-1">YTD: <span className="mono font-bold">{loc.ytd.seminars_held}</span></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* План — тільки «Провести навчань у рік» (інші метрики у дистриб'юторів
                      не знаємо, у 1С даних немає) */}
                  {block.target?.trainings_annual != null ? (
                    <div>
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-[rgba(6,42,61,0.65)] mb-2">
                        План на рік {data?.year}
                      </p>
                      <div className="grid grid-cols-1 gap-3 text-[12px]">
                        <StaticRow label="Провести навчань у рік, план"
                          value={block.target.trainings_annual}
                          suffix={block.target.trainings_repeat ? `(+${block.target.trainings_repeat} повт.)` : ''} />
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11.5px] sk-muted italic">
                      План не введено. <Link href="/admin/strategic-targets" className="text-emet-blue underline">Ввести</Link>.
                    </div>
                  )}
                </div>
              )}

              {/* Промо */}
              {block.promos.length > 0 && (
                <div className="pt-5 border-t border-[rgba(6,42,61,0.08)]">
                  <p className="sk-lbl mb-3 flex items-center gap-1.5 text-amber-700">
                    <Tag className="h-3 w-3" /> Топ-5 активних промо
                  </p>
                  <div className="space-y-1.5">
                    {block.promos.map(p => {
                      // Overlap-розкладка.
                      // unique_clients ВЖЕ dedup-ований на сервері:
                      //   gift-сторона: вся група клієнтів (u_g)
                      //   discount-сторона: лише «чиста знижка» = u_d - overlap
                      // Для UI треба показати:
                      //   gift promo: «Чисто подарунок = u_g - overlap, Разом зі знижкою = overlap»
                      //   discount promo: «Чисто знижка = u_d (вже dedup), З подарунком = overlap»
                      const overlapCount = p.overlap_with?.clients ?? 0;
                      const cleanCount = p.overlap_with
                        ? (p.is_gift
                          ? Math.max(0, p.unique_clients - overlapCount)   // gift row still has full total
                          : p.unique_clients                                 // discount row already collapsed
                        )
                        : null;
                      return (
                        <div key={p.name} className="rounded-xl sk-glass-soft text-[12px] px-3.5 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate" title={p.name}>{p.name}</div>
                              {p.is_gift && p.gift_brand && (
                                <div className="text-[10px] text-amber-700 font-bold uppercase tracking-wider mt-0.5">
                                  подарунок: {p.gift_brand}
                                </div>
                              )}
                            </div>
                            <div className="mono text-[11px] flex items-center gap-2 whitespace-nowrap">
                              <span className="sk-chip sk-chip-warn">{p.unique_clients} кл.</span>
                              <span className="sk-muted">{p.total_qty.toFixed(0)} шт</span>
                              {(() => {
                                // Частка від загального факту бренд × канал у періоді.
                                // Для gift-акцій p.total_sum_usd = сума trigger-покупок у тих
                                // документах (див. fetchTriggerSums). Ділимо на факт каналу.
                                const brandFact = block.month?.total_sum_usd ?? 0;
                                if (brandFact <= 0 || p.total_sum_usd <= 0) {
                                  return <span className="sk-muted">—</span>;
                                }
                                const share = (p.total_sum_usd / brandFact) * 100;
                                return (
                                  <span
                                    className="font-bold text-[#066aab]"
                                    title={`Частка ${share.toFixed(1)}% від факту каналу у періоді`}
                                  >
                                    {share.toFixed(1)}%
                                  </span>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Overlap-розкладка */}
                          {p.overlap_with && cleanCount !== null && (
                            <div className="mt-2 pt-2 border-t border-dashed border-[rgba(6,42,61,0.10)] flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px]">
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span className="sk-muted">
                                  Чисто {p.is_gift ? 'подарунок' : 'знижка'}:
                                </span>
                                <span className="mono font-bold">{cleanCount} кл.</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                <span className="sk-muted">
                                  {p.is_gift ? 'Разом зі знижкою' : 'З подарунком'}:
                                </span>
                                <span className="mono font-bold">{p.overlap_with.clients} кл.</span>
                              </div>
                              <div className="sk-muted italic text-[10px] truncate max-w-[300px]"
                                title={`Пов'язане промо: ${p.overlap_with.name}`}>
                                ↔ {p.overlap_with.name}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

      </main>
    </>
  );
}
