import { create } from 'zustand';
import type { UserSession, PeriodInfo } from './types';
import { weekEndToId } from './periods';

/**
 * Дефолт фільтру: останній завершений тиждень (по неділю включно), накопичено з 1-го числа.
 * Якщо в поточному місяці ще немає завершеного тижня (на початку місяця) — весь попередній місяць.
 */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDefaultPeriod(): PeriodInfo {
  const now = new Date();
  const dow = now.getDay(); // 0=нд, 1=пн ... 6=сб
  // Кількість днів назад до останньої завершеної неділі.
  // Якщо сьогодні неділя — остання завершена була тиждень тому.
  const daysBackToLastSunday = dow === 0 ? 7 : dow;
  const lastSunday = new Date(now);
  lastSunday.setDate(now.getDate() - daysBackToLastSunday);

  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (lastSunday < firstOfMonth) {
    // У поточному місяці ще немає завершеного тижня — беремо весь попередній місяць
    const prevMonthLast = new Date(now.getFullYear(), now.getMonth(), 0);
    const prevFirst = new Date(prevMonthLast.getFullYear(), prevMonthLast.getMonth(), 1);
    const weekEndStr = toDateStr(prevMonthLast);
    return {
      id: weekEndToId(weekEndStr),
      weekStart: toDateStr(prevFirst),
      weekEnd: weekEndStr,
      month: toDateStr(prevFirst),
      isActive: false,
    };
  }

  const weekEndStr = toDateStr(lastSunday);
  return {
    id: weekEndToId(weekEndStr),
    weekStart: toDateStr(firstOfMonth),
    weekEnd: weekEndStr,
    month: toDateStr(firstOfMonth),
    isActive: false,
  };
}

interface AppState {
  user: UserSession | null;
  currentPeriod: PeriodInfo;
  designVariant: 'cards' | 'table';
  /**
   * Live-режим: дашборд рахує "на сьогодні" замість конца обраного періоду.
   * Тимчасовий — після виходу автоматично скидається на дефолт.
   * У live-режимі drill-down у форму планування — read-only.
   */
  liveMode: boolean;
  setUser: (user: UserSession | null) => void;
  setCurrentPeriod: (period: PeriodInfo) => void;
  setDesignVariant: (variant: 'cards' | 'table') => void;
  setLiveMode: (live: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  currentPeriod: getDefaultPeriod(),
  designVariant: 'cards',
  liveMode: false,
  setUser: (user) => set({ user }),
  setCurrentPeriod: (period) => set({ currentPeriod: period }),
  setDesignVariant: (variant) => set({ designVariant: variant }),
  setLiveMode: (live) => set({ liveMode: live }),
}));
