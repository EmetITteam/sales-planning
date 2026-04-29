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
    <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden min-h-[110px]">
      {/* Watermark-іконка: справа, по центру вертикально, приглушена */}
      <div className={`absolute right-3 top-1/2 -translate-y-1/2 ${iconColor} opacity-10 pointer-events-none`}>
        <div className="w-20 h-20 flex items-center justify-center">
          {/* Іконка має натягнутися через CSS — даємо їй розмір через wrapper */}
          <div className="[&>svg]:w-full [&>svg]:h-full">{icon}</div>
        </div>
      </div>

      {/* Контент */}
      <div className="relative">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <div className={`text-[24px] font-extrabold tracking-tight tabular-nums leading-none mt-2 ${isAmount ? 'amount' : ''}`}>
          {value}
        </div>
        {caption && <div className="mt-1.5 text-[11px] leading-snug">{caption}</div>}
      </div>
    </div>
  );
}
