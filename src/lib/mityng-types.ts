/**
 * Типи для 1С actions з Митинга (meeting-app) — використовуємо у сторінці
 * `/clients` (CRM-режим менеджера) + майбутньому auto-prefill прогнозу.
 *
 * ⚠️ ВАЖЛИВО: 1С повертає shape який ми ТУТ припускаємо. Реальний shape треба
 * перевіряти при першому виклику з prod. Якщо відрізняється — оновити цей
 * файл і додати в `docs/PLAN_clients_page_and_metrics_2026_05_26.md` нотатку.
 */

/** Категорії клієнтів з 1С довідника. `null` коли категорія не виставлена. */
export type ClientCategoryFromOneC =
  | 'Новый'
  | 'Активный'
  | 'Спящий'
  | 'Без закупок'
  | 'Потерянный'
  | string  // допускаємо інші значення з 1С — UI робить fallback на «Без категорії»
  | null;

/**
 * Один клієнт з `getManagerClients({login})` або `findClient({searchTerm, managerLogin})`.
 *
 * Поля з PascalCase — як приходить з 1С (не перейменовуємо тут, бо легше
 * діагностувати при debug). Camel-case аліаси робимо у UI-шарі за потреби.
 */
export interface ClientFromOneC {
  ClientID: string;
  /**
   * 1С повертає поле name по-різному залежно від endpoint:
   *  - `getManagerClients` → `ClientName` (PascalCase)
   *  - `findClient` → `clientName` (camelCase)
   * Тримаємо обидва опційними; UI робить через `getClientName(c)`.
   */
  clientName?: string;
  ClientName?: string;
  ClientCategory: ClientCategoryFromOneC;
  /** Аналогічно name: `ClientAddress` у getManagerClients, `clientAddress` у findClient. */
  clientAddress?: string;
  ClientAddress?: string;
  Phone: string;
  managerName?: string;
  isMine?: boolean;
  /**
   * 🆕 Додано 2026-05-27 з спекою Action C — клієнт у Резерві
   * (на нього менеджер не звертає уваги, виключений з планування).
   * Підтримуємо обидва case-варіанти на випадок 1С-розбіжностей.
   */
  isReserved?: boolean;
  IsReserved?: boolean;
  /**
   * 🆕 Bulk-поля з 1С getManagerClients — останні дати контактів.
   * Це дозволяє НЕ викликати checkActivities (який зараз баговий) —
   * напряму перевіряємо чи дата у поточному місяці.
   * - LastMeetingDate: 1С повертає (формат "YYYY-MM-DD" або порожня "")
   * - LastCallDate: 🟡 чекаємо щоб 1С додав (Action C extension)
   */
  LastMeetingDate?: string;
  lastMeetingDate?: string;
  LastCallDate?: string;
  lastCallDate?: string;
}

/** Helper: останні дата зустрічі/дзвінка незалежно від casing. */
export function getLastMeetingDate(c: { LastMeetingDate?: string; lastMeetingDate?: string }): string {
  return c.LastMeetingDate ?? c.lastMeetingDate ?? '';
}
export function getLastCallDate(c: { LastCallDate?: string; lastCallDate?: string }): string {
  return c.LastCallDate ?? c.lastCallDate ?? '';
}

/** Helper — узяти isReserved незалежно від casing/типу даних з 1С.
 *  Приймає bool, string ('true'/'1'/'yes'), number (1) — 1С повертає по-різному.
 *  Параметр `unknown` бо обходимо різні shapes (ClientFromOneC + raw responses).
 */
export function isClientReserved(c: unknown): boolean {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  const candidates = [
    o.isReserved, o.IsReserved,
    o.isReserve, o.IsReserve,
    o.reserved, o.Reserved,
    o.reserve, o.Reserve,
  ];
  for (const v of candidates) {
    if (v === true || v === 1) return true;
    if (typeof v === 'string') {
      const low = v.toLowerCase().trim();
      if (low === 'true' || low === '1' || low === 'yes' || low === 'да') return true;
    }
  }
  return false;
}

