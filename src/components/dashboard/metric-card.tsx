'use client';

import type { ReactNode } from 'react';

interface MetricCardProps {
  /** Іконка-блок (зазвичай lucide icon, велика — рендериться як watermark) */
  icon: ReactNode;
  /**
   * Tailwind text-color клас для приглушеної watermark-іконки.
   * Наприклад 'text-[#066aab]' або 'text-emerald-500'.
   * Прозорість додається через /10 у компоненті.
   */
  iconColor: string;
  /** Підпис над значенням */
  label: string;
  /** Основне значення — node, бо може бути JSX (наприклад % з відхиленням) */
  value: ReactNode;
  /** Додатковий рядок під значенням — vs мин. міс., норма, тощо */
  caption?: ReactNode;
  /** Чи позначати value класом .amount (для маски сум) */
  isAmount?: boolean;
}

/**
 * Карта метрики у стилі watermark — велика приглушена іконка в куті як декор,
 * текст ліворуч компактно. Один шаблон для топ-блоку всіх дашбордів.
 */
export function MetricCard({ icon, iconColor, label, value, caption, isAmount }: MetricCardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden min-h-[110px] flex flex-col">
      {/* Watermark-іконка: справа, по центру вертикально, приглушена. Розмір 28*4=112px */}
      <div className={`absolute right-3 top-1/2 -translate-y-1/2 ${iconColor} opacity-10 pointer-events-none [&>svg]:h-28 [&>svg]:w-28`}>
        {icon}
      </div>

      {/* Контент: label прибитий до верху, value+caption центруються в решті простору */}
      <div className="relative flex-1 flex flex-col">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <div className="flex-1 flex flex-col justify-center mt-2">
          <div className={`text-[24px] font-extrabold tracking-tight tabular-nums leading-none ${isAmount ? 'amount' : ''}`}>
            {value}
          </div>
          {caption && <div className="mt-1.5 text-[11px] leading-snug">{caption}</div>}
        </div>
      </div>
    </div>
  );
}
