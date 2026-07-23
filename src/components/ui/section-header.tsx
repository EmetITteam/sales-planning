import { cn } from '@/lib/utils';

/**
 * <SectionHeader> — шапка секції всередині `glass-card overflow-hidden`:
 * (опц.) номер-бейдж регламенту + назва зліва, підказка/контроли справа,
 * (опц.) опис-підрядок нижче.
 *
 * Клас-комбо винесено 1:1 з повторюваної зв'язки у Тижневому звіті
 * (`px-4 py-2.5 border-b border-[#e2e7ef]` + `text-[13px] font-bold`) і Зведеному
 * звіті РОП (той самий рядок + номер-бейдж 4.1/4.2). Жодних нових кольорів/радіусів.
 *
 * Використання:
 *   <div className="glass-card overflow-hidden">
 *     <SectionHeader title="По брендах · % + мітка" hint={`${n} брендів`} desc={...} />
 *     …тіло секції…
 *   </div>
 */
export function SectionHeader({ no, title, hint, desc, className }: {
  /** Номер регламенту (напр. «4.1») — рендериться синім mono-бейджем зліва. */
  no?: string;
  title: React.ReactNode;
  /** Правий бік рядка назви: лічильник / фільтри / контроли. */
  hint?: React.ReactNode;
  /** Опис-підрядок під назвою (приглушений). */
  desc?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('px-4 py-2.5 border-b border-[#e2e7ef]', className)}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-[13px] font-bold flex items-center">
          {no && <span className="font-mono text-[11px] font-bold text-white bg-emet-blue rounded px-1.5 py-0.5 mr-2">{no}</span>}
          {title}
        </h2>
        {hint != null && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {desc != null && <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>}
    </div>
  );
}
