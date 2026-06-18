import { useMemo } from 'react';
import { CustomMonthPicker } from '@/components/ui/custom-month-picker';
import { UA_MONTHS } from '../client-helpers';

/**
 * <ClientsMonthFilter> — pill-toggle для перемикання між поточним місяцем і
 * минулими (до 3х). + опція «Свій» для довільного місяця через CustomMonthPicker.
 *
 * Виокремлено з clients-page.tsx (Day 3 рефактору).
 */
export function ClientsMonthFilter({
  selectedMonth,
  onChange,
}: {
  selectedMonth: string;
  onChange: (month: string) => void;
}) {
  const options = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const d = new Date();
    for (let i = 0; i < 4; i++) {
      const dd = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const value = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}`;
      const monthName = UA_MONTHS[dd.getMonth()];
      const label = i === 0 ? 'Поточний' : `${monthName.slice(0, 3)}.`;
      out.push({ value, label });
    }
    return out;
  }, []);

  const isCustom = !options.some(o => o.value === selectedMonth);

  return (
    <div className="inline-flex items-center gap-1 h-9 bg-white/60 backdrop-blur-md p-1 rounded-full border border-white/50 shrink-0">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`inline-flex items-center h-7 px-3 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
            selectedMonth === opt.value && !isCustom
              ? 'bg-gradient-to-r from-emet-blue to-emet-blue-light text-white shadow-md shadow-emet-blue/25'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
      <CustomMonthPicker
        label="Свій"
        active={isCustom}
        value={selectedMonth}
        onChange={onChange}
      />
    </div>
  );
}
