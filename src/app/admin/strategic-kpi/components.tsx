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
        {target != null && <span className="text-[13px] sk-muted font-medium ml-1">/ {fmt(target)}</span>}
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
            title="Прогноз виконання плану року на основі поточного темпу"
          >
            {fmtPct(pacePct)} прогноз
          </span>
        )}
        {forecast != null && (
          <span className="sk-muted" title="Прогноз на кінець року при збереженні темпу">
            прогн. кінець року: {isUsd ? fmtUSD(forecast) : Math.round(forecast).toLocaleString('en-US')}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CategoryCard — mini картка для категорій клієнтів у hero
// ============================================================================
export function CategoryCard({ label, value, total, hint, accent }: {
  label: string; value: number; total: number; hint: string;
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
  const numColor = { mint: '#0f766e', good: '#0f766e', warn: '#c2410c', bad: '#be123c' }[accent];
  return (
    <div
      className="rounded-xl px-3 py-2 border flex items-center justify-between gap-2"
      style={{ background: bg, borderColor: border }}
      title={hint}
    >
      <div>
        <div className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: numColor, opacity: 0.85 }}>
          {label}
        </div>
        <div className="mono font-bold text-[18px] leading-none tabular-nums mt-0.5" style={{ color: numColor }}>
          {value}
        </div>
      </div>
      <div className="mono text-[10px] font-bold whitespace-nowrap" style={{ color: numColor, opacity: 0.65 }}>
        {pct.toFixed(0)}%
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
