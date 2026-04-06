'use client';

import type { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  badge?: { value: string; positive: boolean } | null;
  icon: ReactNode;
  iconBg: string;
}

export function MetricCard({ title, value, subtitle, badge, icon, iconBg }: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl border border-border/50 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${iconBg}`}>
            {icon}
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-xl font-bold tracking-tight mt-0.5">{value}</p>
          </div>
        </div>
        {badge && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            badge.positive
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'
          }`}>
            {badge.value}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-[11px] text-muted-foreground mt-2">{subtitle}</p>
      )}
    </div>
  );
}
