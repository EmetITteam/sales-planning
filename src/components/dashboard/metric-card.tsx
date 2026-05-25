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
  /**
   * Розмір watermark-іконки. За замовчуванням 'lg' (112px) — для 4-колонкових layout-ів.
   * Використовуй 'md' (96px) для 5-колонкових (РМ/Директор), щоб іконка не давила.
   */
  iconSize?: 'md' | 'lg';
}

/**
 * Карта метрики у стилі watermark — велика приглушена іконка в куті як декор,
 * текст ліворуч компактно. Один шаблон для топ-блоку всіх дашбордів.
 */
export function MetricCard({ icon, iconColor, label, value, caption, isAmount, iconSize = 'lg' }: MetricCardProps) {
  // Розмір SVG + позиція справа. Для md (вузькі чіпи РМ/Директор) зміщуємо правіше
  // (-right-4) так щоб частина іконки виходила за край картки — overflow-hidden зріже,
  // а текст ліворуч матиме більше повітря.
  // md (вузькі чіпи 5-кол): 64px впритул до правого краю, не виходить за межі
  // lg (широкі чіпи 4-кол): 112px з невеликим відступом
  const sizeClass = iconSize === 'md' ? '[&>svg]:h-16 [&>svg]:w-16' : '[&>svg]:h-28 [&>svg]:w-28';
  const positionClass = iconSize === 'md' ? 'right-2' : 'right-3';
  return (
    <div className="glass-card p-5 relative overflow-hidden min-h-[110px] flex flex-col transition-all hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(6,42,61,0.06)]">
      {/* Watermark-іконка: справа, по центру вертикально, приглушена */}
      <div className={`absolute ${positionClass} top-1/2 -translate-y-1/2 ${iconColor} opacity-15 pointer-events-none ${sizeClass}`}>
        {icon}
      </div>

      {/* Контент: label прибитий до верху, value+caption центруються в решті простору */}
      <div className="relative flex-1 flex flex-col">
        <div className="flex items-center gap-2">
          <span className={`pulse-dot w-1.5 h-1.5 rounded-full ${iconColor.replace('text-', 'bg-')} shadow-[0_0_6px_currentColor] ${iconColor}`} />
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        </div>
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
