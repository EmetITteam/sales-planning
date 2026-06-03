/**
 * TypeScript-типи для HTTP-сервісу 1С (specka v2.1).
 * Усі типи відповідають docs/1C_API_SPECIFICATION.md.
 *
 * Принцип:
 *  - *Request — payload що шлемо у 1С
 *  - *Response — що очікуємо у `data` поля {status:'success', data: ...}
 *  - Помилка завжди {status:'error', message: string} → у клієнті
 *    розгортається в OneCError exception.
 *
 * NB: ці типи НЕ є UI-типами (ті в `types.ts`). Перетворення
 * 1С → UI робиться у `onec-adapters.ts`.
 */

// === Загальна обгортка відповіді ===
export interface OneCSuccess<T> {
  status: 'success';
  data: T;
}

export interface OneCError {
  status: 'error';
  message: string;
}

export type OneCResponse<T> = OneCSuccess<T> | OneCError;

// === Action 1: login (розширений) ===
export interface LoginRequest {
  login: string;
  password: string;
}

export interface LoginResponse {
  login: string;
  /** Текстова роль ("Менеджер", "РМ"...) — для legacy CRM "Митинг", не для нас */
  role: string;
  auth: boolean;
  /** Код ролі — використовуємо у веб-додатку */
  roleCode: 'manager' | 'rm' | 'director';
  fullName: string;
  /** Назва підрозділу ("Дніпро") */
  region: string;
  /** Скорочений код (формат на розсуд 1С — спека це уточнює) */
  regionCode: string;
  /** Логіни підлеглих: для менеджера — [], РМ — менеджери підрозділу, директор — всі РМ */
  managedUsers: string[];
}

// === Action 2: getClientsForPlanning ===
export interface GetClientsForPlanningRequest {
  login: string;
}

export interface OneCClientPurchase {
  segmentCode: string;
  segmentName: string;
  /** Дата у форматі YYYY-MM-DD */
  lastPurchaseDate: string;
  /** USD. 1С реально віддає рядок ("360.00") — адаптер приводить до number. */
  lastPurchaseAmount: number | string;
}

export interface OneCPlanningClient {
  /** Код контрагента в 1С */
  clientId: string;
  clientName: string;
  phone: string;
  /** Категорія з регістру 1С (5 значень — мапуємо в UI через onec-adapters) */
  /**
   * Категорія приходить рядком — у реальній 1С російською:
   * "Активный", "Спящий", "Потерянный", "Новый", "Без закупок".
   * Адаптер `mapClientCategory` нормалізує і UA, і RU варіанти.
   */
  category: string;
  /** Тільки бренди де були закупки (порожній масив якщо клієнт не купував) */
  purchases: OneCClientPurchase[];
}

export interface GetClientsForPlanningResponse {
  clients: OneCPlanningClient[];
}

// === Action 3: getSalesFact ===
export interface GetSalesFactRequest {
  login: string;
  /** Місяць у форматі YYYY-MM */
  period: string;
  /** Масив кодів контрагентів (до 400 шт) — деталізація clients[] фільтрується по них */
  clientIds: string[];
  /** v2.1: опц. дата зрізу (YYYY-MM-DD). Якщо не передано — останній день місяця `period`. */
  asOfDate?: string;
}

export interface OneCFactClient {
  clientId: string;
  /** Скорочена назва */
  clientName: string;
  factAmountUSD: number;
}

export interface OneCFactSegment {
  segmentCode: string;
  segmentName: string;
  /** Загальний факт сегменту по ВСІХ клієнтах менеджера (не тільки в clientIds) */
  totalFactUSD: number;
  /**
   * v2.2: Загальна кількість унікальних клієнтів які купували цей сегмент.
   * Frontend обчислює «Незаплановані» = totalClientCount − clients.length.
   */
  totalClientCount: number;
  /** Деталізація по клієнтах з clientIds. Якщо клієнт не купував — не входить */
  clients: OneCFactClient[];
}

export interface GetSalesFactResponse {
  segments: OneCFactSegment[];
}

// === Action 4: getRegistryPlans ===
export interface GetRegistryPlansRequest {
  /** YYYY-MM-DD */
  dateFrom: string;
  dateTo: string;
}

export interface OneCRegistryPlan {
  /** YYYY-MM-DD */
  period: string;
  divisionCode: string;
  divisionName: string;
  /** v2.3: логін менеджера в ІБ 1С (раніше було managerCode). Може бути порожнім. */
  managerLogin: string;
  managerName: string;
  segmentCode: string;
  segmentName: string;
  /** 1С реально віддає рядком ("26634.00") — адаптер приводить до number. */
  planAmountUSD: number | string;
}

