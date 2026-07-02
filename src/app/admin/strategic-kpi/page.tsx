'use client';

/**
 * /admin/strategic-kpi — стратегічний дашборд KPI на живих даних Supabase sales.
 *
 * Логіка:
 *   - Обираєш період (місяць) + бренд
 *   - GET /api/analytics/strategic-kpi?period=YYYY-MM
 *   - Показуємо hero + 2-3 канали з мет picture: план / факт / %
 *   - Промо блок знизу (топ-5 акцій цього місяця)
 *
 * Візуал — портовано з public/analytics-wireframe-v3.html
 * (glass, Manrope + JetBrains Mono, ambient glow).
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
  STRATEGIC_CHANNELS,
  CHANNEL_LABEL,
  ELLANSE_BRAND,
  isChannelActive,
  type StrategicBrand,
  type StrategicChannel,
} from '@/lib/strategic-kpi/brands';
import {
  ArrowLeft,
  BarChart3,
  Loader2,
  AlertCircle,
  Users,
  Calendar,
  Package,
  DollarSign,
  Building2,
  PhoneCall,
  Truck,
  Tag,
  Sparkles,
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
  month: {
    unique_clients: number;
    total_qty: number;
    total_sum_usd: number;
    avg_qty_per_client: number;
    avg_check_usd: number;
  } | null;
  ytd: {
    unique_clients: number;
    total_sum_usd: number;
    avg_check_usd: number;
  } | null;
  execution: {
    buyers_monthly_pct: number | null;
    avg_qty_per_client_pct: number | null;
    unique_clients_simple_pct: number | null;
    unique_clients_pace_pct: number | null;
    unique_clients_forecast: number | null;
    avg_check_annual_pct: number | null;
  };
  promos: Array<{
    name: string;
    unique_clients: number;
    total_qty: number;
    total_sum_usd: number;
    is_gift: boolean;
    gift_brand: string | null;
  }>;
}

interface ApiResponse {
  period: string;
  year: number;
  monthIndex: number;
  monthPace: number;
  blocks: Block[];
  counts: {
    month_rows: number;
    ytd_rows: number;
    promos: number;
    targets: number;
  };
}

const CHANNEL_ICON: Record<StrategicChannel, React.ComponentType<{ className?: string }>> = {
  representatives: Building2,
  call_center: PhoneCall,
  distributors: Truck,
};

const MONTHS_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

function statusColor(pct: number | null): 'good' | 'ok' | 'warn' | 'bad' | 'na' {
  if (pct === null) return 'na';
  if (pct >= 90) return 'good';
  if (pct >= 70) return 'ok';
  if (pct >= 50) return 'warn';
  return 'bad';
}

function fmtUSD(n: number) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function fmtPct(n: number | null) {
  if (n === null) return '—';
  return `${n.toFixed(1)}%`;
}

export default function StrategicKpiPage() {
  const router = useRouter();
  const { user } = useAppStore();

  // За замовчуванням — попередній повний місяць
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

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/strategic-kpi?period=${period}`, { credentials: 'same-origin' })
      .then(r => r.json())
      .then((s: ApiResponse & { error?: string }) => {
        if (s.error) throw new Error(s.error);
        setData(s);
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    // load() робить fetch → setState — це imperative завантаження при mount/period-change,
    // не sync-ефект з зовнішнім стейтом. Правило react-hooks/set-state-in-effect тут не застосовне.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [user, load]);

  const brandBlocks = useMemo(
    () => data?.blocks.filter(b => b.brand === selectedBrand) ?? [],
    [data, selectedBrand],
  );
  const [y, m] = period.split('-').map(Number);
  const periodLabel = m ? `${MONTHS_UA[m - 1]} ${y}` : period;

  // Overall % бренда — середнє з двох каналів по місячному ключовому KPI
  const brandExecution = useMemo(() => {
    const pcts: number[] = [];
    for (const b of brandBlocks) {
      if (b.execution.buyers_monthly_pct !== null) pcts.push(b.execution.buyers_monthly_pct);
    }
    if (pcts.length === 0) return null;
    return pcts.reduce((s, p) => s + p, 0) / pcts.length;
  }, [brandBlocks]);

  if (!user || user.role !== 'admin') return null;

  return (
    <>
      <AppHeader />
      <main className="p-5 max-w-6xl mx-auto space-y-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Адмін-панель
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emet-blue to-emet-blue-light text-white flex items-center justify-center shadow-lg shadow-emet-blue/20">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Стратегічні показники</h1>
            <p className="text-[12px] text-muted-foreground">
              Виконання річних і місячних цілей KPI · дані з sales таблиці (Supabase)
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="glass-card p-4 flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Період</label>
            <input
              type="month"
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="h-9 px-3 text-[13px] rounded-xl border border-[#e8ebf4] bg-[#fafbfe] font-semibold"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Бренд</label>
            <div className="flex flex-wrap gap-1.5">
              {STRATEGIC_BRANDS.map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setSelectedBrand(b)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                    b === selectedBrand
                      ? 'bg-emet-blue text-white shadow-lg shadow-emet-blue/20'
                      : 'bg-[#f4f7fb] text-muted-foreground hover:bg-[#e8ebf4]'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
          {data && (
            <div className="text-[11px] text-muted-foreground">
              <p><span className="font-mono">{data.counts.month_rows.toLocaleString('en-US')}</span> рядків місяця</p>
              <p><span className="font-mono">{data.counts.ytd_rows.toLocaleString('en-US')}</span> YTD</p>
            </div>
          )}
        </div>

        {error && (
          <div className="glass-card p-4 border-l-4 border-rose-500 flex items-start gap-2.5 text-[13px]">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-bold text-rose-700">Помилка</p>
              <p className="text-rose-700">{error}</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="glass-card p-6 flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Завантажую метрики…
          </div>
        )}

        {!loading && !error && brandBlocks.length === 0 && (
          <div className="glass-card p-6 text-[13px] text-muted-foreground">
            Нема даних для <strong>{selectedBrand}</strong> у {periodLabel}.
            Введи таргети у <Link href="/admin/strategic-targets" className="text-emet-blue underline">/admin/strategic-targets</Link>
            {' '}або перевір що backfill sales пройшов.
          </div>
        )}

        {!loading && brandBlocks.length > 0 && (
          <>
            {/* Hero */}
            <div className="glass-card p-6 relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none opacity-30" style={{
                background: 'radial-gradient(circle at 80% 20%, rgba(91,213,188,0.15) 0%, transparent 60%)',
              }} />
              <div className="relative flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-[32px] font-extralight tracking-[-1px] leading-none">
                    <span className="font-bold text-emet-blue">{selectedBrand}</span>
                    {' · '}
                    <span className="text-muted-foreground">{periodLabel}</span>
                  </h2>
                  <p className="text-[12px] text-muted-foreground mt-2">
                    Місяць {m} з 12 · pace {Math.round((m / 12) * 100)}% від року
                  </p>
                </div>
                {brandExecution !== null && (
                  <div className="text-right">
                    <div className={`font-mono text-[48px] font-bold tabular-nums leading-none tracking-[-1.5px] ${
                      brandExecution >= 90 ? 'text-emerald-600' : brandExecution >= 70 ? 'text-sky-600' :
                      brandExecution >= 50 ? 'text-amber-600' : 'text-rose-600'
                    }`}>{brandExecution.toFixed(1)}%</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mt-1">
                      Місячне виконання
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Channel blocks */}
            {brandBlocks.map(block => {
              const channel = block.channel as StrategicChannel;
              const Icon = CHANNEL_ICON[channel];
              if (!isChannelActive(selectedBrand, channel)) return null;

              return (
                <div key={block.channel} className="glass-card p-5 space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-[#e2e7ef]">
                    <div className="w-9 h-9 rounded-xl bg-emet-50 flex items-center justify-center text-emet-blue">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-[14px] font-bold uppercase tracking-wider text-emet-blue">{CHANNEL_LABEL[channel]}</h3>
                      {!block.target && (
                        <p className="text-[10px] text-amber-700 mt-0.5">
                          Таргети не введено. <Link href="/admin/strategic-targets" className="underline">Ввести</Link>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Метрики */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <MetricCard
                      label="Унікальні за рік"
                      icon={<Users className="h-3.5 w-3.5" />}
                      ytdValue={block.ytd?.unique_clients ?? null}
                      target={block.target?.unique_clients_annual ?? null}
                      simplePct={block.execution.unique_clients_simple_pct}
                      pacePct={block.execution.unique_clients_pace_pct}
                      forecast={block.execution.unique_clients_forecast ?? null}
                    />
                    <MetricCard
                      label="Купують у місяць"
                      icon={<Calendar className="h-3.5 w-3.5" />}
                      monthValue={block.month?.unique_clients ?? null}
                      target={block.target?.buyers_monthly ?? null}
                      simplePct={block.execution.buyers_monthly_pct}
                    />
                    <MetricCard
                      label="ср/уп на клієнта"
                      icon={<Package className="h-3.5 w-3.5" />}
                      monthValue={block.month?.avg_qty_per_client ?? null}
                      target={block.target?.avg_qty_per_client ?? null}
                      simplePct={block.execution.avg_qty_per_client_pct}
                      isDecimal
                    />
                    <MetricCard
                      label="Середній чек"
                      icon={<DollarSign className="h-3.5 w-3.5" />}
                      ytdValue={block.ytd?.avg_check_usd ?? null}
                      target={block.target?.avg_check_annual ?? null}
                      simplePct={block.execution.avg_check_annual_pct}
                      isUsd
                    />
                  </div>

                  {/* ELLANSE навчання */}
                  {selectedBrand === ELLANSE_BRAND && block.target && (
                    <div className="pt-4 border-t border-dashed border-[#e2e7ef]">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-3 flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3" /> Навчання (тільки ELLANSE)
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
                        <StaticRow label="Нових обучених у рік" value={block.target.new_trained_annual} />
                        <StaticRow label="Провести навчань у рік" value={block.target.trainings_annual} suffix={block.target.trainings_repeat ? `(+${block.target.trainings_repeat} повт.)` : ''} />
                        <StaticRow label="Конверсія → повторні, %" value={block.target.conversion_repeat_pct} />
                        <StaticRow label="Утримання у міс." value={block.target.retention_monthly} />
                      </div>
                    </div>
                  )}

                  {/* Промо */}
                  {block.promos.length > 0 && (
                    <div className="pt-4 border-t border-[#e2e7ef]">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-3 flex items-center gap-1.5">
                        <Tag className="h-3 w-3" /> Активні промо · топ-5 за клієнтами
                      </p>
                      <div className="space-y-2">
                        {block.promos.map(p => (
                          <div key={p.name} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-amber-50/50 border border-amber-200/60 text-[12px]">
                            <div className="flex-1 font-medium">
                              {p.name}
                              {p.is_gift && p.gift_brand && (
                                <span className="ml-2 text-[10px] text-amber-700 font-bold uppercase tracking-wider">
                                  подарунок: {p.gift_brand}
                                </span>
                              )}
                            </div>
                            <div className="font-mono tabular-nums text-muted-foreground">
                              <span className="font-bold text-amber-700">{p.unique_clients}</span> кл. ·
                              {' '}<span>{p.total_qty}</span> шт ·
                              {' '}<span>{fmtUSD(p.total_sum_usd)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </main>
    </>
  );
}

interface MetricCardProps {
  label: string;
  icon: React.ReactNode;
  monthValue?: number | null;
  ytdValue?: number | null;
  target: number | null;
  simplePct: number | null;
  pacePct?: number | null;
  forecast?: number | null;
  isUsd?: boolean;
  isDecimal?: boolean;
}

function MetricCard({ label, icon, monthValue, ytdValue, target, simplePct, pacePct, forecast, isUsd, isDecimal }: MetricCardProps) {
  const displayValue = ytdValue ?? monthValue ?? null;
  const status = statusColor(simplePct);
  const statusBg = {
    good: 'bg-emerald-50/60 border-emerald-200/60',
    ok:   'bg-sky-50/60 border-sky-200/60',
    warn: 'bg-amber-50/60 border-amber-200/60',
    bad:  'bg-rose-50/60 border-rose-200/60',
    na:   'bg-white/60 border-slate-200/60',
  }[status];

  const fmt = (n: number | null) => {
    if (n === null) return '—';
    if (isUsd) return fmtUSD(n);
    if (isDecimal) return n.toFixed(1);
    return String(Math.round(n));
  };

  return (
    <div className={`rounded-xl border p-3.5 ${statusBg}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-emet-blue">{icon}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</span>
      </div>
      <div className="font-mono tabular-nums font-bold text-[22px] leading-none tracking-[-0.5px] mb-1">
        {fmt(displayValue)}
        {target !== null && (
          <span className="text-[13px] text-muted-foreground/70 font-normal ml-1">/ {fmt(target)}</span>
        )}
      </div>
      <div className="text-[10.5px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium">
        {simplePct !== null ? (
          <>
            <span className={`font-bold ${
              status === 'good' ? 'text-emerald-700' :
              status === 'ok' ? 'text-sky-700' :
              status === 'warn' ? 'text-amber-700' : 'text-rose-700'
            }`}>{fmtPct(simplePct)}</span>
            <span>прост.</span>
          </>
        ) : (
          <span>цілі не введено</span>
        )}
        {pacePct != null && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span>темп {fmtPct(pacePct)}</span>
          </>
        )}
        {forecast != null && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span>прогн. {isUsd ? fmtUSD(forecast) : Math.round(forecast)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function StaticRow({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="flex justify-between items-baseline px-3 py-2 rounded-lg bg-white/50 border border-white/70">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums font-bold text-[13px]">
        {value ?? '—'}
        {suffix && <span className="text-[10px] text-muted-foreground ml-1 font-normal">{suffix}</span>}
      </span>
    </div>
  );
}
