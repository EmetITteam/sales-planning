import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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
  const daysBackToLastSunday = dow === 0 ? 7 : dow;
  const lastSunday = new Date(now);
  lastSunday.setDate(now.getDate() - daysBackToLastSunday);

  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (lastSunday < firstOfMonth) {
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

/**
 * Стан навігації — куди зайшов користувач у дашборд-tree. Зберігається у
 * sessionStorage щоб refresh повертав на ту саму сторінку (а не на root).
 *
 * Структура tree (max 4 рівні):
 *   Director → Region (regionCode) → Manager (managerLogin) → Plan (segmentCode)
 *   RM → Manager (managerLogin) → Plan (segmentCode)
 *   Manager → Plan (segmentCode)
 */
export interface NavState {
  /** RegionCode для drill-down Director → Region. */
  regionCode?: string;
  /** Логін менеджера для drill-down → ManagerDashboard. */
  managerLogin?: string;
  /** Сегмент бренду для drill-down → PlanningForm. */
  segmentCode?: string;
}

interface AppState {
  user: UserSession | null;
  /**
   * Прапорець що /api/auth/me відповіла (з user або null).
   * Без нього home-сторінка не може відрізнити «ще не bootstrapped» від
   * «bootstrapped і не залогінений» → блимання login form у залогінених.
   */
  bootstrapped: boolean;
  currentPeriod: PeriodInfo;
  designVariant: 'cards' | 'table';
  /**
   * Live-режим: дашборд рахує "на сьогодні" замість конца обраного періоду.
   * Тимчасовий — після виходу автоматично скидається на дефолт.
   * У live-режимі drill-down у форму планування — read-only.
   */
  liveMode: boolean;
  /** Куди зайшов user у дашборд (для відновлення після refresh). */
  nav: NavState;
  setUser: (user: UserSession | null) => void;
  setBootstrapped: (b: boolean) => void;
  setCurrentPeriod: (period: PeriodInfo) => void;
  setDesignVariant: (variant: 'cards' | 'table') => void;
  setLiveMode: (live: boolean) => void;
  setNav: (nav: Partial<NavState>) => void;
  clearNav: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      bootstrapped: false,
      currentPeriod: getDefaultPeriod(),
      designVariant: 'cards',
      liveMode: false,
      nav: {},
      // Скидаємо liveMode + nav при logout. SWR cache очиститься окремо у
      // app-header.tsx через mutate(() => true, undefined, { revalidate: false }).
      // ⚠️ user тут — лише UI-кеш. Джерело істини = HttpOnly cookie на сервері
      // (читаємо через /api/auth/me у SessionBootstrap). При reload store починає
      // з null, потім /me populate-ить.
      setUser: (user) => set(user === null
        ? { user: null, liveMode: false, nav: {} }
        : { user }),
      setBootstrapped: (b) => set({ bootstrapped: b }),
      setCurrentPeriod: (period) => set({ currentPeriod: period }),
      setDesignVariant: (variant) => set({ designVariant: variant }),
      setLiveMode: (live) => set({ liveMode: live }),
      setNav: (patch) => set((s) => ({ nav: { ...s.nav, ...patch } })),
      clearNav: () => set({ nav: {} }),
    }),
    {
      name: 'emet-sales-planning',
      storage: createJSONStorage(() => sessionStorage),
      // Persistимо ЛИШЕ обраний період. user тепер з cookie (через /api/auth/me),
      // не з sessionStorage — щоб не довіряти стороні клієнта.
      partialize: (state) => ({
        currentPeriod: state.currentPeriod,
        nav: state.nav,
      }),
      // ⚠️ merge замість onRehydrateStorage. У zustand v5 `set()` спрацьовує
      // ДО `onRehydrateStorage` callback — мутація state у callback не
      // тригерила re-render → user бачив застарілий persisted period
      // (наприклад «Весь травень» вибраний вчора з'являвся сьогодні замість
      // «01.05—10.05» default). merge() виконується ДО set → return value
      // стає initial state, subscribers отримують свіже значення.
      merge: (persisted, current) => {
        const p = persisted as Partial<AppState> | null | undefined;
        if (!p) return current;
        const merged = { ...current, ...p };
        if (!p.currentPeriod) return merged;
        const def = getDefaultPeriod();
        const persistedMonth = p.currentPeriod.month?.slice(0, 7);
        const defaultMonth = def.month.slice(0, 7);
        const persistedWeekEnd = p.currentPeriod.weekEnd;
        const today = new Date().toISOString().slice(0, 10);
        // Stale якщо інший місяць АБО weekEnd у майбутньому АБО «весь місяць»
        // (weekEnd === last day of month, тобто свідомо обраний monthly view —
        // не persist-имо між сесіями, дефолт = поточний тиждень).
        const lastDayOfPersistedMonth = persistedMonth
          ? new Date(parseInt(persistedMonth.slice(0, 4), 10), parseInt(persistedMonth.slice(5, 7), 10), 0)
              .toISOString().slice(0, 10)
          : '';
        const isWholeMonth = persistedWeekEnd === lastDayOfPersistedMonth;
        const stale = persistedMonth !== defaultMonth || persistedWeekEnd > today || isWholeMonth;
        return stale ? { ...merged, currentPeriod: def } : merged;
      },
    },
  ),
);