export interface GetRegistryPlansResponse {
  plans: OneCRegistryPlan[];
}

// === Action 5: getRegionData (v2.1 розширений з prevMonth) ===
export interface GetRegionDataRequest {
  login: string;
  /** YYYY-MM */
  period: string;
  /** v2.1: опц. дата зрізу */
  asOfDate?: string;
}

export interface OneCRegionSegment {
  segmentCode: string;
  segmentName: string;
  planAmountUSD: number;
  factAmountUSD: number;
  /** v2.3: ПОВНИЙ факт минулого місяця (від 1-го по останній день). Адаптер toNumber. */
  prevMonthFactUSD: number;
  prevMonthPlanUSD: number;
  /** Якщо в минулому місяці плану не було — може бути null */
  prevMonthFactPercent: number | null;
}

/** v2.5: агрегат клієнтів менеджера по 5 категоріях. */
export interface OneCManagerClientStats {
  active:   { total: number | string; bought: number | string };
  sleeping: { total: number | string; bought: number | string };
  lost:     { total: number | string; bought: number | string };
  new:      { total: number | string; bought: number | string };
  none:     { total: number | string; bought: number | string };
  totalClients: number | string;
  totalBought:  number | string;
}

export interface OneCRegionManager {
  managerName: string;
  managerLogin: string;
  segments: OneCRegionSegment[];
  totalPlan: number;
  totalFact: number;
  /** v2.1: сума факту минулого місяця */
  totalPrevMonthFact: number;
  /**
   * v2.5: агрегат клієнтів менеджера. Залишене optional на випадок якщо 1С
   * на якомусь запиті регресне до v2.4 — тоді ми не падаємо, картка просто
   * показує 0/total. Реально prod 1С з 2026-05-08 завжди повертає це поле.
   */
  clientStats?: OneCManagerClientStats;
}

/** v2.4: один регіон у відповіді (РМ — 1, Директор — 8). */
export interface OneCRegion {
  regionName: string;
  /** v2.4: код підрозділу від 1С (DNP/KYV/...). */
  regionCode: string;
  managers: OneCRegionManager[];
}

export interface GetRegionDataResponse {
  /** v2.1: дата зрізу поточного місяця */
  asOfDate: string;
  /** v2.3: останній день минулого місяця (повний минулий місяць) */
  prevMonthAsOfDate: string;
  /** v2.4: масив регіонів (РМ — 1, Директор — всі). */
  regions: OneCRegion[];
}

// === Action 7: checkActivities (v2.6 — підтвердження дзвінків / зустрічей) ===
export interface CheckActivitiesRequest {
  /** Логін менеджера — фільтр CRM-документів (Дзвінок / Зустріч) по полю Менеджер */
  login: string;
  /** Місяць YYYY-MM — діапазон [1-й; last day] */
  period: string;
  /** Масив кодів контрагентів (1-200). Для кожного повернеться запис у activities[]. */
  clientIds: string[];
}

export interface OneCActivity {
  clientId: string;
  /** Чи був хоча б 1 завершений дзвінок цього менеджера до цього клієнта у періоді */
  hasCall: boolean;
  /** Чи була хоча б 1 завершена зустріч */
  hasMeeting: boolean;
  /** YYYY-MM-DD дата останнього дзвінка (для tooltip) або null */
  lastCallDate: string | null;
  lastMeetingDate: string | null;
}

export interface CheckActivitiesResponse {
  activities: OneCActivity[];
}

// === Action 6: getTrainings (новий у v2.1) ===
export interface GetTrainingsRequest {
  /** Регіон менеджера */
  regionCode: string;
  /** YYYY-MM-DD — повертати тільки навчання з датою >= dateFrom */
  dateFrom: string;
}

export interface OneCTraining {
  trainingId: string;
  trainingName: string;
  /** Тип/Вид семінара ("Семінар", "Майстер-клас" тощо) */
  trainingType: string;
  /** YYYY-MM-DD */
  date: string;
  regionCode: string;
  regionName: string;
  /** Місто проведення (формат у 1С: "01.Дніпро") */
  city: string;
}

export interface GetTrainingsResponse {
  trainings: OneCTraining[];
}

