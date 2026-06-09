/**
 * Bitrix24 константи для модуля Рекламацій.
 *
 * Bitrix24 Smart Process Automation (SPA):
 *  - 1038 — Рекламації (claims)
 *  - 1042 — Менеджери (НЕ використовуємо, у нас своя auth)
 *
 * Кастомні поля з префіксами `ufCrm4_*` створені у Bitrix UI. Якщо адмін
 * Bitrix перейменує поле — треба змінити тут. Магічні номери ВЕЖКО НЕ
 * розкидати по коду — всі тут в одному файлі.
 *
 * Перенесено з reclamation-app/api/index.py (FIELDS_MAP).
 */

/** SPA entityTypeId для Bitrix REST виклику (`crm.item.add`/`list`). */
export const CLAIMS_SPA_ID = 1038;

/** Поле у claim з email менеджера (старі claims користують його як ID). */
export const FIELD_MANAGER_EMAIL_IN_CLAIM = 'ufCrm4_1769084999';

/** Поля у SPA 1038 Рекламації. */
export const CLAIM_FIELDS = {
  title: 'title',
  lot: 'ufCrm4_1769003758',
  invoice: 'ufCrm4_1769003770',
  details: 'ufCrm4_1769003784',
  files: 'ufCrm4_1769005413',
  manager: 'ufCrm4_1769005441',
  product: 'ufCrm4_1769005557',
  claim_type: 'ufCrm4_1769005573',
  manager_email: FIELD_MANAGER_EMAIL_IN_CLAIM,
} as const;

/** Bitrix user-IDs мед-відділу. Їм надсилається `im.notify` про нову претензію. */
export const MED_DEPT_USER_IDS = [2049, 12546, 2081, 2080, 6601] as const;

/** Типи скарг. Ключ — value у формі (для UI labels), значення — формат для Bitrix. */
export const CLAIM_TYPES = {
  defect_pack: 'Неякісна упаковка',
  quality: 'Якість препарату',
  effectiveness: 'Ефективність',
  side_effect: 'Побічна дія',
  complication: 'Ускладнення',
  other: 'Інше',
} as const;

export type ClaimType = keyof typeof CLAIM_TYPES;

/** Списки препаратів у dropdown. */
export const PRODUCTS = {
  VITARAN_I: 'HP CELL VITARAN I',
  VITARAN_II: 'HP CELL VITARAN II',
  VITARAN_TOX: 'HP CELL VITARAN TOX',
  VITARAN_W: 'HP CELL VITARAN Whitening',
  IUSE: 'IUSE SKIN BOOSTER HA20',
  NEURONOX: 'NEURONOX',
  NEURAMIS: 'NEURAMIS',
  ELLANSE: 'ELLANSE',
  PETARAN: 'PETARAN',
  OTHER: 'Інше / Космецевтика',
} as const;

export type ProductCode = keyof typeof PRODUCTS;
