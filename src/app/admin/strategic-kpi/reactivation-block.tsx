'use client';

/**
 * Блок «Акції — Реактивація категорій»
 *
 * Три категорії клієнтів (Нові / Сплячі / Втрачені), для кожної — два
 * розрізи: по бренду АБО каналу (залежить від фільтра) + по акціях.
 *
 * Данні з /api/analytics/reactivation. Класифікація на 1-е число обраного
 * місяця, як у CategoryCard.
 *
 * Створено 2026-07-02.
 */

import { useEffect, useState } from 'react';
import { Tag, TrendingUp, Moon, XCircle } from 'lucide-react';
import { CHANNEL_LABEL, type StrategicChannel } from '@/lib/strategic-kpi/brands';

interface DimRow {
  key: string;
  unique_clients: number;
  total_qty: number;
  total_sum_usd: number;
  pct_of_category: number;
}

interface CategoryOut {
  total_clients: number;
  total_sum_usd: number;
  by_dim: DimRow[];
  by_promo: DimRow[];
}

interface ApiResponse {
  period: string;
  from: string;
  to: string;
  brand: string | null;
  dim_label: 'brand' | 'channel';
  categories: {
    new: CategoryOut;
    sleeping: CategoryOut;
    lost: CategoryOut;
  };
}

interface Props {
  period: string;
}

function fmtUSD(n: number) { return `$${Math.round(n).toLocaleString('en-US')}`; }

const CATEGORY_META = {
  new:      { label: 'Нові',     dotColor: '#10b981', Icon: TrendingUp, hint: 'Вперше в базі — не купували жодного бренду до 1-го числа обраного місяця' },
  sleeping: { label: 'Сплячі',   dotColor: '#fb923c', Icon: Moon,       hint: 'Не купували 4-6 місяців (120-180 днів) до початку періоду, а тепер прокинулись' },
  lost:     { label: 'Втрачені', dotColor: '#94a3b8', Icon: XCircle,    hint: 'Не купували більше 6 місяців (>180 днів), а тепер повернулись' },
} as const;

export function ReactivationBlock({ period }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Блок навмисно НЕ фільтрує по selectedBrand — це загальний віджет
  // компанії. Показує розклад по брендах + по акціях, куди прийшли
  // клієнти категорій за обраний період.
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/reactivation?period=${encodeURIComponent(period)}`, {
      credentials: 'same-origin',
      signal: ctrl.signal,
    })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(json => { if (!ctrl.signal.aborted) setData(json as ApiResponse); })
      .catch(e => {
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message);
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [period]);

  if (loading) {
    return (
      <div className="sk-glass p-6">
        <div className="sk-lbl mb-3 flex items-center gap-1.5 text-amber-700">
          <Tag className="h-3 w-3" /> Акції — реактивація категорій
        </div>
        <div className="text-[12px] text-muted-foreground">Розрахунок…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="sk-glass p-6">
        <div className="sk-lbl mb-3 flex items-center gap-1.5 text-amber-700">
          <Tag className="h-3 w-3" /> Акції — реактивація категорій
        </div>
        <div className="text-[12px] text-rose-700">Помилка: {error ?? 'no data'}</div>
      </div>
    );
  }

  const hasAny = data.categories.new.total_sum_usd > 0
    || data.categories.sleeping.total_sum_usd > 0
    || data.categories.lost.total_sum_usd > 0;

  if (!hasAny) return null;

  const dimHeader = data.dim_label === 'channel' ? 'Канал' : 'Бренд';

  return (
    <div className="sk-glass p-6 space-y-4">
      <div>
        <div className="sk-lbl flex items-center gap-1.5 text-amber-700">
          <Tag className="h-3 w-3" /> Акції — реактивація категорій
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Клієнти по компанії у категоріях <b>Нові</b> / <b>Сплячі</b> / <b>Втрачені</b> —
          через які бренди та акції прийшли за {data.from.slice(0, 7)}.
          Класифікація станом на 1-е число обраного місяця.
        </p>
      </div>

      {(['new', 'sleeping', 'lost'] as const).map(cat => {
        const c = data.categories[cat];
        if (c.total_sum_usd === 0 && c.by_dim.length === 0 && c.by_promo.length === 0) return null;
        const meta = CATEGORY_META[cat];
        return (
          <CategorySection
            key={cat}
            label={meta.label}
            dotColor={meta.dotColor}
            hint={meta.hint}
            data={c}
            dimLabel={dimHeader}
            dimType={data.dim_label}
          />
        );
      })}
    </div>
  );
}

function CategorySection({ label, dotColor, hint, data, dimLabel, dimType }: {
  label: string; dotColor: string; hint: string;
  data: CategoryOut; dimLabel: string; dimType: 'brand' | 'channel';
}) {
  return (
    <div className="glass-card p-4" title={hint}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="w-2 h-2 rounded-full" style={{ background: dotColor }} />
        <span className="text-[11px] uppercase tracking-wider font-bold">{label}</span>
        <span className="text-[11px] text-muted-foreground">·</span>
        <span className="text-[11px] text-muted-foreground">
          <b className="mono">{data.total_clients}</b> кл. · <b className="mono">{fmtUSD(data.total_sum_usd)}</b>
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RankTable title={dimLabel} rows={data.by_dim} humanize={dimType === 'channel'} />
        <RankTable title="Акція" rows={data.by_promo} />
      </div>
    </div>
  );
}

function RankTable({ title, rows, humanize }: { title: string; rows: DimRow[]; humanize?: boolean }) {
  if (rows.length === 0) {
    return (
      <div>
        <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
        <div className="text-[11px] text-muted-foreground italic">Немає даних</div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      <div className="space-y-1">
        {rows.map(r => (
          <div key={r.key} className="flex items-center gap-2 text-[12px]">
            <div className="flex-1 min-w-0 truncate" title={r.key}>
              {humanize ? (CHANNEL_LABEL[r.key as StrategicChannel] ?? r.key) : r.key}
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-500/12 border border-amber-300/40 text-amber-800 whitespace-nowrap mono">
              {r.unique_clients} кл.
            </span>
            <span className="mono text-[11px] text-muted-foreground whitespace-nowrap">{fmtUSD(r.total_sum_usd)}</span>
            <span className="mono font-bold text-[11px] text-[#066aab] whitespace-nowrap w-11 text-right">
              {r.pct_of_category.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
