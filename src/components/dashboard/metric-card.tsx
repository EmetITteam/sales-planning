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
  /** Додатковий рядок під значенням — vs мин. міс., норма, тощо */
  caption?: ReactNode;
  /** Чи позначати value класом .amount (для маски сум) */
  isAmount?: boolean;
}

export function MetricCard({ icon, iconGradient, label, value, caption, isAmount }: MetricCardProps) {
  return (
    <div className="bg-white rounded-2xl p-3 md:p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] flex items-center gap-3">
      <div className={`flex items-center justify-center w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-gradient-to-br ${iconGradient} text-white shadow-md shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] md:text-[12px] text-muted-foreground font-medium leading-tight">{label}</p>
        <div className={`text-[20px] md:text-[22px] font-extrabold tracking-tight leading-tight mt-0.5 ${isAmount ? 'amount' : ''}`}>{value}</div>
        {caption && <div className="mt-0.5 text-[11px] leading-snug">{caption}</div>}
      </div>
    </div>
  );
}
