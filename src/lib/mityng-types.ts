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
  clientName: string;
  ClientCategory: ClientCategoryFromOneC;
  clientAddress: string;
  Phone: string;
  managerName: string;
  /**
   * У відповіді `findClient` — true якщо клієнт закріплений за caller-ом.
   * У `getManagerClients` — завжди true (повертає тільки своїх).
   */
  isMine: boolean;
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

/** Подія: зустріч / дзвінок / семінар. */
export interface ClientEvent {
  date: string;  // ISO або dd.MM.yyyy — уточнити при першому виклику
  comment: string;
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
  lastSeminars: ClientEvent[];
  /** Графік 12-міс — shape невідомий до першого виклику. */
  yearlySales?: unknown;
}

/**
 * Об'єднана модель — клієнт у списку + (опціонально) тягнуті деталі.
 * Використовується у `useClientList` після того як проектуємо у UI.
 */
export interface ClientListItem extends ClientFromOneC {
  /** Опційний deep-профіль, тягнеться lazy при кліку на рядок. */
  report?: ClientReport;
}