/** Helper: дістати name незалежно від casing 1С. */
export function getClientName(c: { clientName?: string; ClientName?: string }): string {
  return c.clientName ?? c.ClientName ?? '';
}

/** Helper: дістати address незалежно від casing 1С. */
export function getClientAddress(c: { clientAddress?: string; ClientAddress?: string }): string {
  return c.clientAddress ?? c.ClientAddress ?? '';
}

/** Відповідь `getManagerClients({login})`. */
export interface GetManagerClientsResponse {
  clients: ClientFromOneC[];
}

/** Відповідь `findClient({searchTerm, managerLogin})`. */
export interface FindClientResponse {
  found: boolean;
  clients: ClientFromOneC[];
}

/** Один місяць у 3-місячній історії бренду. */
export interface SalesByMonth {
  /** Локалізована назва місяця з 1С, наприклад "Травень 2026". */
  month: string;
  amount: number;
}

/** Бренд у 3-місячній історії клієнта. */
export interface BrandSalesHistory {
  brandName: string;
  totalAmount: number;
  salesByMonth: SalesByMonth[];
}

/** Подія: зустріч / дзвінок. */
export interface ClientEvent {
  date: string;  // ISO або dd.MM.yyyy — уточнити при першому виклику
  comment: string;
}

/**
 * Семінар — окремий shape! 1С повертає `name` (назва семінару), не `comment`.
 * Поле повертається у `report.seminars` (НЕ `lastSeminars`).
 */
export interface ClientSeminar {
  date: string;
  name: string;
}

/** Базова інформація про клієнта у `getClientReport`. */
export interface ClientInfoFromReport {
  id: string;
  name: string;
  address: string;
  category: string;  // тут уже string, бо у звіті завжди заповнено
  phone: string;
  /** Освіта менеджера/власника клініки — «дерматолог», «косметолог», тощо. */
  education: string;
  /** Чи є підписані документи з EMET. */
  documents: boolean;
  /**
   * Властивості / прапори клієнта (від 2026-05-27 дороблено у 1С).
   * Текстові тегі типу «Валидний viber номер», «Зарегестрирован в LMS»,
   * «Доступна продажа Neuronox». Показуємо у expanded view як chips —
   * корисний контекст перед/під час дзвінка.
   */
  properties?: string[];
}

/**
 * Повна відповідь `getClientReport({clientID})`.
 *
 * Поля `yearlySales` залишене опційним — точний shape невідомий поки не
 * викличемо у проді.
 */
export interface ClientReport {
  clientInfo: ClientInfoFromReport;
  salesReport: {
    /** Початок 3-місячного діапазону. */
    periodStart: string;
    periodEnd: string;
    brands: BrandSalesHistory[];
  };
  lastMeetings: ClientEvent[];
  lastCalls: ClientEvent[];
  /**
   * ⚠️ 1С повертає під ключем `seminars` (НЕ `lastSeminars`!) і кожен запис
   * має `name` замість `comment`. Виявлено 2026-05-27.
   */
  seminars?: ClientSeminar[];
  /** Backward-compat — деякі версії 1С можуть повертати під цим ім'ям. */
  lastSeminars?: ClientEvent[];
  /**
   * 12-місячна історія продажів — той самий shape що `salesReport` але
   * охоплює рік замість 3 місяців. Меетинг використовує під назвою
   * `yearlySalesReport` (НЕ `yearlySales`). У звіті вкладка «Продажі (Год)».
   */
  yearlySalesReport?: {
    brands: BrandSalesHistory[];
    grandTotal?: number;
  };
}

/**
 * Об'єднана модель — клієнт у списку + (опціонально) тягнуті деталі.
 * Використовується у `useClientList` після того як проектуємо у UI.
 */
export interface ClientListItem extends ClientFromOneC {
  /** Опційний deep-профіль, тягнеться lazy при кліку на рядок. */
  report?: ClientReport;
}
