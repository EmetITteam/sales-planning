'use client';

/**
 * UI-примітиви для /admin/strategic-kpi.
 * Виокремлено щоб основна page.tsx не перевищувала LOC cap 800.
 */

import Link from 'next/link';
import type { ComponentType } from 'react';

// ============================================================================
// Утиліти (продубльовано для independence — page.tsx має свої версії)
// ============================================================================
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

// ============================================================================
// MetricCard
// ============================================================================
export interface MetricCardProps {
  label: string;
  Icon: ComponentType<{ size?: number }>;
  monthValue?: number | null;
  ytdValue?: number | null;
  target: number | null;
  simplePct: number | null;
  pacePct?: number | null;
  forecast?: number | null;
  isUsd?: boolean;
  isDecimal?: boolean;
}

export function MetricCard({ label, Icon, monthValue, ytdValue, target, simplePct, pacePct, forecast, isUsd, isDecimal }: MetricCardProps) {
  const value = ytdValue ?? monthValue ?? null;
  const status = statusColor(simplePct);
  const fmt = (n: number | null | undefined) => (n == null ? '—' : isUsd ? fmtUSD(n) : fmtNum(n, isDecimal));
  const barPct = simplePct == null ? 0 : Math.max(0, Math.min(100, simplePct));
  // Кольори статусу (у стилі «Огляд компанії»)
  const dot = { good: '#10b981', ok: '#5bd5bc', warn: '#fb923c', bad: '#e11d48', na: '#94a3b8' }[status];
  const barColor = { good: '#10b981', ok: '#5bd5bc', warn: '#fb923c', bad: '#e11d48', na: '#cbd5e1' }[status];

  return (
    <div className="glass-card px-3.5 pt-3 pb-3 flex flex-col">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: dot }} />
        <Icon size={12} />
        <span className="text-[10.5px] uppercase tracking-wider font-bold text-muted-foreground">{label}</span>
      </div>
      <p className="text-[26px] font-bold tabular-nums leading-none" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '-0.5px' }}>
        {fmt(value)}
        {target != null && <span className="text-[12px] text-muted-foreground font-medium ml-1" style={{ fontFamily: 'var(--font-sans)' }}>/ {fmt(target)}</span>}
      </p>
      <div className="h-1 rounded-full bg-black/5 mt-2 mb-1.5 overflow-hidden">
        {simplePct != null && (
          <div className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${barPct}%`, background: barColor }} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
        {simplePct != null ? (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full font-bold backdrop-blur-sm border"
            style={{
              background: `${barColor}20`,
              borderColor: `${barColor}66`,
              color: barColor === '#5bd5bc' ? '#0f766e' : barColor,
            }}
            title="Факт / ціль"
          >
            {fmtPct(simplePct)} від цілі
          </span>
        ) : (
          <span className="text-muted-foreground">цілі не введено</span>
        )}
        {pacePct != null && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-teal-500/12 border border-teal-300/40 text-teal-800"
            title="Прогноз виконання плану року на основі поточного темпу"
          >
            {fmtPct(pacePct)} прогноз
          </span>
        )}
        {forecast != null && (
          <span className="text-muted-foreground text-[10px]" title="Прогноз на кінець року при збереженні темпу">
            кінець року: {isUsd ? fmtUSD(forecast) : Math.round(forecast).toLocaleString('en-US')}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CategoryCard — щільна плашка для категорій клієнтів у hero.
// Layout: горизонтальний row — велике число зліва, label+% справа,
// лівий кольоровий accent-край як статус-індикатор.
// ============================================================================
export function CategoryCard({ label, value, total, hint, accent }: {
  label: string; value: number; total: number; hint: string;
  accent: 'mint' | 'good' | 'warn' | 'bad';
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const dotColor = { mint: '#10b981', good: '#10b981', warn: '#fb923c', bad: '#94a3b8' }[accent];
  const tintBg   = { mint: 'rgba(16,185,129,0.06)', good: 'rgba(16,185,129,0.06)', warn: 'rgba(251,146,60,0.07)', bad: 'rgba(148,163,184,0.06)' }[accent];
  return (
    <div
      className="glass-card relative flex items-center gap-3 pl-3.5 pr-3 py-2.5 overflow-hidden"
      title={hint}
      style={{ background: tintBg }}
    >
      <span
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
        style={{ background: dotColor }}
        aria-hidden="true"
      />
      <p
        className="text-[26px] font-bold tabular-nums leading-none min-w-[2ch]"
        style={{ fontFamily: 'var(--font-mono)', letterSpacing: '-0.5px' }}
      >
        {value}
      </p>
      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-[10.5px] uppercase tracking-[0.06em] font-bold text-muted-foreground">
          {label}
        </span>
        <span className="text-[10.5px] tabular-nums text-muted-foreground/90 mt-0.5">
          {total > 0 ? `${pct.toFixed(1)}%` : '—'}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// SeminarStatCard — для Ellanse блоку
// ============================================================================
export function SeminarStatCard({ label, period, ytd }: { label: string; period: number; ytd: number }) {
  return (
    <div className="rounded-2xl sk-glass-soft p-3.5">
      <div className="sk-lbl">{label}</div>
      <div className="mono font-bold text-[26px] leading-none mt-1.5">{period}</div>
      <div className="text-[10.5px] sk-muted mt-1">YTD: <span className="mono font-bold">{ytd}</span></div>
    </div>
  );
}

// ============================================================================
// StaticRow
// ============================================================================
export function StaticRow({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
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
// PeriodPicker — custom селектор Місяць/Квартал/Півріччя/Рік
// ============================================================================
const MONTHS_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
type PeriodKind = 'month' | 'quarter' | 'half' | 'year';

function detectKind(p: string): PeriodKind {
  if (/^\d{4}-Q[1-4]$/i.test(p)) return 'quarter';
  if (/^\d{4}-H[12]$/i.test(p)) return 'half';
  if (/^\d{4}$/.test(p)) return 'year';
  return 'month';
}

export function PeriodPicker({ period, onChange }: { period: string; onChange: (p: string) => void }) {
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
        <div className="flex gap-1 p-1 rounded-xl bg-[rgba(6,42,61,0.06)]">
          {KINDS.map(([k, lbl]) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                kind === k ? 'bg-white text-[#066aab] shadow-sm' : 'text-[rgba(6,42,61,0.58)] hover:text-[#062a3d]'
              }`}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setYear(year - 1)}
            className="w-8 h-8 rounded-lg bg-white border border-[rgba(6,42,61,0.12)] hover:bg-[rgba(6,42,61,0.04)] text-[13px] font-bold">‹</button>
          <div className="min-w-[60px] text-center mono font-bold text-[14px]">{year}</div>
          <button type="button" onClick={() => setYear(year + 1)}
            className="w-8 h-8 rounded-lg bg-white border border-[rgba(6,42,61,0.12)] hover:bg-[rgba(6,42,61,0.04)] text-[13px] font-bold">›</button>
        </div>
      </div>

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

