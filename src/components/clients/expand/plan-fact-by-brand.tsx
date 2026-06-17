import { useMemo } from 'react';
import { SEGMENTS } from '@/lib/mock-data';
import {
  canonicalSegmentCode,
  cleanBrandName,
  UA_MONTHS,
} from '../client-helpers';

/**
 * Per-brand розбивка План × Факт × Викон. для розгорнутого клієнта.
 *
 * Об'єднує бренди з planByClient[clientId].brands (наш Supabase) та
 * factByClient[clientId].brands (1С getSalesFact). Для кожного бренду:
 *  - План  > 0 + Факт > 0   → нормальний рядок зі статусом
 *  - План  > 0 + Факт = 0   → 🔥 «не куплено» (треба дзвонити)
 *  - План = 0 + Факт > 0    → ⚡ «купив без плану»
 *
 * Sort: спочатку рядки з планом, далі купівлі без плану.
 *
 * Виокремлено з clients-page.tsx (Day 5 рефактору).
 */

const BRAND_NAMES: Record<string, string> = Object.fromEntries(SEGMENTS.map(s => [s.code, s.name]));

interface BrandRowData {
  code: string;
  name: string;
  plan: number;
  fact: number;
  pct: number | null;
  status: 'ok' | 'warn' | 'bad' | 'unplanned';
}

export function PlanFactByBrand({
  planBrands,
  factBrands,
}: {
  planBrands: Record<string, number>;
  factBrands: Record<string, number>;
}) {
  // Нормалізуємо коди (ДРУГИЕ ТМ → OTHER тощо) і агрегуємо суми.
  const normalizedPlan = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(planBrands)) {
      const c = canonicalSegmentCode(k);
      out[c] = (out[c] ?? 0) + (Number(v) || 0);
    }
    return out;
  }, [planBrands]);
  const normalizedFact = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(factBrands)) {
      const c = canonicalSegmentCode(k);
      out[c] = (out[c] ?? 0) + (Number(v) || 0);
    }
    return out;
  }, [factBrands]);

  const allCodes = useMemo(() => {
    const set = new Set<string>([...Object.keys(normalizedPlan), ...Object.keys(normalizedFact)]);
    return Array.from(set);
  }, [normalizedPlan, normalizedFact]);

  const rows = useMemo(() => {
    return allCodes.map(code => {
      const plan = normalizedPlan[code] ?? 0;
      const fact = normalizedFact[code] ?? 0;
      const pct = plan > 0 ? (fact / plan) * 100 : null;
      const status: 'ok' | 'warn' | 'bad' | 'unplanned' =
        plan === 0 && fact > 0 ? 'unplanned'
        : plan > 0 && fact === 0 ? 'bad'
        : pct !== null && pct >= 80 ? 'ok'
        : 'warn';
      return {
        code,
        name: cleanBrandName(BRAND_NAMES[code] || code),
        plan,
        fact,
        pct,
        status,
      };
    }).sort((a, b) => {
      const plannedA = a.plan > 0 ? 0 : 1;
      const plannedB = b.plan > 0 ? 0 : 1;
      if (plannedA !== plannedB) return plannedA - plannedB;
      return (b.plan + b.fact) - (a.plan + a.fact);
    });
  }, [allCodes, normalizedPlan, normalizedFact]);

  if (rows.length === 0) {
    return (
      <div>
        <PlanFactHeader rowsCount={0} />
        <p className="text-[12px] text-muted-foreground">
          Для цього клієнта на поточний місяць нема ні плану, ні фактичних закупівель.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PlanFactHeader rowsCount={rows.length} />
      <div className="space-y-1.5">
        {rows.map(r => (
          <PlanFactBrandRow key={r.code} row={r} />
        ))}
      </div>
    </div>
  );
}

/**
 * Заголовок блока: дата-зріз факту + примітка про поточний місяць.
 */
