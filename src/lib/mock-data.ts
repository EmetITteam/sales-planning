/**
 * Метадані які раніше жили з купою mock-фікстур.
 * Після прибирання моків (per code review) лишилось тільки:
 *  - MOCK_USERS — для кнопок «швидкий вхід» на формі логіну (DEMO режим)
 *  - SEGMENTS — список 9 ТМ (це не mock, просто бренд-метадані)
 *  - ClientCategoryStats тип — для ClientStatsCard
 *
 * Великі mock-структури MOCK_SALES_PLAN/FACT, MOCK_CLIENTS_PETARAN,
 * MOCK_FORECASTS_PETARAN/OTHER, MOCK_GAP_CLOSURES/OTHER, MOCK_TRAININGS,
 * MOCK_REGION_DATA, MOCK_ALL_REGIONS, getMockTMSummaries(), getMock*Stats*()
 * — видалено. Дашборди тепер живуть на реальних даних з 1С.
 */

import type {
  UserSession, TMSummaryCard, Client1C, ForecastRow, GapClosureRow, ClientCategoryStats,
} from './types';
import type {
  GetClientsForPlanningResponse,
} from './onec-types';
import { pctOf, calcForecastPercent } from './format';
import { getMonthProgressPct, getWorkingDaysInMonth, getPassedWorkingDays } from './working-days';

// === Тестові користувачі для демо-кнопок логіну (DEMO режим) ===
// Обмежено лиш реальними EMET-логінами щоб не плутати з фейковими acc.
export const MOCK_USERS: Record<string, UserSession> = {
  'feshchenko@emet.com': {
    login: 'feshchenko@emet.com',
    fullName: 'Фещенко Олена',
    role: 'manager',
    region: 'Дніпро',
    regionCode: 'DNP',
    managedUsers: [],
  },
  'sirik@emet.com': {
    login: 'sirik@emet.com',
    fullName: 'Сірик Наталія',
    role: 'manager',
    region: 'Дніпро',
    regionCode: 'DNP',
    managedUsers: [],
  },
  'rm.dnipro@emet.com': {
    login: 'rm.dnipro@emet.com',
    fullName: 'Іванова Марина',
    role: 'rm',
    region: 'Дніпро',
    regionCode: 'DNP',
    managedUsers: ['feshchenko@emet.com', 'sirik@emet.com'],
  },
  'director@emet.com': {
    login: 'director@emet.com',
    fullName: 'Петренко Андрій',
    role: 'director',
    region: '',
    regionCode: '',
    managedUsers: ['rm.dnipro@emet.com'],
  },
};

// === Бренди (ТМ) — 9 сегментів планування ===
// Ці коди мають співпадати з тим що повертає 1С після SEGMENT_CODE_MAP в адаптері
// (ДРУГИЕТМ → OTHER). Решта 8 — як є з 1С.
export const SEGMENTS = [
  { code: 'PETARAN', name: 'Petaran' },
  { code: 'ELLANSE', name: 'Ellanse' },
  { code: 'EXOXE', name: 'EXOXE' },
  { code: 'ESSE', name: 'ESSE' },
  { code: 'NEURAMIS', name: 'Neuramis' },
  { code: 'NEURONOX', name: 'Neuronox' },
  { code: 'VITARAN', name: 'Vitaran' },
  { code: 'IUSE', name: 'IUSE' },
  { code: 'OTHER', name: 'Інші ТМ' },
];

// ClientCategoryStats тип переїхав у `types.ts` (домен) — реекспорт для зворотньої сумісності.
export type { ClientCategoryStats } from './types';

// ─────────────────────────────────────────────────────────────────────
// DEMO MODE — мокові дані тільки для логінів з MOCK_USERS.
// Реальні 1С-користувачі цей код НЕ зачіпає (skip via isDemoLogin).
// ─────────────────────────────────────────────────────────────────────

/** Чи є цей логін одним з тестових (швидкий вхід без 1С). */
export function isDemoLogin(login: string | undefined | null): boolean {
  return !!login && login in MOCK_USERS;
}

