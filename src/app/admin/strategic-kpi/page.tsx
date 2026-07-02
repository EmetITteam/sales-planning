'use client';

/**
 * /admin/strategic-kpi — стратегічний дашборд KPI на живих даних Supabase sales.
 *
 * Портовано з public/analytics-wireframe-v3.html — cinematic glass стиль:
 * mesh background + drift blobs + Manrope 200/700 hero + JetBrains Mono numbers
 * + radial ring progress + ambient glow за статусом.
 *
 * Admin only. Створено 2026-07-02.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { AppHeader } from '@/components/layout/app-header';
import {
  STRATEGIC_BRANDS,
  CHANNEL_LABEL,
  ELLANSE_BRAND,
  isChannelActive,
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
  promos: Array<{ name: string; unique_clients: number; total_qty: number; total_sum_usd: number; is_gift: boolean; gift_brand: string | null }>;
  seminars_actual?: SeminarActual;
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
  first_trained: { period: number; ytd: number } | null;
}

const CHANNEL_ICON: Record<StrategicChannel, React.ComponentType<{ size?: number }>> = {
  representatives: Building2,
  call_center: PhoneCall,
  distributors: Truck,
};
const MONTHS_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

function statusColor(pct: number | null): 'good' | 'ok' | 'warn' | 'bad' | 'na' {
  if (pct == null) return 'na';
  if (pct >= 90) return 'good';
  if (pct >= 70) return 'ok';
  if (pct >= 50) return 'warn';
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

  const defaultPeriod = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const [period, setPeriod] = useState(defaultPeriod);
  const [selectedBrand, setSelectedBrand] = useState<StrategicBrand>('Vitaran');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (user && user.role !== 'admin') router.replace('/'); }, [user, router]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/strategic-kpi?period=${period}&brand=${encodeURIComponent(selectedBrand)}`, { credentials: 'same-origin' })
      .then(r => r.json())
      .then((s: ApiResponse & { error?: string }) => {
        if (s.error) throw new Error(s.error);
        setData(s);
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [period, selectedBrand]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [user, load]);

  const brandBlocks = useMemo(
    () => data?.blocks.filter(b => b.brand === selectedBrand) ?? [],
    [data, selectedBrand],
  );

  // Гарний label періоду з урахуванням kind
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

  // % виконання плану бренду:
  //   Ключова метрика — «Купують у місяць» (buyers_monthly_pct). Це те що
  //   найкраще відображає «як ми виконуємо план по бренду за період».
  //   Якщо monthly даних для періоду немає (напр. майбутній місяць) — null.
  //
  //   Раніше усереднювали 4 метрики — але це давало 3179% коли одна з них
  //   була нерепрезентативна (напр. ср/уп для 0 клієнтів → NaN → сумарно
  //   абсурдно).
  const brandExecution = useMemo(() => {
    const pcts: number[] = [];
    for (const b of brandBlocks) {
      // Тільки якщо є факт і ціль — beремо buyers_monthly_pct
      if (b.month?.unique_clients && b.execution.buyers_monthly_pct != null) {
        pcts.push(b.execution.buyers_monthly_pct);
      }
    }
    return pcts.length ? pcts.reduce((s, p) => s + p, 0) / pcts.length : null;
  }, [brandBlocks]);

  if (!user || user.role !== 'admin') return null;

  return (
    <>
      {/* Google Fonts: Manrope 200/700 + JetBrains Mono */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@200;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
      />

      {/* Cinematic v3 styles — inline щоб не «протікали» на решту застосунку */}
      <style jsx global>{`
        .sk-page { font-family: 'Manrope', sans-serif; color: #062a3d; position: relative; min-height: 100vh; }
        .sk-page .num, .sk-page .mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; letter-spacing: -0.5px; }
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
        .sk-hero-title { font-family: 'Manrope', sans-serif; font-weight: 200; font-size: 44px; letter-spacing: -1.5px; line-height: 1.05; }
        .sk-hero-title strong { font-weight: 700; }
        .sk-mega-pct { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 82px; letter-spacing: -3px; line-height: 1; font-variant-numeric: tabular-nums; }
        .sk-metric-num { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 26px; letter-spacing: -0.5px; line-height: 1; font-variant-numeric: tabular-nums; }
        .sk-brand-pill { padding: 10px 16px; border-radius: 16px; font-weight: 700; font-size: 13px; letter-spacing: -0.2px; transition: all 0.2s; cursor: pointer; border: 1px solid rgba(6,42,61,0.08); background: rgba(255,255,255,0.5); color: rgba(6,42,61,0.58); }
        .sk-brand-pill:hover { transform: translateY(-1px); background: rgba(255,255,255,0.75); color: #062a3d; }
        .sk-brand-pill.active { background: linear-gradient(135deg, #066aab 0%, #0284c7 100%); color: white; border-color: transparent; box-shadow: 0 4px 14px rgba(6,106,171,0.35); }
        .sk-brand-pill.active:hover { transform: translateY(-1px); }
        .sk-ambient-good  { background: linear-gradient(135deg, rgba(20,184,166,0.14) 0%, rgba(91,213,188,0.06) 100%); border-color: rgba(20,184,166,0.28); }
        .sk-ambient-ok    { background: linear-gradient(135deg, rgba(2,132,199,0.10) 0%, rgba(8,128,204,0.04) 100%); border-color: rgba(2,132,199,0.22); }
        .sk-ambient-warn  { background: linear-gradient(135deg, rgba(251,146,60,0.12) 0%, rgba(251,146,60,0.04) 100%); border-color: rgba(251,146,60,0.28); }
        .sk-ambient-bad   { background: linear-gradient(135deg, rgba(225,29,72,0.10) 0%, rgba(225,29,72,0.03) 100%); border-color: rgba(225,29,72,0.24); }
        .sk-ambient-na    { background: rgba(255,255,255,0.42); border-color: rgba(255,255,255,0.8); }
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
            <div className="sk-lbl mb-2">Бренд</div>
            <div className="flex flex-wrap gap-2">
              {STRATEGIC_BRANDS.map(b => (
                <button key={b} type="button" onClick={() => setSelectedBrand(b)}
                  className={`sk-brand-pill ${b === selectedBrand ? 'active' : ''}`}>
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="sk-glass p-4 border-l-4 border-rose-500 text-[13px] text-rose-700">
            <strong>Помилка:</strong> {error}
          </div>
        )}
        {loading && <div className="sk-glass p-6 text-[13px] sk-muted">Завантажую метрики…</div>}
        {!loading && !error && brandBlocks.length === 0 && (
          <div className="sk-glass p-6 text-[13px] sk-muted">
            Нема даних для <strong>{selectedBrand}</strong> у {periodLabel}.
            Введи таргети у <Link href="/admin/strategic-targets" className="text-emet-blue underline">/admin/strategic-targets</Link>.
          </div>
        )}

        {/* Hero */}
        {!loading && brandBlocks.length > 0 && (
          <div className="sk-glass p-8 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none opacity-40" style={{
              background: 'radial-gradient(circle at 85% 20%, rgba(91,213,188,0.22) 0%, transparent 60%)',
            }} />
            <div className="relative flex items-start justify-between gap-6 flex-wrap">
              <div>
                <div className="sk-hero-title">
                  <strong>{selectedBrand}</strong> <span className="sk-muted">·</span> <span className="sk-muted font-light">{periodLabel}</span>
                </div>
                {m > 0 && (
                  <div className="text-[12px] sk-muted mt-3 flex items-center gap-3">
                    <span>По {m}-му місяцю з 12</span>
                    <span className="text-[rgba(6,42,61,0.24)]">·</span>
                    <span><span className="mono font-bold">{Math.round((m / 12) * 100)}%</span> року пройшло</span>
                  </div>
                )}
              </div>
              {brandExecution !== null && (
                <div className="text-right">
                  <div className={`sk-mega-pct sk-text-${statusColor(brandExecution)}`}>{brandExecution.toFixed(1)}%</div>
                  <div className="sk-lbl mt-2">% виконання плану</div>
                </div>
              )}
            </div>

            {/* Категорії клієнтів (для selected brand) */}
            {data?.categories && (
              <div className="relative mt-6 pt-5 border-t border-[rgba(6,42,61,0.08)]">
                <div className="sk-lbl mb-3">Клієнти бренду у періоді</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <CategoryCard
                    label="Нові"
                    value={data.categories.new}
                    total={data.categories.total}
                    hint="Ніколи не купували цей бренд до цього періоду"
                    accent="mint"
                  />
                  <CategoryCard
                    label="Активні"
                    value={data.categories.active}
                    total={data.categories.total}
                    hint="Купували цей бренд ≤ 4 міс. до періоду"
                    accent="good"
                  />
                  <CategoryCard
                    label="Сплячі"
                    value={data.categories.sleeping}
                    total={data.categories.total}
                    hint="Купували 4-6 міс. тому"
                    accent="warn"
                  />
                  <CategoryCard
                    label="Втрачені"
                    value={data.categories.lost}
                    total={data.categories.total}
                    hint="Не купували > 6 міс."
                    accent="bad"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Channel blocks */}
        {!loading && brandBlocks.map(block => {
          const channel = block.channel as StrategicChannel;
          if (!isChannelActive(selectedBrand, channel)) return null;
          const Icon = CHANNEL_ICON[channel];
          const overallPct = block.execution.buyers_monthly_pct;
          const overallStatus = statusColor(overallPct);

          return (
            <div key={block.channel} className="sk-glass p-6 space-y-5">
              <div className="flex items-center gap-4 pb-4 border-b border-[rgba(6,42,61,0.08)]">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0284c7] text-white flex items-center justify-center shadow-lg shadow-[rgba(6,106,171,0.25)]">
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <h3 className="text-[16px] font-bold tracking-tight">{CHANNEL_LABEL[channel]}</h3>
                  {!block.target && (
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Таргети не введено · <Link href="/admin/strategic-targets" className="underline">Ввести</Link>
                    </p>
                  )}
                </div>
                {overallPct !== null && (
                  <div className="text-right">
                    <div className={`num text-[28px] font-bold leading-none sk-text-${overallStatus}`}>{fmtPct(overallPct)}</div>
                    <div className="sk-lbl mt-1">Виконання</div>
                  </div>
                )}
              </div>

              {/* 4 KPI-картки */}
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
                  ytdValue={block.ytd?.avg_check_usd ?? null}
                  target={block.target?.avg_check_annual ?? null}
                  simplePct={block.execution.avg_check_annual_pct}
                  isUsd
                />
              </div>

              {/* ELLANSE Дистриб'ютори — навчання (план + факт семінарів) */}
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
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <SeminarStatCard
                          label="Разом семінарів"
                          period={block.seminars_actual.period.seminars_held}
                          ytd={block.seminars_actual.ytd.seminars_held}
                        />
                        <SeminarStatCard
                          label="Разом обучено"
                          period={block.seminars_actual.period.new_trained}
                          ytd={block.seminars_actual.ytd.new_trained}
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
                              <div className="grid grid-cols-2 gap-2 text-[12px]">
                                <div>
                                  <div className="sk-muted text-[10px]">Семінарів (період)</div>
                                  <div className="mono font-bold text-[18px]">{loc.period.seminars_held}</div>
                                  <div className="sk-muted text-[10px]">YTD: {loc.ytd.seminars_held}</div>
                                </div>
                                <div>
                                  <div className="sk-muted text-[10px]">Обучено (період)</div>
                                  <div className="mono font-bold text-[18px]">{loc.period.new_trained || '—'}</div>
                                  <div className="sk-muted text-[10px]">YTD: {loc.ytd.new_trained || '—'}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* План (річні цілі) */}
                  {block.target ? (
                    <div>
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-[rgba(6,42,61,0.65)] mb-2">
                        План на рік {data?.year}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
                        <StaticRow label="Нових обучених у рік, план" value={block.target.new_trained_annual} />
                        <StaticRow label="Провести навчань у рік, план" value={block.target.trainings_annual}
                          suffix={block.target.trainings_repeat ? `(+${block.target.trainings_repeat} повт.)` : ''} />
                        <StaticRow label="Конверсія → повторні, %" value={block.target.conversion_repeat_pct} />
                        <StaticRow label="Утримання у міс., план" value={block.target.retention_monthly} />
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11.5px] sk-muted italic">
                      Цілі не введено. <Link href="/admin/strategic-targets" className="text-emet-blue underline">Ввести</Link>.
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
                    {block.promos.map(p => (
                      <div key={p.name} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl sk-glass-soft text-[12px]">
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
                          <span className="font-bold">{fmtUSD(p.total_sum_usd)}</span>
                        </div>
                      </div>
                    ))}
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

interface MetricCardProps {
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  monthValue?: number | null;
  ytdValue?: number | null;
  target: number | null;
  simplePct: number | null;
  pacePct?: number | null;
  forecast?: number | null;
  isUsd?: boolean;
  isDecimal?: boolean;
}
function MetricCard({ label, Icon, monthValue, ytdValue, target, simplePct, pacePct, forecast, isUsd, isDecimal }: MetricCardProps) {
  const value = ytdValue ?? monthValue ?? null;
  const status = statusColor(simplePct);
  const fmt = (n: number | null | undefined) => (n == null ? '—' : isUsd ? fmtUSD(n) : fmtNum(n, isDecimal));
  const barPct = simplePct == null ? 0 : Math.max(0, Math.min(100, simplePct));

  return (
    <div className={`sk-ambient-${status} border rounded-2xl p-4 relative`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-white/60 border border-white/80 flex items-center justify-center text-[#066aab]">
          <Icon size={14} />
        </div>
        <div className="sk-lbl">{label}</div>
      </div>
      <div className="sk-metric-num mb-1">
        {fmt(value)}
        {target != null && (
          <span className="text-[13px] sk-muted font-medium ml-1">/ {fmt(target)}</span>
        )}
      </div>
      <div className="sk-progress-track mb-2">
        {simplePct != null && <div className={`sk-progress-fill ${status}`} style={{ width: `${barPct}%` }} />}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
        {simplePct != null ? (
          <span className={`sk-chip sk-chip-${status}`} title="Факт / ціль">{fmtPct(simplePct)} від цілі</span>
        ) : (
          <span className="sk-muted">цілі не введено</span>
        )}
        {pacePct != null && (
          <span
            className="sk-chip sk-chip-ok"
            title="Прогноз виконання плану року на основі поточного темпу. Наприклад: якщо річна ціль 1000, зараз червень (6 з 12) → очікуємо 500. Факт 656 → 131% (перевиконуємо темп)."
          >
            {fmtPct(pacePct)} прогноз
          </span>
        )}
        {forecast != null && (
          <span className="sk-muted" title="Прогноз на кінець року при збереженні темпу">
            прогноз на рік: {isUsd ? fmtUSD(forecast) : Math.round(forecast).toLocaleString('en-US')}
          </span>
        )}
      </div>
    </div>
  );
}

function CategoryCard({
  label, value, total, hint, accent,
}: {
  label: string;
  value: number;
  total: number;
  hint: string;
  accent: 'mint' | 'good' | 'warn' | 'bad';
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const bg = {
    mint: 'linear-gradient(135deg, rgba(91,213,188,0.16) 0%, rgba(20,184,166,0.06) 100%)',
    good: 'linear-gradient(135deg, rgba(20,184,166,0.14) 0%, rgba(91,213,188,0.06) 100%)',
    warn: 'linear-gradient(135deg, rgba(251,146,60,0.14) 0%, rgba(251,146,60,0.05) 100%)',
    bad:  'linear-gradient(135deg, rgba(225,29,72,0.12) 0%, rgba(225,29,72,0.04) 100%)',
  }[accent];
  const border = {
    mint: 'rgba(91,213,188,0.35)',
    good: 'rgba(20,184,166,0.32)',
    warn: 'rgba(251,146,60,0.32)',
    bad:  'rgba(225,29,72,0.30)',
  }[accent];
  const numColor = {
    mint: '#0f766e',
    good: '#0f766e',
    warn: '#c2410c',
    bad:  '#be123c',
  }[accent];
  return (
    <div
      className="rounded-2xl p-3.5 border relative"
      style={{ background: bg, borderColor: border }}
      title={hint}
    >
      <div className="sk-lbl mb-1.5" style={{ color: numColor, opacity: 0.85 }}>{label}</div>
      <div className="mono font-bold text-[26px] leading-none tabular-nums" style={{ color: numColor }}>
        {value}
      </div>
      <div className="text-[10.5px] mt-1" style={{ color: numColor, opacity: 0.7 }}>
        {pct.toFixed(1)}% від разом
      </div>
    </div>
  );
}

function SeminarStatCard({ label, period, ytd }: { label: string; period: number; ytd: number }) {
  return (
    <div className="rounded-2xl sk-glass-soft p-3.5">
      <div className="sk-lbl">{label}</div>
      <div className="mono font-bold text-[26px] leading-none mt-1.5">{period}</div>
      <div className="text-[10.5px] sk-muted mt-1">YTD: <span className="mono font-bold">{ytd}</span></div>
    </div>
  );
}

function StaticRow({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="flex justify-between items-baseline px-3 py-2 rounded-xl sk-glass-soft">
      <span className="sk-muted text-[11.5px]">{label}</span>
      <span className="mono font-bold text-[13px]">
        {value ?? '—'}
        {suffix && <span className="text-[10px] sk-muted ml-1 font-normal">{suffix}</span>}
      </span>
    </div>
  );
}

// ============================================================================
// PeriodPicker — custom селектор Місяць/Квартал/Півріччя/Рік у стилі v3
// ============================================================================
type PeriodKind = 'month' | 'quarter' | 'half' | 'year';

function detectKind(p: string): PeriodKind {
  if (/^\d{4}-Q[1-4]$/i.test(p)) return 'quarter';
  if (/^\d{4}-H[12]$/i.test(p)) return 'half';
  if (/^\d{4}$/.test(p)) return 'year';
  return 'month';
}

function PeriodPicker({ period, onChange }: { period: string; onChange: (p: string) => void }) {
  const kind = detectKind(period);
  const year = Number(period.slice(0, 4));

  const setKind = (k: PeriodKind) => {
    const now = new Date();
    const yr = year || now.getFullYear();
    if (k === 'month') {
      const m = kind === 'month' ? Number(period.slice(5, 7)) : now.getMonth() + 1;
      onChange(`${yr}-${String(m).padStart(2, '0')}`);
    } else if (k === 'quarter') {
      const q = kind === 'quarter' ? Number(period.slice(-1)) : Math.floor(now.getMonth() / 3) + 1;
      onChange(`${yr}-Q${q}`);
    } else if (k === 'half') {
      const h = kind === 'half' ? Number(period.slice(-1)) : now.getMonth() < 6 ? 1 : 2;
      onChange(`${yr}-H${h}`);
    } else {
      onChange(`${yr}`);
    }
  };

  const setYear = (yr: number) => {
    if (kind === 'month') onChange(`${yr}-${period.slice(5, 7)}`);
    else if (kind === 'quarter' || kind === 'half') onChange(`${yr}${period.slice(4)}`);
    else onChange(`${yr}`);
  };

  const KINDS: Array<[PeriodKind, string]> = [
    ['month', 'Місяць'], ['quarter', 'Квартал'], ['half', 'Півріччя'], ['year', 'Рік'],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="sk-lbl">Період</div>
        {/* Segment control */}
        <div className="flex gap-1 p-1 rounded-xl bg-[rgba(6,42,61,0.06)]">
          {KINDS.map(([k, lbl]) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                kind === k
                  ? 'bg-white text-[#066aab] shadow-sm'
                  : 'text-[rgba(6,42,61,0.58)] hover:text-[#062a3d]'
              }`}>
              {lbl}
            </button>
          ))}
        </div>
        {/* Рік */}
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setYear(year - 1)}
            className="w-8 h-8 rounded-lg bg-white border border-[rgba(6,42,61,0.12)] hover:bg-[rgba(6,42,61,0.04)] text-[13px] font-bold">‹</button>
          <div className="min-w-[60px] text-center mono font-bold text-[14px]">{year}</div>
          <button type="button" onClick={() => setYear(year + 1)}
            className="w-8 h-8 rounded-lg bg-white border border-[rgba(6,42,61,0.12)] hover:bg-[rgba(6,42,61,0.04)] text-[13px] font-bold">›</button>
        </div>
      </div>

      {/* Sub-selector */}
      {kind === 'month' && <MonthSubPicker period={period} onChange={onChange} />}
      {kind === 'quarter' && <SegmentPicker
        options={[['Q1', 'Q1 · січ-бер'], ['Q2', 'Q2 · квіт-чер'], ['Q3', 'Q3 · лип-вер'], ['Q4', 'Q4 · жов-гру']]}
        value={period.slice(-2)} onChange={v => onChange(`${year}-${v}`)}
      />}
      {kind === 'half' && <SegmentPicker
        options={[['H1', 'І півріччя · січ-чер'], ['H2', 'ІІ півріччя · лип-гру']]}
        value={period.slice(-2)} onChange={v => onChange(`${year}-${v}`)}
      />}
    </div>
  );
}