// ============================================================================
// FirstTrainedCard — для Ellanse блоку
// ============================================================================
export function FirstTrainedCards({ period, ytd, year }: { period: number; ytd: number; year: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div
        className="rounded-2xl p-3.5 border relative"
        style={{
          background: 'linear-gradient(135deg, rgba(91,213,188,0.18) 0%, rgba(20,184,166,0.08) 100%)',
          borderColor: 'rgba(91,213,188,0.4)',
        }}
        title="Клієнти для яких Ellanse-семінарська покупка у цьому періоді — перша в історії бази (з 2022)"
      >
        <div className="sk-lbl mb-1" style={{ color: '#0f766e', opacity: 0.85 }}>За період</div>
        <div className="mono font-bold text-[26px] leading-none tabular-nums" style={{ color: '#0f766e' }}>
          {period}
        </div>
        <div className="text-[10px] mt-1" style={{ color: '#0f766e', opacity: 0.7 }}>вперше з семінаром</div>
      </div>
      <div
        className="rounded-2xl p-3.5 border relative"
        style={{
          background: 'linear-gradient(135deg, rgba(2,132,199,0.10) 0%, rgba(8,128,204,0.04) 100%)',
          borderColor: 'rgba(2,132,199,0.28)',
        }}
      >
        <div className="sk-lbl mb-1" style={{ color: '#0284c7', opacity: 0.85 }}>YTD {year}</div>
        <div className="mono font-bold text-[26px] leading-none tabular-nums" style={{ color: '#0284c7' }}>
          {ytd}
        </div>
        <div className="text-[10px] mt-1" style={{ color: '#0284c7', opacity: 0.7 }}>з початку року</div>
      </div>
    </div>
  );
}

