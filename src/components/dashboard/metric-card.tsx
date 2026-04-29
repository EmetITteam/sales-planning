'use client';

import type { ReactNode } from 'react';

interface MetricCardProps {
  /** Іконка-блок (зазвичай lucide icon) */
  icon: ReactNode;
  /** Tailwind gradient classes для іконки, наприклад 'from-emerald-500 to-teal-600' */
  iconGradient: string;
  /** Підпис над значенням */
  label: string;
  /** Основне значення — node, бо може бути JSX (наприклад % з відхиленням) */
  value: ReactNode;
  /** Додатковий рядок під значенням — vs мин. міс., норма, тощо. БЕЗ flex всередині! */
  caption?: ReactNode;
  /** Чи позначати value класом .amount (для маски сум) */
  isAmount?: boolean;
}

/**
 * Уніфікована метрик-карточка для топ-блоку всіх дашбордів.
 * Layout: іконка ліворуч біля title (по верху, не по центру всієї картки),
 * label uppercase tracking-wider, value великий моно, caption inline-блок.
 */
export function MetricCard({ icon, iconGradient, label, value, caption, isAmount }: MetricCardProps) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] flex items-start gap-3 min-h-[88px]">
      <div className={`flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br ${iconGradient} text-white shadow-md shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider leading-none">{label}</p>
        <div className={`text-[22px] font-extrabold tracking-tight leading-none mt-1.5 tabular-nums ${isAmount ? 'amount' : ''}`}>
          {value}
        </div>
        {caption && <div className="mt-1.5 text-[11px] leading-snug">{caption}</div>}
      </div>
    </div>
  );
}
