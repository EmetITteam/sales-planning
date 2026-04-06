import { create } from 'zustand';
import type { UserSession, PeriodInfo } from './types';

interface AppState {
  user: UserSession | null;
  currentPeriod: PeriodInfo;
  designVariant: 'cards' | 'table';
  setUser: (user: UserSession | null) => void;
  setCurrentPeriod: (period: PeriodInfo) => void;
  setDesignVariant: (variant: 'cards' | 'table') => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  currentPeriod: {
    id: 1,
    weekStart: '2026-03-02',
    weekEnd: '2026-03-08',
    month: '2026-03-01',
    isActive: true,
  },
  designVariant: 'cards',
  setUser: (user) => set({ user }),
  setCurrentPeriod: (period) => set({ currentPeriod: period }),
  setDesignVariant: (variant) => set({ designVariant: variant }),
}));
