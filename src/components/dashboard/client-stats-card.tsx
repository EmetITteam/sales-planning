'use client';

import { Users, RefreshCw, UserPlus, UserMinus, CircleSlash } from 'lucide-react';
import type { ClientCategoryStats } from '@/lib/mock-data';
import { pctOf, formatPct } from '@/lib/format';

interface ClientStatsCardProps {
  stats: ClientCategoryStats;
  /** Якщо true і stats.totalClients=0 — показуємо скелет замість чисельних 0/0. */
  loading?: boolean;
  /** Порядок появи у fade-stagger каскаді (за замовчуванням 3 — це 4-та картка hero-ряду). */
  index?: number;
}

export function ClientStatsCard({ stats, loading = false, index = 3 }: ClientStatsCardProps) {
  // Скелет лише коли реально ще нічого не отримали (totalClients=0). Якщо вже
  // є попередні дані (keepPreviousData) — показуємо їх, поки не оновляться.
  const showSkeleton = loading && stats.totalClients === 0;
  if (showSkeleton) {
    return (
      <div className="glass-card ambient-mint p-3 md:p-4 fade-stagger" style={{ ['--i' as string]: index }}>
        <div className="h-3 w-32 bg-[#f0f2f8] rounded animate-pulse mb-3" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center justify-between">
              <div className="h-3.5 w-20 bg-[#f0f2f8] rounded animate-pulse" />
              <div className="h-3.5 w-12 bg-[#f0f2f8] rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-[#f0f2f8] flex items-center justify-between">
          <div className="h-3 w-24 bg-[#f0f2f8] rounded animate-pulse" />
          <div className="h-3 w-8 bg-[#f0f2f8] rounded animate-pulse" />
        </div>
      </div>
    );
  }

  // Рядки категорій — купили / у базі + % категорії (скільки клієнтів
  // категорії купили = bought / total).
  const rows: { icon: typeof Users; color: string; label: string; cat: { total: number; bought: number } }[] = [
    { icon: Users, color: 'text-emet-blue', label: 'Активні', cat: stats.active },
    { icon: RefreshCw, color: 'text-amber-500', label: 'Сплячі', cat: stats.sleeping },
    { icon: UserMinus, color: 'text-slate-400', label: 'Втрачені', cat: stats.lost },
    { icon: UserPlus, color: 'text-emerald-500', label: 'Нові', cat: stats.newClients },
    { icon: CircleSlash, color: 'text-slate-400', label: 'Без закупок', cat: stats.none },
  ];
  const totalPct = pctOf(stats.totalBought, stats.totalClients);
  return (
    <div className="glass-card ambient-mint p-3 md:p-4 fade-stagger transition-all hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(6,42,61,0.06)]" style={{ ['--i' as string]: index }}>
      <p className="text-[11px] md:text-[12px] text-muted-foreground font-medium leading-tight">Клієнти — факт купівель</p>
      <p className="text-[10px] text-muted-foreground/70 mb-2 leading-tight">купили / у базі · % категорії</p>
      <div className="space-y-1.5">
        {rows.map(({ icon: Icon, color, label, cat }) => (
          <div key={label} className="flex items-center justify-between gap-2 text-[12px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
              <span className="font-medium truncate">{label}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-bold tabular-nums">
                <span className="text-emerald-600">{cat.bought}</span>
                <span className="text-muted-foreground/60 font-normal"> / {cat.total}</span>
              </span>
              <span className="tabular-nums font-bold text-emet-blue w-11 text-right">{formatPct(pctOf(cat.bought, cat.total))}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-[#f0f2f8] flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">Всього купили</span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="font-extrabold text-emerald-600 text-[13px] tabular-nums">
            {stats.totalBought}
            <span className="text-muted-foreground/60 font-normal text-[11px]"> / {stats.totalClients}</span>
          </span>
          <span className="tabular-nums font-bold text-emet-blue w-11 text-right text-[12px]">{formatPct(totalPct)}</span>
        </span>
      </div>
    </div>
  );
}
