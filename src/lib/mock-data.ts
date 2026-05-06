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

import type { UserSession } from './types';

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

// === Тип агрегату клієнтів (active/sleeping/new × {total, bought}) ===
export interface ClientCategoryStats {
  active: { total: number; bought: number };
  sleeping: { total: number; bought: number };
  newClients: { total: number; bought: number };
  totalBought: number;
  totalClients: number;
}