// ============================================================================
// SkeletonHero — placeholder під час завантаження даних
// ============================================================================
export function SkeletonHero() {
  return (
    <div className="space-y-6">
      <style jsx>{`
        @keyframes skPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        @keyframes skBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @keyframes skDot {
          0%, 20% { opacity: 0.2; }
          50% { opacity: 1; }
          80%, 100% { opacity: 0.2; }
        }
        .sk-skel {
          background: linear-gradient(90deg, rgba(6,42,61,0.05) 25%, rgba(6,42,61,0.10) 50%, rgba(6,42,61,0.05) 75%);
          background-size: 200% 100%;
          animation: skPulse 1.6s ease-in-out infinite;
          border-radius: 8px;
        }
        .sk-loading-banner {
          animation: skBlink 1.4s ease-in-out infinite;
        }
        .sk-loading-dot {
          display: inline-block;
          animation: skDot 1.4s ease-in-out infinite;
        }
        .sk-loading-dot:nth-child(2) { animation-delay: 0.2s; }
        .sk-loading-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes skSpin { to { transform: rotate(360deg); } }
        .sk-spinner {
          width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid rgba(6,106,171,0.18);
          border-top-color: #066aab;
          animation: skSpin 0.85s linear infinite;
        }
      `}</style>

      {/* Banner: «Розрахунок даних...» — з крутком + мигання */}
      <div className="sk-glass px-4 py-3 flex items-center gap-3 sk-loading-banner">
        <div className="sk-spinner" />
        <div className="flex items-baseline gap-1">
          <span className="text-[13px] font-bold text-[#066aab] tracking-tight">Розрахунок даних</span>
          <span className="text-[13px] font-bold text-[#066aab]">
            <span className="sk-loading-dot">.</span>
            <span className="sk-loading-dot">.</span>
            <span className="sk-loading-dot">.</span>
          </span>
        </div>
        <span className="text-[11px] text-[#3a5570] opacity-70 ml-auto">Перше завантаження — до 15 сек, далі з кешу</span>
      </div>

      {/* Hero skeleton */}
      <div className="sk-glass p-5 relative overflow-hidden">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="sk-skel h-8 w-64" />
            <div className="sk-skel h-3.5 w-40" />
          </div>
          <div className="text-right space-y-2">
            <div className="sk-skel h-14 w-36 ml-auto" />
            <div className="sk-skel h-3 w-24 ml-auto" />
          </div>
        </div>

        <div className="mt-4 pt-3.5 border-t border-[rgba(6,42,61,0.08)]">
          <div className="sk-skel h-3 w-40 mb-2" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[0, 1, 2, 3].map(i => <div key={i} className="sk-skel h-14 rounded-xl" />)}
          </div>
        </div>
      </div>

      {/* Channels skeleton — 2 blocks */}
      {[0, 1].map(idx => (
        <div key={idx} className="sk-glass p-6 space-y-5">
          <div className="flex items-center gap-4 pb-4 border-b border-[rgba(6,42,61,0.08)]">
            <div className="sk-skel w-11 h-11 rounded-2xl" />
            <div className="flex-1 space-y-1.5">
              <div className="sk-skel h-4 w-32" />
              <div className="sk-skel h-3 w-24" />
            </div>
            <div className="sk-skel h-8 w-20" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl border border-white/60 bg-white/40 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="sk-skel w-7 h-7 rounded-lg" />
                  <div className="sk-skel h-3 w-24" />
                </div>
                <div className="sk-skel h-7 w-28" />
                <div className="sk-skel h-2 w-full rounded-full" />
                <div className="sk-skel h-4 w-32" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Re-export EllanseSeminarsLink
// ============================================================================
export function EllanseSeminarsLink() {
  return (
    <div className="rounded-2xl sk-glass-soft p-3.5 flex items-center justify-center">
      <Link href="/admin/ellanse-seminars"
        className="text-[11px] text-[#066aab] font-bold underline hover:no-underline">
        Редагувати факт →
      </Link>
    </div>
  );
}
