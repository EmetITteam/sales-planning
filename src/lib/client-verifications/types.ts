/**
 * Верифікація нових клієнтів через Bitrix SPA 1048.
 *
 * Bitrix-сторона:
 *   - SPA entityTypeId = 1048
 *   - Категорія за замовч = 10
 *   - Stages ENTITY_ID = DYNAMIC_1048_STAGE_10
 *
 * Workflow:
 *   1. Менеджер реєструє клієнта у 1С → потрапляє у резерв
 *   2. Бекенд паралельно POST у Bitrix → створюється картка зі статусом NEW
 *   3. КЦ обробляє у Bitrix → змінює статус
 *   4. Webhook → reclamation-app → POST /api/notifications/internal → колокольчик
 */

// === Bitrix константи (з REST на 2026-06-12) ===

export const BITRIX_SPA_ENTITY_TYPE_ID = 1048;
export const BITRIX_SPA_CATEGORY_ID = 10;
export const BITRIX_SPA_STAGE_ENTITY = 'DYNAMIC_1048_STAGE_10';

/** Технічні назви полів у Bitrix SPA 1048 (UF_CRM_<typeId>_*). */
export const BITRIX_FIELDS = {
  CLIENT_NAME: 'ufCrm_6_1781254273',     // ПІБ клієнта
  CLIENT_PHONE: 'ufCrm_6_1781254314',    // Телефон
  CLIENT_ADDRESS: 'ufCrm_6_1781254406',  // Адреса/місто
  CLIENT_ID_1C: 'ufCrm_6_1781254420',    // ID клієнта у 1С
  MANAGER_LOGIN: 'ufCrm_6_1781254435',   // Логін менеджера-ініціатора
  DOCUMENTS: 'ufCrm_6_1781265212',       // Прикріплені документи (multiple=Так, нове поле 2026-06-12)
} as const;

/** Stage IDs з Bitrix воронки. */
export const BITRIX_STAGES = {
  NEW: 'DT1048_10:NEW',                   // Створено (початок)
  IN_PROGRESS: 'DT1048_10:PREPARATION',   // У роботі КЦ
  CLARIFICATION: 'DT1048_10:CLIENT',      // На уточненні
  VERIFIED: 'DT1048_10:UC_119I4U',        // Верифіковано ✅
  REJECTED: 'DT1048_10:UC_OE18M6',        // Відхилено ❌
  // Системні (Bitrix створив за замовч, не використовуємо):
  SYSTEM_SUCCESS: 'DT1048_10:SUCCESS',
  SYSTEM_FAIL: 'DT1048_10:FAIL',
} as const;

/** Mapping Bitrix stage → наш локальний status (для UI). */
export const STAGE_TO_STATUS: Record<string, ClientVerificationStatus> = {
  [BITRIX_STAGES.NEW]: 'pending',
  [BITRIX_STAGES.IN_PROGRESS]: 'in_progress',
  [BITRIX_STAGES.CLARIFICATION]: 'clarification',
  [BITRIX_STAGES.VERIFIED]: 'verified',
  [BITRIX_STAGES.SYSTEM_SUCCESS]: 'verified',  // якщо КЦ переведе у системний SUCCESS
  [BITRIX_STAGES.REJECTED]: 'rejected',
  [BITRIX_STAGES.SYSTEM_FAIL]: 'rejected',
};

// === Domain types ===

export type ClientVerificationStatus =
  | 'pending'
  | 'in_progress'
  | 'clarification'
  | 'verified'
  | 'rejected';

export interface ClientVerification {
  id: number;
  clientId1c: string;
  bitrixItemId: number | null;
  managerLogin: string;
  clientName: string;
  status: ClientVerificationStatus;
  rejectionReason: string | null;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
}

/** DB row → domain (snake → camel). */
export interface ClientVerificationRow {
  id: number;
  client_id_1c: string;
  bitrix_item_id: number | null;
  manager_login: string;
  client_name: string;
  status: ClientVerificationStatus;
  rejection_reason: string | null;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
}

export function adaptClientVerification(row: ClientVerificationRow): ClientVerification {
  return {
    id: row.id,
    clientId1c: row.client_id_1c,
    bitrixItemId: row.bitrix_item_id,
    managerLogin: row.manager_login,
    clientName: row.client_name,
    status: row.status,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

/** Лейбл статусу для UI (українська). */
export const STATUS_LABEL: Record<ClientVerificationStatus, string> = {
  pending: 'На верифікації',
  in_progress: 'У роботі КЦ',
  clarification: 'Потрібне уточнення',
  verified: 'Верифіковано',
  rejected: 'Відхилено',
};

/** Чи це final-state (не очікуємо змін). */
export function isFinalStatus(s: ClientVerificationStatus): boolean {
  return s === 'verified' || s === 'rejected';
}
