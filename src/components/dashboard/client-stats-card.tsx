'use client';

import { Users, RefreshCw, UserPlus } from 'lucide-react';
import type { ClientCategoryStats } from '@/lib/mock-data';

interface ClientStatsCardProps {
  stats: ClientCategoryStats;
}

export function ClientStatsCard({ stats }: ClientStatsCardProps) {
  return (
    <div className="bg-white rounded-2xl p-3 md:p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
      <p className="text-[11px] md:text-[12px] text-muted-foreground font-medium mb-2 leading-tight">Клієнти — факт купівель</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[12px]">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-[#066aab]" />
            <span className="font-medium">Активні</span>
          </div>
          <span className="font-bold">
            <span className="text-emerald-600">{stats.active.bought}</span>
            <span className="text-muted-foreground/60 font-normal"> / {stats.active.total}</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <div className="flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5 text-amber-500" />
            <span className="font-medium">Сплячі</span>
          </div>
          <span className="font-bold">
            <span className="text-emerald-600">{stats.sleeping.bought}</span>
            <span className="text-muted-foreground/60 font-normal"> / {stats.sleeping.total}</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <div className="flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5 text-emerald-500" />
            <span className="font-medium">Нові</span>
          </div>
          <span className="font-bold">
            <span className="text-emerald-600">{stats.newClients.bought}</span>
            <span className="text-muted-foreground/60 font-normal"> / {stats.newClients.total}</span>
          </span>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-[#f0f2f8] flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">Всього купили</span>
        <span className="font-extrabold text-emerald-600 text-[13px]">{stats.totalBought}</span>
      </div>
    </div>
  );
}
