/**
 * Доменні типи модуля Рекламацій (Sprint B).
 *
 * Bitrix24 повертає поля з префіксами ufCrm4_* — адаптуємо їх у camelCase
 * через `adaptClaim`/`adaptComment` у bitrix-client.ts.
 */

import type { ClaimStatus, ClaimType, ProductCode } from './constants';

/** Коротка картка для списку `/claims`. */
export interface ClaimSummary {
  id: number;
  title: string;
  /** Витягуємо з `title` («Рекламація: X» → «X») для display. */
  client: string;
  /** ISO date YYYY-MM-DD з Bitrix `createdTime` (тільки дата, без часу). */
  date: string;
  status: ClaimStatus;
  /** Тип скарги для прев'ю у списку (наприклад «Якість препарату»). */
  claimType?: string | null;
  /** Препарат (UI-label, наприклад «NEURONOX») — щоб не відкривати картку
   *  і одразу бачити по якому продукту. */
  product?: string | null;
  /** Sprint 2B.B+: останнє повідомлення у timeline — від мед-відділу і
   *  менеджер ще не відповів. UI показує red badge «Нове повідомлення».
   *  False якщо коментарів нема, або менеджер відповів останнім. */
  hasUnread?: boolean;
  /** ISO timestamp останнього коментаря — для майбутнього сортування
   *  «нещодавно активні» / Web Push порівнянь. */
  lastCommentAt?: string;
}

/** Повна деталь для `/claims/[id]`. */
export interface ClaimDetail {
  id: number;
  title: string;
  client: string;
  date: string;
  status: ClaimStatus;
  /** Може бути null для legacy claims без поля. */
  product: ProductCode | string | null;
  lot: string | null;
  invoice: string | null;
  claimType: ClaimType | string | null;
  /** Серіалізовано як «label: value\n...» через `serializeClaimDetails`. */
  details: string | null;
  managerName: string | null;
  managerEmail: string | null;
  /** Прикріплені файли з форми створення (фото/відео). */
  attachments?: ClaimAttachment[];
}

/** Прикріплений файл до коментаря (Sprint 2B.B+). */
export interface ClaimAttachment {
  /** Stable URL з Bitrix (Disk). Якщо null — файл недоступний. */
  url: string;
  /** Original filename. */
  name: string;
  /** MIME префікс для рендерингу (image/video/other). */
  kind: 'image' | 'video' | 'other';
}

/** Один коментар у timeline (чат менеджер ↔ мед-відділ). */
export interface ClaimComment {
  id: string;
  /** HTML-text як Bitrix віддає. UI рендерить через dangerouslySetInnerHTML. */
  text: string;
  /** Display name автора. */
  author: string;
  /** 'manager' (з нашого додатку) або 'bitrix' (мед-відділ). Для розпізнавання
   *  у чат-UI: свої повідомлення зправа, чужі зліва. */
  authorType: 'manager' | 'bitrix';
  /** ISO timestamp з Bitrix. */
  createdAt: string;
  /** Прикріплені файли (фото/відео від менеджера чи мед-відділу). */
  attachments?: ClaimAttachment[];
}
