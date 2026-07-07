/** PETARAN «Фокуси / програма лояльності» — факт vs план по показниках.
 *  Картки у стилі MetricCard борду (glass-card + status-tint + status-бар + чип). */

import { Award } from 'lucide-react';

export interface LoyaltyRow {
  key: string;
  label: string;
  weekly: [number, number, number, number];  // М1 М2 М3 М4
  total: number;
}
export interface PetaranLoyalty {
  month: string;   // 'YYYY-MM'
  funnel: LoyaltyRow[];
  levels: LoyaltyRow[];
  plan: Array<{
    block: string; key: string; label: string; order: number;
    goal: number | null; conversion_pct: number | null; reactivation_base: number | null;
    target: number; fact: number | null; pct: number | null;
  }>;
}

const MONTHS_UA = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const BLOCK_LBL: Record<string, string> = { funnel: 'Воронка · нові клієнти', levels: 'Рівні лояльності', reactivation: 'Реактивація' };

// Status-палітра — та сама що у MetricCard борду (колір за % виконання).
type Status = 'good' | 'warn' | 'bad' | 'na';
const PALETTE: Record<Status, { dot: string; label: string; bar: string; tint: string }> = {
  good: { dot: '#10b981', label: '#0f766e', bar: '#10b981', tint: 'rgba(16,185,129,0.06)' },
  warn: { dot: '#fb923c', label: '#c2410c', bar: '#fb923c', tint: 'rgba(251,146,60,0.06)' },
  bad:  { dot: '#e11d48', label: '#be123c', bar: '#e11d48', tint: 'rgba(225,29,72,0.05)' },
  na:   { dot: '#94a3b8', label: '#64748b', bar: '#cbd5e1', tint: 'rgba(148,163,184,0.05)' },
};
function statusOf(pct: number | null): Status {
  if (pct == null) return 'na';
  if (pct >= 100) return 'good';
  if (pct >= 60) return 'warn';
  return 'bad';
}

function IndicatorCard({ label, fact, target, pct, weekly }: {
  label: string; fact: number | null; target: number; pct: number | null;
  weekly?: [number, number, number, number];
}) {
  const p = PALETTE[statusOf(pct)];
  const barPct = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const hasFact = fact != null;
  const showWeekly = hasFact && weekly && weekly.some(w => w > 0);
  return (
    <div className="glass-card p-4 flex flex-col" style={{ background: p.tint }}>
      <div className="flex items-start gap-1.5 mb-2 min-h-[30px]">
        <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: p.dot }} />
        <span className="text-[10.5px] uppercase tracking-[0.05em] font-bold leading-tight" style={{ color: p.label }}>{label}</span>
      </div>
      <p className="text-[28px] font-bold tabular-nums leading-none" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '-0.5px' }}>
        {hasFact ? fact : '—'}
        <span className="text-[12px] text-muted-foreground font-medium ml-1.5" style={{ fontFamily: 'var(--font-sans)' }}>
          / {target} <span className="text-[9px] uppercase tracking-wide">план</span>
        </span>
      </p>
      <div className="h-1.5 rounded-full bg-black/5 mt-3 mb-2 overflow-hidden">
        {pct != null && (
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${barPct}%`, background: p.bar }} />
        )}
      </div>
      <div className="mt-auto text-[10.5px]">
        {pct != null ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full font-bold border"
            style={{ background: `${p.bar}18`, borderColor: `${p.bar}55`, color: p.label }} title="Факт / план">
            {pct.toFixed(1)}% від плану
          </span>
        ) : (
          <span className="text-muted-foreground italic">факт ще не рахується</span>
        )}
        {showWeekly && (
          <div className="flex gap-3 mt-2 pt-2 border-t border-[rgba(6,42,61,0.07)]" title="Розподіл нових клієнтів по тижнях місяця">
            {(['М1', 'М2', 'М3', 'М4'] as const).map((w, i) => (
              <span key={w} className="flex flex-col items-center leading-none">
                <span className="text-[8.5px] uppercase tracking-wide text-muted-foreground/70">{w}</span>
                <span className="text-[12px] font-bold tabular-nums mt-0.5" style={{ fontFamily: 'var(--font-mono)', color: weekly![i] > 0 ? '#062a3d' : 'rgba(6,42,61,0.25)' }}>{weekly![i]}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PetaranLoyaltyBlock({ pl }: { pl: PetaranLoyalty }) {
  const [py, pm] = pl.month.split('-').map(Number);
  const monthLbl = `${MONTHS_UA[pm - 1]} ${py}`;

  // key → тижневий факт.
  const weeklyByKey: Record<string, [number, number, number, number]> = {};
  for (const r of [...pl.funnel, ...pl.levels]) weeklyByKey[r.key] = r.weekly;

  return (
    <div className="pt-5 border-t border-[rgba(6,42,61,0.08)] space-y-5">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-[rgba(6,42,61,0.65)] flex items-center gap-1.5">
        <Award className="h-3.5 w-3.5 text-[#0f766e]" /> Фокуси · програма лояльності · {monthLbl}
      </p>

      {(['funnel', 'levels', 'reactivation'] as const).map(blk => {
        // Ховаємо порожні картки — де немає ні факту, ні плану на цей місяць.
        const rows = pl.plan.filter(p => p.block === blk && !(p.target === 0 && p.fact == null));
        if (rows.length === 0) return null;
        const base = rows.find(r => r.reactivation_base)?.reactivation_base;
        return (
          <div key={blk}>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-[rgba(6,42,61,0.55)] mb-2.5">
              {BLOCK_LBL[blk]}
              {blk === 'reactivation' && base ? <span className="ml-2 text-muted-foreground normal-case font-medium tracking-normal">база {base}</span> : null}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {rows.map(p => (
                <IndicatorCard key={p.key} label={p.label} fact={p.fact} target={p.target} pct={p.pct} weekly={weeklyByKey[p.key]} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
