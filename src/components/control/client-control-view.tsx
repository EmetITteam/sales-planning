'use client';

import { ArrowLeft, AlertTriangle } from 'lucide-react';

interface ClientControlViewProps { onBack: () => void; }

/**
 * «Контроль виконання» — раніше показувало hardcoded mock-таблицю клієнтів×тижнів.
 * Прибрано згідно ревʼю — буде переписано на реальні дані з Supabase
 * (forecasts × фактичні продажі по тижнях) коли матимемо відповідну агрегацію.
 */
export function ClientControlView({ onBack }: ClientControlViewProps) {
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Дашборд
      </button>
      <div className="flex items-start gap-3 p-6 rounded-2xl bg-amber-50 border border-amber-200 text-[13px] text-amber-800">
        <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">Контроль виконання — у розробці</p>
          <p className="text-amber-700">
            Раніше тут була hardcoded демо-таблиця. Прибрано щоб не вводити в оману.
            Реальний контроль (план vs факт по клієнтах × тижнях місяця) буде підключений
            коли визначимось з джерелом тижневих фактів — або агрегатор по Supabase
            forecasts, або новий метод 1С.
          </p>
        </div>
      </div>
    </div>
  );
}
