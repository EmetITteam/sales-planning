'use client';

import type { ReactNode } from 'react';

interface MetricCardProps {
  /** Іконка-блок (lucide icon, рендериться як watermark праворуч) */
  icon: ReactNode;
  /**
   * Tailwind text-color клас для приглушеної watermark-іконки та dot-маркера у label.
   * Наприклад 'text-emet-blue' або 'text-emerald-500'.
   */
  iconColor: string;
  /** Підпис над значенням */
  label: string;
  /** Основне значення — node, бо може бути JSX (% з відхиленням, count-up, etc.) */
  value: ReactNode;
  /** Додатковий рядок під значенням — vs мин. міс., норма, тощо */
  caption?: ReactNode;
  /** Чи позначати value класом .amount (для маски сум) */
  isAmount?: boolean;
  /**
   * Розмір watermark-іконки. За замовчуванням 'lg' (112px) — для 4-колонкових layout-ів.
   * 'md' (64px) — для 5-колонкових (РМ/Директор), щоб іконка не давила.
   */
  iconSize?: 'md' | 'lg';
  /**
   * Розмір основного значення:
   *  - md (24px) — стандарт
   *  - lg (36px) — cinematic-варіант для топ-Hero (4-кол. на Огляді/Планувані)
   */
  valueSize?: 'md' | 'lg';
  /** Префікс перед value (типово '$'), рендериться меншим superscript-стилем */
  valuePrefix?: string;
  /**
   * Для fade-stagger каскаду — порядок появи (0,1,2,3,...).
   * Якщо undefined — без анімації появи (поведінка за замовчуванням).
   */
  index?: number;
  /** Опційний slot нижче caption — типово delta-pill (↑/↓ vs мин.міс.) */
  trailing?: ReactNode;
}

/**
 * Карта метрики у стилі watermark — велика приглушена іконка в куті як декор,
 * текст ліворуч компактно. Уніфікований шаблон Hero для всіх дашбордів
 * (Огляд + Планування). Підтримує два розміри значення (md/lg) і fade-stagger
 * для cinematic-feel на топовому ряду.
 */
export function MetricCard({
  icon,
  iconColor,
  label,
  value,
  caption,
  isAmount,
  iconSize = 'lg',
  valueSize = 'md',
  valuePrefix,
  index,
  trailing,
}: MetricCardProps) {
  const sizeClass = iconSize === 'md' ? '[&>svg]:h-16 [&>svg]:w-16' : '[&>svg]:h-28 [&>svg]:w-28';
  const positionClass = iconSize === 'md' ? 'right-2' : 'right-3';
  const valueClass = valueSize === 'lg'
    ? 'text-[36px] font-bold tracking-[-1px] tabular-nums leading-none'
    : 'text-[24px] font-extrabold tracking-tight tabular-nums leading-none';
  const prefixClass = valueSize === 'lg'
    ? 'text-[22px] font-medium text-muted-foreground align-top mr-0.5'
    : 'text-[14px] font-medium text-muted-foreground align-top mr-0.5';

  const baseCls = 'glass-card p-5 relative overflow-hidden min-h-[110px] flex flex-col transition-all hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(6,42,61,0.06)]';
  const cls = index !== undefined ? `${baseCls} fade-stagger` : baseCls;
  const style = index !== undefined ? { ['--i' as string]: index } : undefined;

  return (
    <div className={cls} style={style}>
      {/* Watermark-іконка: справа, по центру вертикально, приглушена */}
      <div className={`absolute ${positionClass} top-1/2 -translate-y-1/2 ${iconColor} opacity-10 pointer-events-none ${sizeClass}`}>
        {icon}
      </div>

      {/* Контент: label прибитий до верху, value+caption центруються в решті простору */}
      <div className="relative flex-1 flex flex-col">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${iconColor.replace('text-', 'bg-')} shadow-[0_0_6px_currentColor] ${iconColor}`} />
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        </div>
        <div className="flex-1 flex flex-col justify-center mt-2">
          <div className={`${valueClass} ${isAmount ? 'amount' : ''}`}>
            {valuePrefix && <span className={prefixClass}>{valuePrefix}</span>}
            {value}
          </div>
          {caption && <div className="mt-1.5 text-[11px] leading-snug">{caption}</div>}
          {trailing && <div className="mt-2">{trailing}</div>}
        </div>
      </div>
    </div>
  );
}