// === Карта action → request/response (для type-safe callOneC) ===
// === Митинг (meeting-app) actions для сторінки «Мої клієнти» ===
// shapes у `mityng-types.ts` (окремий файл бо це не наш контракт — це Митинга).
import type {
  GetManagerClientsResponse,
  FindClientResponse,
  ClientReport,
} from './mityng-types';

export interface GetManagerClientsRequest {
  login: string;  // override з сесії у /api/onec
}

export interface FindClientRequest {
  searchTerm: string;
  managerLogin: string;  // override з сесії
}

export interface GetClientReportRequest {
  clientID: string;
}

export interface GetAllMeetingsForClientRequest {
  clientID: string;
}

/** Поки що shape не верифікований у проді — `unknown`. */
export type GetAllMeetingsForClientResponse = unknown;

// === getClientFocus (Action A) ===
export interface GetClientFocusRequest {
  login: string;
  clientIds: string[];
}

/** Shape поки що припускається на основі нашої спеки — уточнити після першого виклику. */
export interface ClientFocusItem {
  focusName: string;
  since?: string;
  validUntil?: string | null;
}

export interface GetClientFocusResponse {
  focuses: Array<{
    clientId: string;
    items: ClientFocusItem[];
  }>;
}

// === getClientActivationPlan (Action B) ===
// План активації бази клієнтів по категоріях (документ «Планування активації
// бази клієнтів» у 1С). login-bound. ⚠️ 1С шле totalInCategory як STRING
// ("120") — coerce у споживачі. category — у RU-формулюванні (мапимо RU→UA).
export interface GetClientActivationPlanRequest {
  login: string;
  /** YYYY-MM */
  period: string;
}

export interface OneCActivationRow {
  /** RU-категорія: Спящий / Потерянный / Без закупок / Активный / Новый */
  category: string;
  /** Скільки клієнтів цієї категорії менеджер планує активувати. */
  planCount: number;
  /** Скільки всього клієнтів цієї категорії зараз. ⚠️ 1С інколи шле string. */
  totalInCategory: number | string;
}

export interface GetClientActivationPlanResponse {
  period: string;
  documentNumber: string | null;
  documentDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  region: string | null;
  activations: OneCActivationRow[];
}

export interface OneCActionMap {
  login: { request: LoginRequest; response: LoginResponse };
  getClientsForPlanning: { request: GetClientsForPlanningRequest; response: GetClientsForPlanningResponse };
  getSalesFact: { request: GetSalesFactRequest; response: GetSalesFactResponse };
  getRegistryPlans: { request: GetRegistryPlansRequest; response: GetRegistryPlansResponse };
  getRegionData: { request: GetRegionDataRequest; response: GetRegionDataResponse };
  getTrainings: { request: GetTrainingsRequest; response: GetTrainingsResponse };
  checkActivities: { request: CheckActivitiesRequest; response: CheckActivitiesResponse };
  // Митинг:
  getManagerClients: { request: GetManagerClientsRequest; response: GetManagerClientsResponse };
  findClient: { request: FindClientRequest; response: FindClientResponse };
  getClientReport: { request: GetClientReportRequest; response: ClientReport };
  getAllMeetingsForClient: { request: GetAllMeetingsForClientRequest; response: GetAllMeetingsForClientResponse };
  getClientFocus: { request: GetClientFocusRequest; response: GetClientFocusResponse };
  getClientActivationPlan: { request: GetClientActivationPlanRequest; response: GetClientActivationPlanResponse };
  saveClientSurvey: { request: SaveClientSurveyRequest; response: SaveClientSurveyResponse };
  getInitialData: { request: GetInitialDataRequest; response: GetInitialDataResponse };
}

export interface GetInitialDataRequest {
  login: string;
  /** YYYY-MM-DD */
  startDateString: string;
  /** YYYY-MM-DD */
  endDateString: string;
}

export interface GetInitialDataResponse {
  /** Зустрічі менеджера за період. Поки нас цікавлять тільки purposes. */
  meetings?: unknown[];
  /** Довідник цілей візиту. У 1С повертається як [{Purpose: string}]. */
  purposes?: Array<{ Purpose: string }>;
  questions?: unknown[];
  potentialCategories?: unknown[];
}

export interface SaveClientSurveyRequest {
  clientID: string;
  /** JSON-stringify результату survey-форми (з meeting-app outcome-survey-form). */
  surveyData: string;
}

export interface SaveClientSurveyResponse {
  success?: boolean;
}

export type OneCAction = keyof OneCActionMap;
