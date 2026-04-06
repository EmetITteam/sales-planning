// === Роли ===
export type UserRole = 'manager' | 'rm' | 'director';

// === Данные пользователя (из 1С при логине) ===
export interface UserSession {
  login: string;
  fullName: string;
  role: UserRole;
  region: string;
  regionCode: string;
  managedUsers: string[]; // логины подчинённых (для РМ/директора)
}

// === Сегменты (ТМ) ===
export interface SegmentPlan {
  segmentCode: string;
  segmentName: string;
  planAmount: number;
  currency: string;
}

export interface SalesPlanResponse {
  plans: SegmentPlan[];
  exchangeRate: number;
  periodStart: string;
  periodEnd: string;
}

// === Факт продаж ===
export interface ClientSale {
  clientId: string;
  clientName: string;
  amount: number;
  lastSaleDate: string;
}

export interface SegmentFact {
  segmentCode: string;
  totalAmount: number;
  clients: ClientSale[];
}

export interface SalesFactResponse {
  facts: SegmentFact[];
}

// === Клиенты по сегменту ===
export interface Client1C {
  clientId: string;
  clientName: string;
  category: 'active' | 'sleeping' | 'lost' | 'new' | 'none';
  lastPurchaseDate: string | null;
  lastPurchaseAmount: number;
  totalYTD: number;
  meetingsThisMonth: number;
  callsThisMonth: number;
  phone: string;
  address: string;
}

// === Данные региона (для РМ) ===
export interface ManagerSegmentData {
  segmentCode: string;
  segmentName: string;
  planAmount: number;
  factAmount: number;
  factPercent: number;
}

export interface ManagerRegionData {
  login: string;
  name: string;
  segments: ManagerSegmentData[];
}

export interface RegionDataResponse {
  regionName: string;
  regionCode: string;
  managers: ManagerRegionData[];
}

// === Сводка по всем регионам (для директора) ===
export interface RegionSummary {
  regionName: string;
  regionCode: string;
  managers: ManagerRegionData[];
}

// === Зведена по категоріях клієнтів ===
export interface ClientCategorySummary {
  category: 'active' | 'new' | 'sleeping_lost';
  label: string;
  clientCount: number;
  expectedAmount: number;
  planCoveragePercent: number; // закривають % виконання плану
}

// === Прогноз (новий шаблон КВІТЕНЬ) ===
export interface ForecastRow {
  id?: number;
  clientId1c: string | null;
  clientName: string;
  clientType: string;
  forecastAmount: number;
  dealStage: string;
  factAmount: number; // факт на дату звіту (з 1С)
}

// === Закриття розриву ===
export interface GapClosureRow {
  id?: number;
  clientName: string;
  clientId1c: string | null;
  potentialAmount: number;
  action: string;
  deadline: string;
  factAmount: number; // факт на дату звіту (з 1С)
}

// === Дії для закриття розриву (текстовий блок) ===
export interface GapActions {
  action1: string;
  action2: string;
  action3: string;
}

// === Сводная карточка ТМ на дашборде ===
export interface TMSummaryCard {
  segmentCode: string;
  segmentName: string;
  planAmount: number;
  factAmount: number;
  factPercent: number;
  expectedPercent: number;
  deviationPercent: number;
  forecastPercent: number;
  weightedPipeline: number;
  clientCount: number;
  status: 'submitted' | 'draft' | 'empty';
}

// === Период ===
export interface PeriodInfo {
  id: number;
  weekStart: string;
  weekEnd: string;
  month: string;
  isActive: boolean;
}
