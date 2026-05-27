'use client';

import type { ReactNode } from 'react';

interface MetricCardProps {
  /** @deprecated watermark прибрано; prop лишається для backward compat. */
  icon?: ReactNode;
  /**
   * Tailwind text-color клас для colored dot-маркера у label.
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
  /** @deprecated watermark прибрано; prop лишається для backward compat. */
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
  iconColor,
  label,
  value,
  caption,
  isAmount,
  valueSize = 'md',
  valuePrefix,
  index,
  trailing,
}: MetricCardProps) {
  const valueClass = valueSize === 'lg'
    ? 'text-[36px] font-bold tracking-[-1px] tabular-nums leading-none'
    : 'text-[24px] font-extrabold tracking-tight tabular-nums leading-none';
  const prefixClass = valueSize === 'lg'
    ? 'text-[22px] font-medium text-muted-foreground align-top mr-0.5'
    : 'text-[14px] font-medium text-muted-foreground align-top mr-0.5';

  // Layout: label / value / caption-trailing — простий flex з gap-3 (БЕЗ
  // justify-between). justify-between розводив контент по краях → великі
  // цифри стрибали залежно від обсягу caption/trailing внизу. Тепер всі
  // hero-картки на дашбордах мають великі цифри на одній вертикальній лінії.
  const baseCls = 'glass-card p-5 relative flex flex-col gap-3 transition-all hover:-translate-y-px hover:shadow-[0_8px_30px_rgba(6,42,61,0.06)]';
  const cls = index !== undefined ? `${baseCls} fade-stagger` : baseCls;
  const style = index !== undefined ? { ['--i' as string]: index } : undefined;

  return (
    <div className={cls} style={style}>
      {/* TOP: dot + label */}
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${iconColor.replace('text-', 'bg-')} shadow-[0_0_6px_currentColor] ${iconColor}`} />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      </div>

      {/* MIDDLE: великий $-номер */}
      <div className={`${valueClass} ${isAmount ? 'amount' : ''}`}>
        {valuePrefix && <span className={prefixClass}>{valuePrefix}</span>}
        {value}
      </div>

      {/* BOTTOM: caption + trailing (delta-pill). Якщо обидва пусті — нічого не рендеримо. */}
      {(caption || trailing) && (
        <div className="flex flex-col gap-2">
          {caption && <div className="text-[11px] leading-snug">{caption}</div>}
          {trailing && <div>{trailing}</div>}
        </div>
      )}
    </div>
  );
}