function MonthSubPicker({ period, onChange }: { period: string; onChange: (p: string) => void }) {
  const currentMonth = Number(period.slice(5, 7));
  const year = period.slice(0, 4);
  const SHORT = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];
  return (
    <div className="flex flex-wrap gap-1">
      {SHORT.map((name, i) => {
        const m = i + 1;
        const active = m === currentMonth;
        return (
          <button key={m} type="button"
            onClick={() => onChange(`${year}-${String(m).padStart(2, '0')}`)}
            className={`px-2 py-1 rounded-md text-[10.5px] font-bold uppercase tracking-wider transition-all ${
              active
                ? 'bg-gradient-to-br from-[#066aab] to-[#0284c7] text-white shadow-sm'
                : 'bg-white/60 border border-[rgba(6,42,61,0.08)] text-[rgba(6,42,61,0.55)] hover:text-[#062a3d] hover:bg-white'
            }`}>
            {name}
          </button>
        );
      })}
    </div>
  );
}

function SegmentPicker({ options, value, onChange }: { options: Array<[string, string]>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, lbl]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-all ${
            value === v
              ? 'bg-gradient-to-br from-[#066aab] to-[#0284c7] text-white shadow-md shadow-[rgba(6,106,171,0.3)]'
              : 'bg-white/60 border border-[rgba(6,42,61,0.08)] text-[rgba(6,42,61,0.65)] hover:text-[#062a3d] hover:bg-white'
          }`}>
          {lbl}
        </button>
      ))}
    </div>
  );
}
