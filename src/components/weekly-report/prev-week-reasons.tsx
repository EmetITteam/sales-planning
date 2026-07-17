'use client';

/**
 * <PrevWeekReasons> — інформаційний (read-only) блок «Причини минулого тижня».
 *
 * Показує, які «Причини» по брендах РМ вказав ТИЖДЕНЬ ТОМУ — для контексту на
 * планёрці, ПЕРЕД чек-листом обіцянок (де «Дія» минулого тижня перевіряється на
 * виконання). Тут відміток нема — лише перегляд що писали.
 *
 * Якщо минулого тижня причин не збережено — блок не показуємо.
 */
import { MessageSquareText } from 'lucide-react';

interface Props {
  items: { segmentCode: string; segmentName: string; reasonText: string }[];
}

export function PrevWeekReasons({ items }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="glass-card p-4 md:p-5 space-y-3">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
          <MessageSquareText className="h-4 w-4 text-slate-500" />
        </div>
        <div>
          <h2 className="text-[13px] font-bold">Причини минулого тижня</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Що вказували як причину по брендах тиждень тому — для контексту (лише перегляд).
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {items.map(it => (
          <div key={it.segmentCode} className="rounded-xl border border-[#eef1f7] bg-[#fafbfe] px-3 py-2.5">
            <div className="flex items-start gap-2">
              <span className="font-bold text-[12px] shrink-0">{it.segmentName}</span>
              <span className="text-[12px] text-muted-foreground flex-1 min-w-0">{it.reasonText}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
