// === Ролі ===
export type UserRole = 'manager' | 'rm' | 'director';

// === Дані користувача (з 1С при логіні) ===
export interface UserSession {
  login: string;
  fullName: string;
  role: UserRole;
  region: string;
  regionCode: string;
  managedUsers: string[]; // логіни підлеглих (для РМ/директора)
}

// === Сегменти (ТМ) ===
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

// === Факт продажів ===
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

// === Клієнти по сегменту ===
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

// === Дані регіону (для РМ) ===
export interface ManagerSegmentData {
  segmentCode: string;
  segmentName: string;
  planAmount: number;
  factAmount: number;
  factPercent: number;
  // 🆕 v2.1: порівняння з минулим місяцем на той же N-й робочий день
  prevMonthFactAmount?: number;
  prevMonthPlanAmount?: number;
  prevMonthFactPercent?: number;
}

export interface ManagerRegionData {
  login: string;
  name: string;
  segments: ManagerSegmentData[];
  // 🆕 v2.1: сума факту минулого місяця на той же N-й робочий день
  totalPrevMonthFact?: number;
}

export interface RegionDataResponse {
  regionName: string;
  regionCode: string;
  managers: ManagerRegionData[];
  // 🆕 v2.1: дати на які рахувалися факти (для tooltip і прозорості)
  asOfDate?: string;
  prevMonthAsOfDate?: string;
}

// === Зведення по всіх регіонах (для директора) ===
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

// === Прогноз по активних клієнтах ===
export interface ForecastRow {
  id?: number;
  clientId1c: string;
  clientName: string;
  forecastAmount: number;           // скільки очікує продаж
  stage: 'Дзвінок' | 'Зустріч' | '';   // етап: дзвінок або зустріч
  stageComment: string;             // коментар (ціль дзвінка/зустрічі)
  stageDone: boolean;               // чи виконано (перевірка з 1С)
  factAmount: number;               // факт продажів наростаючий (з 1С)
  lastPurchaseDate: string | null;  // дата останньої покупки по сегменту (з 1С)
  lastPurchaseAmount: number;       // сума останньої покупки по сегменту (з 1С)
  completed: boolean;               // факт >= прогноз → зафіксовано
  manuallyAdded?: boolean;          // додано вручну (не авто)
}

// === Закриття розриву (неактивні категорії — сплячі, втрачені, БЗ) ===
// v2.1: уніфіковано з ForecastRow — додано stage/stageDone/completed та обучення з 1С.
export interface GapClosureRow {
  id?: number;
  clientId1c: string;
  clientName: string;
  category: string;                 // категорія з регістру 1С (сплячий, втрачений, БЗ)
  potentialAmount: number;          // сума яку очікуємо повернути
  // 🆕 v2.1: етап і статус — як у ForecastRow
  stage: 'Дзвінок' | 'Зустріч' | 'Навчання' | '';
  stageComment: string;
  stageDone: boolean;               // чи виконано (перевірка з 1С)
  completed: boolean;               // факт >= потенціал → зафіксовано
  // 🆕 v2.1: обучення з 1С (опц., якщо stage = "Навчання")
  trainingId?: string;
  trainingName?: string;
  trainingDate?: string;            // YYYY-MM-DD
  // факт з 1С
  factAmount: number;
  lastPurchaseDate: string | null;
  lastPurchaseAmount: number;
  // дедлайн (можна обчислити з trainingDate якщо обучення обрано)
  deadline: string;
  manuallyAdded?: boolean;
}

// === Обучення з 1С (Action 6: getTrainings) ===
// v2.1: справочник "Виды обучения" з 1С, для блоку "Закриття розриву".
export interface Training {
  trainingId: string;
  trainingName: string;
  trainingType: string;             // "Семінар", "Майстер-клас" тощо
  date: string;                     // YYYY-MM-DD
  regionCode: string;               // DNP / KYV / ODS ...
  regionName: string;               // "Одеса"
  city: string;                     // "04.Одеса" — як у 1С
}

// === Дії для закриття розриву (текстовий блок) ===
export interface GapActions {
  action1: string;
  action2: string;
  action3: string;
}

// === Зведена картка ТМ на дашборді ===
// v2.1: переосмислено три % — calc / forecast / expected. Див. README блок "Три проценти".
export interface TMSummaryCard {
  segmentCode: string;
  segmentName: string;
  planAmount: number;
  factAmount: number;
  factPercent: number;        // факт / план × 100% — поточний результат
  calcPercent: number;        // 🆕 норма: % робочих днів пройдено в місяці (де "повинен бути")
  forecastPercent: number;    // 🔄 run-rate: факт × всього_дн / пройдено_дн / план — "якщо темп збережеться"
  expectedPercent: number;    // 🔄 (факт + Σпрогноз менеджера + Σзакриття розриву) / план — "якщо виконає обіцянки"
  hasManagerPlan: boolean;    // 🆕 чи заповнив менеджер хоч одну строку прогнозу/розриву
  deviationPercent: number;   // forecastPercent − calcPercent (наскільки темп відхиляється від норми)
  weightedPipeline: number;
  clientCount: number;
  status: 'submitted' | 'draft' | 'empty';
}

// === Період ===
export interface PeriodInfo {
  id: number;
  weekStart: string;
  weekEnd: string;
  month: string;
  isActive: boolean;
}