function PlanFactHeader({ rowsCount }: { rowsCount: number }) {
  const d = new Date();
  const today = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  const monthLabel = `${UA_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return (
    <div className="mb-2">
      <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
        План × Факт цього місяця по брендах{rowsCount > 0 ? ` · ${rowsCount}` : ''}
      </h3>
      <p className="text-[10px] text-muted-foreground/80 mt-1 leading-snug">
        Факт станом на <span className="font-semibold text-foreground tabular-nums">{today}</span>
        {' · '}поточний місяць ({monthLabel}). Кнопка <strong>LIVE</strong> у хедері змінює тільки швидкість оновлення — діапазон даних завжди «з 1-го по сьогодні».
      </p>
    </div>
  );
}

function PlanFactBrandRow({ row }: { row: BrandRowData }) {
  const { name, plan, fact, pct, status } = row;
  const STATUS_META = {
    ok:        { dot: 'bg-emerald-500',  label: 'Виконано',           pillBg: 'bg-emerald-500/12 border border-emerald-300/40 text-emerald-700 backdrop-blur-sm' },
    warn:      { dot: 'bg-amber-500',    label: 'В роботі',           pillBg: 'bg-amber-500/12 border border-amber-300/40 text-amber-700 backdrop-blur-sm' },
    bad:       { dot: 'bg-rose-500',     label: '🔥 Без закупівлі',   pillBg: 'bg-rose-500/12 border border-rose-300/40 text-rose-700 backdrop-blur-sm' },
    unplanned: { dot: 'bg-violet-500',   label: '⚡ Поза плануванням', pillBg: 'bg-violet-500/12 border border-violet-300/40 text-violet-700 backdrop-blur-sm' },
  } as const;
  const meta = STATUS_META[status];
  const pctClass = pct === null ? 'text-muted-foreground/40'
    : pct >= 100 ? 'text-emerald-700'
    : pct >= 80 ? 'text-emerald-600'
    : pct >= 50 ? 'text-amber-600'
    : 'text-rose-600';

  const planStr = plan > 0 ? `$${Math.round(plan).toLocaleString('en-US')}` : '—';
  const factStr = fact > 0 ? `$${Math.round(fact).toLocaleString('en-US')}` : '$0';
  const pctStr = pct === null ? '—' : `${pct.toFixed(0)}%`;

  return (
    <div className="glass-card-soft p-3">
      {/* MOBILE: inline-row — dot+brand+chip зверху, дані inline нижче. */}
      <div className="md:hidden">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot}`} />
          <span className="font-semibold text-[13px] truncate flex-1 min-w-0">{name}</span>
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold leading-none whitespace-nowrap ${meta.pillBg}`}>
            {meta.label}
          </span>
        </div>
        <div className="pl-[18px] text-[11px] flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-muted-foreground">План</span>
          <span className={`font-mono font-bold tabular-nums text-[12px] amount ${plan === 0 ? 'text-muted-foreground/40' : ''}`}>{planStr}</span>
          <span className="text-muted-foreground/30">·</span>
          <span className="text-muted-foreground">Факт</span>
          <span className={`font-mono font-bold tabular-nums text-[12px] amount ${fact === 0 ? 'text-muted-foreground/40' : ''}`}>{factStr}</span>
          <span className="text-muted-foreground/30">·</span>
          <span className={`font-mono font-bold tabular-nums text-[12px] ${pctClass}`}>{pctStr}</span>
        </div>
      </div>

      {/* DESKTOP */}
      <div className="hidden md:grid grid-cols-[12px_minmax(160px,1fr)_110px_110px_75px_150px] gap-3 items-center">
        <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
        <div className="font-semibold text-[13px] truncate">{name}</div>
        <div className="text-right">
          <p className="text-[9px] uppercase text-muted-foreground font-semibold">План</p>
          <p className={`font-mono font-bold tabular-nums text-[12px] mt-0.5 amount ${plan === 0 ? 'text-muted-foreground/40' : ''}`}>{planStr}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase text-muted-foreground font-semibold">Факт</p>
          <p className={`font-mono font-bold tabular-nums text-[12px] mt-0.5 amount ${fact === 0 ? 'text-muted-foreground/40' : ''}`}>{factStr}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase text-muted-foreground font-semibold">Викон.</p>
          <p className={`font-mono font-bold tabular-nums text-[12px] mt-0.5 ${pctClass}`}>{pctStr}</p>
        </div>
        <div className="flex justify-end">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold leading-none whitespace-nowrap ${meta.pillBg}`}>
            {meta.label}
          </span>
        </div>
      </div>
    </div>
  );
}
