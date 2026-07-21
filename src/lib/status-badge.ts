/**
 * Статус-мітка за темпом прогнозу (forecastPct) — ЄДИНЕ джерело правди для
 * Тижневого звіту РМ і Зведеного звіту РОП. Пороги: ≥100 В ПЛАНІ · 80–99 РИЗИК ·
 * <80 ВІДСТАВАННЯ. Раніше `statusBadge` жила локально у weekly-brand-card.tsx —
 * винесено щоб звіт РОП рахував «червоне» тим самим правилом, без дублювання.
 */

export type StatusTone = 'ok' | 'warn' | 'bad';

/**
 * Червоний = темп прогнозу < 80% (= бейдж ВІДСТАВАННЯ). Єдине правило «червоного»
 * для чипів червоних брендів (4.1) і секції червоних зон (4.2) у звіті РОП.
 */
export function isRed(forecastPct: number): boolean {
  return forecastPct < 80;
}

/** Тон статусу (для кольорів без прив'язки до Tailwind-класів). */
export function statusTone(forecastPct: number): StatusTone {
  if (forecastPct >= 100) return 'ok';
  if (forecastPct >= 80) return 'warn';
  return 'bad';
}

export interface StatusBadge {
  label: string;
  /** Tailwind-класи фону/бордера/тексту бейджа (як було у weekly-brand-card). */
  cls: string;
  tone: StatusTone;
}

/** Бейдж статусу за прогнозом-темпом: ≥100 В ПЛАНІ · 80–99 РИЗИК · <80 ВІДСТАВАННЯ. */
export function statusBadge(forecastPct: number): StatusBadge {
  if (forecastPct >= 100) return { label: 'В ПЛАНІ', cls: 'bg-emerald-500/12 border-emerald-300/50 text-emerald-700', tone: 'ok' };
  if (forecastPct >= 80) return { label: 'РИЗИК', cls: 'bg-amber-500/12 border-amber-300/50 text-amber-700', tone: 'warn' };
  return { label: 'ВІДСТАВАННЯ', cls: 'bg-rose-500/12 border-rose-300/50 text-rose-700', tone: 'bad' };
}