/** Демо-плани по сегментах (фіксовані числа щоб демо було стабільним). */
const DEMO_PLAN_BY_SEGMENT: Record<string, number> = {
  PETARAN: 7490, ELLANSE: 4500, EXOXE: 1200, ESSE: 5000,
  NEURAMIS: 6800, NEURONOX: 8200, VITARAN: 12500, IUSE: 1800, OTHER: 3500,
};

/** Демо-факт за повний місяць — масштабуємо пропорційно до пройдених днів. */
const DEMO_FACT_BY_SEGMENT: Record<string, number> = {
  PETARAN: 5800, ELLANSE: 3658, EXOXE: 170, ESSE: 2738,
  NEURAMIS: 4200, NEURONOX: 6100, VITARAN: 9800, IUSE: 320, OTHER: 2860,
};

/** Демо: TMSummaryCard[] для дашборда менеджера. */
export function getDemoTMSummaries(asOfDate: Date): TMSummaryCard[] {
  const totalWD = getWorkingDaysInMonth(asOfDate.getFullYear(), asOfDate.getMonth());
  const passedWD = getPassedWorkingDays(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate);
  const calcPct = getMonthProgressPct(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate);
  const factScale = totalWD > 0 ? Math.min(passedWD / totalWD, 1) : 0;

  return SEGMENTS.map(seg => {
    const planAmount = DEMO_PLAN_BY_SEGMENT[seg.code] ?? 0;
    const fullMonthFact = DEMO_FACT_BY_SEGMENT[seg.code] ?? 0;
    // Якщо ще нема пройдених робочих днів — показуємо 30% як заглушку,
    // щоб у демо завжди були цифри (на 1-3 травня 0 робочих днів).
    const factAmount = Math.round(fullMonthFact * (factScale > 0 ? factScale : 0.3));
    const factPct = pctOf(factAmount, planAmount);
    const forecastPct = calcForecastPercent(factAmount, planAmount, passedWD || 1, totalWD);

    return {
      segmentCode: seg.code,
      segmentName: seg.name,
      planAmount,
      factAmount,
      factPercent: Math.round(factPct * 100) / 100,
      calcPercent: Math.round(calcPct * 100) / 100,
      forecastPercent: Math.round(forecastPct * 100) / 100,
      expectedPercent: Math.round(factPct * 100) / 100,
      hasManagerPlan: false,
      deviationPercent: Math.round((forecastPct - calcPct) * 100) / 100,
      prevMonthFactAmount: Math.round(fullMonthFact * 0.9),
      prevMonthPlanAmount: Math.round(planAmount * 0.95),
      prevMonthFactPercent: 88,
      weightedPipeline: factAmount * 1.5,
      clientCount: 5,
      status: 'draft',
    };
  });
}

/** Демо: ClientStatsCard. */
export function getDemoClientStats(): ClientCategoryStats {
  return {
    active: { total: 19, bought: 4 },
    sleeping: { total: 9, bought: 1 },
    lost: { total: 6, bought: 0 },
    newClients: { total: 2, bought: 0 },
    none: { total: 4, bought: 1 },
    totalBought: 5,
    totalClients: 30,
  };
}

