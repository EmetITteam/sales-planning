import { cn } from '@/lib/utils';

/**
 * <StatChip> — приглушений чіп-пілл зі значенням (метрики під шапкою бренду:
 * Прогноз / Заплановано / Мин. міс.). Опційна кольорова крапка зліва.
 *
 * Клас-комбо винесено 1:1 з weekly-brand-card (`Chip`), без зміни вигляду. Той
 * самий сірий пілл (`bg-[#f5f7fb] border-[#e8ecf5]`) читається як на еталонних
 * бордах, тож звіт РОП і Тижневий звіт використовують один примітив.
 */
export function StatChip({ dot, className, children }: {
  dot?: 'amber' | 'blue';
  className?: string;
  children: React.ReactNode;
}) {
  const dotCls = dot === 'amber' ? 'bg-amber-500' : dot === 'blue' ? 'bg-emet-blue' : '';
  return (
    <span className={cn('inline-flex items-center gap-1 h-6 px-2 rounded-md bg-[#f5f7fb] border border-[#e8ecf5]', className)}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotCls)} />}
      <span>{children}</span>
    </span>
  );
}
