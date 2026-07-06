/** PETARAN «Фокуси / програма лояльності» — картковий вигляд:
 *  факт + тижневі мікро-бари (М1-М4) + прогрес до місячного плану. */

import { Award } from 'lucide-react';

export interface LoyaltyRow {
  key: string;
  label: string;
  weekly: [number, number, number, number];
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
const BLOCK_ACCENT: Record<string, string> = { funnel: '#0f766e', levels: '#066aab', reactivation: '#e0803c' };
// Медальні акценти рівнів.
const LEVEL_ACCENT: Record<string, string> = {
  level_standard: '#0f766e', level_bronze: '#cd7f32', level_silver: '#8f9bb3', level_gold: '#e0a80a',
};
const WK = ['М1', 'М2', 'М3', 'М4'];

function pctStatus(pct: number | null): 'good' | 'warn' | 'bad' | 'na' {
  if (pct == null) return 'na';
  if (pct >= 100) return 'good';
  if (pct >= 60) return 'warn';
  return 'bad';
}
const PCT_COLOR = { good: '#10b981', warn: '#f59e0b', bad: '#e11d48', na: '#94a3b8' };

function MicroBars({ weekly, color }: { weekly: [number, number, number, number]; color: string }) {
  const max = Math.max(1, ...weekly);
  return (
    <div className="flex items-end gap-1.5 h-9">
      {weekly.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${WK[i]}: ${v}`}>
          <div
            className="w-full rounded-t-[3px] transition-all"
            style={{ height: `${6 + (v / max) * 24}px`, background: v > 0 ? color : 'rgba(6,42,61,0.10)' }}
          />
          <span className="text-[8.5px] text-[rgba(6,42,61,0.4)] tabular-nums leading-none">{v > 0 ? v : ''}</span>
        </div>
      ))}
    </div>
  );
}

function IndicatorCard({ p, weekly, accent }: {
  p: PetaranLoyalty['plan'][number];
  weekly?: [number, number, number, number];
  accent: string;
}) {
  const hasFact = p.fact != null;
  const pc = PCT_COLOR[pctStatus(p.pct)];
  return (
    <div
      className="sk-glass-soft rounded-2xl p-3.5 flex flex-col gap-2.5 transition-transform hover:-translate-y-0.5"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="text-[10px] uppercase tracking-wider font-bold text-[rgba(6,42,61,0.55)] leading-tight min-h-[26px]">
        {p.label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="mono font-bold text-[26px] leading-none tabular-nums" style={{ color: hasFact ? '#062a3d' : 'rgba(6,42,61,0.3)' }}>
          {hasFact ? p.fact : '—'}
        </span>
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">/ {p.target} <span className="text-[9px] uppercase tracking-wide">план</span></span>
        {p.pct != null && (
          <span className="ml-auto mono font-bold text-[13px] tabular-nums" style={{ color: pc }}>{p.pct}%</span>
        )}
      </div>
      {hasFact && weekly ? (
        <>
          <MicroBars weekly={weekly} color={accent} />
          <div className="h-1.5 rounded-full bg-[rgba(6,42,61,0.08)] overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, p.pct ?? 0)}%`, background: pc }} />
          </div>
        </>
      ) : (
        <div className="text-[10px] text-muted-foreground italic mt-auto">факт ще не рахується автоматично</div>
      )}
    </div>
  );
}

export function PetaranLoyaltyBlock({ pl }: { pl: PetaranLoyalty }) {
  const [py, pm] = pl.month.split('-').map(Number);
  const monthLbl = `${MONTHS_UA[pm - 1]} ${py}`;

  // key → тижневий факт (для мікро-барів).
  const weeklyByKey: Record<string, [number, number, number, number]> = {};
  for (const r of [...pl.funnel, ...pl.levels]) weeklyByKey[r.key] = r.weekly;

  return (
    <div className="pt-5 border-t border-[rgba(6,42,61,0.08)] space-y-5">
      <p className="sk-lbl flex items-center gap-1.5 text-[#0f766e]">
        <Award className="h-3.5 w-3.5" /> Фокуси · програма лояльності · {monthLbl}
      </p>

      {(['funnel', 'levels', 'reactivation'] as const).map(blk => {
        const rows = pl.plan.filter(p => p.block === blk);
        if (rows.length === 0) return null;
        const base = rows.find(r => r.reactivation_base)?.reactivation_base;
        return (
          <div key={blk}>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-1 h-4 rounded-full" style={{ background: BLOCK_ACCENT[blk] }} />
              <p className="text-[11px] uppercase tracking-wider font-bold text-[rgba(6,42,61,0.6)]">{BLOCK_LBL[blk]}</p>
              {blk === 'reactivation' && base ? (
                <span className="text-[10px] text-muted-foreground">база {base}</span>
              ) : null}
            </div>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(198px, 1fr))' }}>
              {rows.map(p => (
                <IndicatorCard
                  key={p.key}
                  p={p}
                  weekly={weeklyByKey[p.key]}
                  accent={LEVEL_ACCENT[p.key] ?? BLOCK_ACCENT[blk]}
                />
              ))}
            </div>
          </div>
        );
      })}

      <p className="text-[10px] text-muted-foreground italic flex items-center gap-3 flex-wrap">
        <span>Велике число — факт за місяць · «/ N план» — місячна ціль · % виконання</span>
        <span>Бари — розподіл по тижнях М1-М4</span>
      </p>
    </div>
  );
}