/** Демо: ~10 клієнтів PETARAN для планувальної форми. */
const DEMO_CLIENTS: Client1C[] = [
  { clientId: 'D001', clientName: 'Бліндовська Яна Олександрівна', category: 'active',  lastPurchaseDate: '2026-04-15', lastPurchaseAmount: 378, totalYTD: 1890, meetingsThisMonth: 0, callsThisMonth: 0, phone: '380501234567', address: 'Дніпро' },
  { clientId: 'D002', clientName: 'Гімішлі Анастасія Сергіївна',     category: 'active',  lastPurchaseDate: '2026-04-12', lastPurchaseAmount: 252, totalYTD: 1260, meetingsThisMonth: 0, callsThisMonth: 0, phone: '380502345678', address: 'Дніпро' },
  { clientId: 'D003', clientName: 'Воронько Катерина',                category: 'active',  lastPurchaseDate: '2026-03-20', lastPurchaseAmount: 595, totalYTD: 1785, meetingsThisMonth: 0, callsThisMonth: 0, phone: '380503456789', address: 'Дніпро' },
  { clientId: 'D004', clientName: 'Андрущук Катерина Миколаївна',     category: 'active',  lastPurchaseDate: '2026-03-30', lastPurchaseAmount: 378, totalYTD: 1890, meetingsThisMonth: 0, callsThisMonth: 0, phone: '380504567890', address: 'Дніпро' },
  { clientId: 'D005', clientName: 'Астровська Катерина Юріївна',      category: 'sleeping', lastPurchaseDate: '2025-12-10', lastPurchaseAmount: 378, totalYTD: 378,  meetingsThisMonth: 0, callsThisMonth: 0, phone: '380505678901', address: 'Дніпро' },
  { clientId: 'D006', clientName: 'Булдакова Регіна',                 category: 'sleeping', lastPurchaseDate: '2025-10-05', lastPurchaseAmount: 252, totalYTD: 252,  meetingsThisMonth: 0, callsThisMonth: 0, phone: '380506789012', address: 'Дніпро' },
  { clientId: 'D007', clientName: 'Дячок Олена Олексіївна',           category: 'lost',     lastPurchaseDate: '2025-08-20', lastPurchaseAmount: 252, totalYTD: 252,  meetingsThisMonth: 0, callsThisMonth: 0, phone: '380507890123', address: 'Дніпро' },
];

/** Демо: побудова відповіді як з 1С (purchases по PETARAN), для useClientsForPlanning. */
export function getDemoClientsForPlanningResponse(): GetClientsForPlanningResponse {
  return {
    clients: DEMO_CLIENTS.map(c => ({
      clientId: c.clientId,
      clientName: c.clientName,
      phone: c.phone,
      // Категорії російською (як у реальній 1С) — адаптер нормалізує
      category: ({ active: 'Активный', sleeping: 'Спящий', lost: 'Потерянный', new: 'Новый', none: 'Без закупок' } as const)[c.category],
      purchases: c.lastPurchaseDate
        ? [{ segmentCode: 'PETARAN', segmentName: 'Petaran', lastPurchaseDate: c.lastPurchaseDate, lastPurchaseAmount: c.lastPurchaseAmount }]
        : [],
    })),
  };
}

/** Демо: початкові forecasts для PETARAN (showcase з заповненим прогнозом). */
export function getDemoForecastsPETARAN(): ForecastRow[] {
  return DEMO_CLIENTS.filter(c => c.category === 'active').map(c => ({
    clientId1c: c.clientId,
    clientName: c.clientName,
    forecastAmount: c.lastPurchaseAmount,
    stage: 'Дзвінок',
    stageComment: 'продаж акції',
    stageDone: false,
    factAmount: c.clientId === 'D001' ? c.lastPurchaseAmount : 0,
    lastPurchaseDate: c.lastPurchaseDate,
    lastPurchaseAmount: c.lastPurchaseAmount,
    completed: c.clientId === 'D001',
    manuallyAdded: false,
  }));
}

/** Демо: початкові gap-closures для PETARAN. */
export function getDemoGapClosuresPETARAN(): GapClosureRow[] {
  return DEMO_CLIENTS.filter(c => c.category === 'sleeping' || c.category === 'lost').slice(0, 2).map(c => ({
    clientId1c: c.clientId,
    clientName: c.clientName,
    category: c.category === 'sleeping' ? 'Сплячий' : 'Втрачений',
    potentialAmount: c.lastPurchaseAmount,
    stage: 'Дзвінок',
    stageComment: 'нагадування',
    stageDone: false,
    completed: false,
    deadline: '',
    factAmount: 0,
    lastPurchaseDate: c.lastPurchaseDate,
    lastPurchaseAmount: c.lastPurchaseAmount,
    manuallyAdded: false,
  }));
}
