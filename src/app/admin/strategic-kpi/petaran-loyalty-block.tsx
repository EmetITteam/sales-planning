/** PETARAN «Фокуси / програма лояльності» — тижнева розбивка + план vs факт. */

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

function pctStatus(pct: number | null): 'good' | 'ok' | 'warn' | 'bad' | 'na' {
  if (pct == null) return 'na';
  if (pct >= 100) return 'good';
  if (pct >= 60) return 'warn';
  return 'bad';
}
const PCT_COLOR = { good: '#10b981', ok: '#5bd5bc', warn: '#f59e0b', bad: '#e11d48', na: '#94a3b8' };

export function PetaranLoyaltyBlock({ pl }: { pl: PetaranLoyalty }) {
  const [py, pm] = pl.month.split('-').map(Number);
  const monthLbl = `${MONTHS_UA[pm - 1]} ${py}`;

  const cell = (n: number) => n > 0
    ? <span className="mono tabular-nums">{n}</span>
    : <span className="text-[rgba(6,42,61,0.25)]">·</span>;

  const weekRow = (r: LoyaltyRow, accent: string) => (
    <tr key={r.key} className="border-t border-[rgba(6,42,61,0.06)]">
      <td className="py-1.5 pr-2">{r.label}</td>
      {r.weekly.map((n, i) => <td key={i} className="py-1.5 text-right tabular-nums w-10">{cell(n)}</td>)}
      <td className="py-1.5 text-right w-12"><span className="mono font-bold tabular-nums" style={{ color: accent }}>{r.total}</span></td>
    </tr>
  );

  return (
    <div className="pt-5 border-t border-[rgba(6,42,61,0.08)] space-y-4">
      <p className="sk-lbl flex items-center gap-1.5 text-[#0f766e]">
        <Award className="h-3.5 w-3.5" /> Фокуси · програма лояльності · {monthLbl}
      </p>

      {/* Тижнева розбивка */}
      <div className="sk-glass-soft rounded-2xl px-4 py-3 overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-[rgba(6,42,61,0.5)]">
              <th className="text-left font-bold pb-1">Показник</th>
              <th className="text-right font-bold pb-1 w-10">М1</th>
              <th className="text-right font-bold pb-1 w-10">М2</th>
              <th className="text-right font-bold pb-1 w-10">М3</th>
              <th className="text-right font-bold pb-1 w-10">М4</th>
              <th className="text-right font-bold pb-1 w-12">Σ</th>
            </tr>
          </thead>
          <tbody>
            {pl.funnel.map(r => weekRow(r, '#0f766e'))}
            <tr><td colSpan={6} className="pt-2 pb-0.5 text-[9px] uppercase tracking-wider font-bold text-[rgba(6,42,61,0.45)]">Рівні лояльності</td></tr>
            {pl.levels.map(r => weekRow(r, '#066aab'))}
          </tbody>
        </table>
      </div>

      {/* План vs факт (місяць) */}
      <div>
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-[rgba(6,42,61,0.6)] mb-2">
          План vs факт · {monthLbl}
        </p>
        <div className="space-y-3">
          {(['funnel', 'levels', 'reactivation'] as const).map(blk => {
            const rows = pl.plan.filter(p => p.block === blk);
            if (rows.length === 0) return null;
            return (
              <div key={blk} className="sk-glass-soft rounded-2xl px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider font-bold text-[rgba(6,42,61,0.5)] mb-1.5">{BLOCK_LBL[blk]}</p>
                <div className="space-y-1">
                  {rows.map(p => {
                    const c = PCT_COLOR[pctStatus(p.pct)];
                    return (
                      <div key={p.key} className="flex items-center gap-2 text-[12px]">
                        <span className="flex-1 min-w-0 truncate" title={p.label}>{p.label}</span>
                        <span className="mono tabular-nums text-right w-12 text-muted-foreground">{p.fact ?? '—'}</span>
                        <span className="text-[10px] text-muted-foreground">/</span>
                        <span className="mono tabular-nums text-right w-12 font-semibold">{p.target}</span>
                        <span className="mono tabular-nums text-right w-14 font-bold" style={{ color: c }}>
                          {p.pct != null ? `${p.pct}%` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 italic">
          Факт · план · % виконання. «—» у факті — показник ще не рахується автоматично (уточнюємо маркери).
        </p>
      </div>
    </div>
  );
}
