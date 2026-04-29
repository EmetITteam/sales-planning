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
  /** USD */
  lastPurchaseAmount: number;
}

export interface OneCPlanningClient {
  /** Код контрагента в 1С */
  clientId: string;
  clientName: string;
  phone: string;
  /** Категорія з регістру 1С (5 значень — мапуємо в UI через onec-adapters) */
  category: 'Активний' | 'Сплячий' | 'Втрачений' | 'Новий' | 'БезЗакупок';
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
  /** v2.1: опц. дата зрізу (YYYY-MM-DD). Якщо не передано — поточна дата. */
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
  managerCode: string;
  managerName: string;
  segmentCode: string;
  segmentName: string;
  planAmountUSD: number;
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
  /** v2.1: факт минулого місяця на той самий N-й робочий день */
  prevMonthFactUSD: number;
  prevMonthPlanUSD: number;
  /** Якщо в минулому місяці плану не було — може бути null */
  prevMonthFactPercent: number | null;
}

export interface OneCRegionManager {
  managerName: string;
  managerLogin: string;
  segments: OneCRegionSegment[];
  totalPlan: number;
  totalFact: number;
  /** v2.1: сума факту минулого місяця */
  totalPrevMonthFact: number;
}

export interface GetRegionDataResponse {
  region: string;
  /** v2.1: дата зрізу поточного місяця */
  asOfDate: string;
  /** v2.1: відповідна дата минулого місяця (N-й робочий день) */
  prevMonthAsOfDate: string;
  managers: OneCRegionManager[];
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
export interface OneCActionMap {
  login: { request: LoginRequest; response: LoginResponse };
  getClientsForPlanning: { request: GetClientsForPlanningRequest; response: GetClientsForPlanningResponse };
  getSalesFact: { request: GetSalesFactRequest; response: GetSalesFactResponse };
  getRegistryPlans: { request: GetRegistryPlansRequest; response: GetRegistryPlansResponse };
  getRegionData: { request: GetRegionDataRequest; response: GetRegionDataResponse };
  getTrainings: { request: GetTrainingsRequest; response: GetTrainingsResponse };
}

export type OneCAction = keyof OneCActionMap;
