import { statusBadge } from '@/lib/status-badge';
import { cn } from '@/lib/utils';

/**
 * <PerfBadge> — бейдж статусу за темпом прогнозу (В ПЛАНІ · РИЗИК · ВІДСТАВАННЯ).
 * ЄДИНИЙ рендер для Тижневого звіту (шапка бренду) і Зведеного звіту РОП, щоб
 * «червоне»/пороги були однакові скрізь. Логіка/пороги — у `lib/status-badge`.
 *
 * Клас-комбо винесено 1:1 з weekly-brand-card (шапка бренду), без зміни вигляду.
 */
export function PerfBadge({ forecastPct, className }: { forecastPct: number; className?: string }) {
  const badge = statusBadge(forecastPct);
  return (
    <span className={cn('px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border whitespace-nowrap', badge.cls, className)}>
      {badge.label}
    </span>
  );
}
