/**
 * Date presets для фільтру зустрічей.
 *
 * Перенесено 1-в-1 з meeting-app/js/meetings.js handleDatePresetClick.
 * Семантика тижня — як у Litepicker: понеділок-неділя.
 */

export type DatePreset =
  | 'today'
  | 'tomorrow'
  | 'this-week'
  | 'last-week'
  | 'this-month'
  | 'last-month'
  | 'custom';

export interface DateRange {
  /** YYYY-MM-DD inclusive */
  startDateString: string;
  /** YYYY-MM-DD inclusive */
  endDateString: string;
}

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Сьогодні',
  tomorrow: 'Завтра',
  'this-week': 'Поточний тиждень',
  'last-week': 'Минулий тиждень',
  'this-month': 'Поточний місяць',
  'last-month': 'Минулий місяць',
  custom: 'Свій діапазон',
};

/** Формат періоду для display: «01.05.2026 — 31.05.2026». */
export function formatRangeLabel(range: DateRange): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  };
  if (range.startDateString === range.endDateString) return fmt(range.startDateString);
  return `${fmt(range.startDateString)} — ${fmt(range.endDateString)}`;
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Calc start/end дати для preset. `today` — приймається ззовні для тестів
 * (інакше не зможемо зафіксувати поточну дату).
 *
 * `custom` НЕ обробляється тут — caller має зберігати customRange окремо
 * і обходити цю функцію. Тут просто fallback до today щоб не падати.
 */
export function calcDateRange(preset: DatePreset, today: Date = new Date()): DateRange {
  let startDate: Date;
  let endDate: Date;

  switch (preset) {
    case 'custom':
    case 'today':
      startDate = new Date(today);
      endDate = new Date(today);
      break;

    case 'tomorrow': {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      startDate = tomorrow;
      endDate = new Date(tomorrow);
      break;
    }

    case 'this-week': {
      // Понеділок поточного тижня + 6 днів = неділя
      const first = new Date(today);
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      first.setDate(diff);
      startDate = first;
      endDate = new Date(first);
      endDate.setDate(first.getDate() + 6);
      break;
    }

    case 'last-week': {
      // Понеділок минулого тижня + 6 днів
      const first = new Date(today);
      const day = today.getDay();
      const diff = today.getDate() - day - 6;
      first.setDate(diff);
      startDate = first;
      endDate = new Date(first);
      endDate.setDate(first.getDate() + 6);
      break;
    }

    case 'this-month':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      break;

    case 'last-month':
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
  }

  return {
    startDateString: fmt(startDate),
    endDateString: fmt(endDate),
  };
}

/** Default preset на старті — як у meeting-app: «Сьогодні». */
export const DEFAULT_PRESET: DatePreset = 'today';
