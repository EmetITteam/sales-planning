/**
 * Анкета по брендах для модуля Рекламацій.
 *
 * Перенесено 1-в-1 з reclamation-app/public/index.html `FORMS_CONFIG`
 * (рядки 261-630). Структура полів затверджена мед-відділом — НЕ міняти
 * без узгодження.
 *
 * Якщо у Bitrix виник новий бренд (наприклад VITARAN V) — додати у
 * `constants.ts` `PRODUCTS` і додати маппінг у `productToBrandKey()`,
 * а тут НЕ дублювати — бренд VITARAN_V підв'яжеться до анкети `VITARAN`.
 *
 * Bитрикс отримує заповнені поля у форматі `key: value` (рядки), які
 * на стороні Bitrix зливаються у поле `ufCrm4_1769003784` (details).
 */

import type { ProductCode } from './constants';

export interface AnketaField {
  /** ID поля у формі (для state + key у submit JSON). */
  id: string;
  /** Українська label для UI. */
  label: string;
  /** Тип input. */
  type: 'text' | 'textarea' | 'date' | 'select';
  /** Опції для type='select'. */
  options?: string[];
}

/** Ключі брендів у схемі анкети. */
export type BrandKey = 'VITARAN' | 'IUSE' | 'NEURONOX' | 'NEURAMIS' | 'ELLANSE' | 'PETARAN' | 'OTHER';

/**
 * Маппінг продукт-код → ключ бренду в анкеті.
 * Усі 4 VITARAN_* ведуть на ту саму анкету 'VITARAN'.
 * 'OTHER' — спрощена форма (тільки опис проблеми + дата).
 */
export function productToBrandKey(product: ProductCode): BrandKey {
  if (product.startsWith('VITARAN')) return 'VITARAN';
  if (product === 'IUSE') return 'IUSE';
  if (product === 'NEURONOX') return 'NEURONOX';
  if (product === 'NEURAMIS') return 'NEURAMIS';
  if (product === 'ELLANSE') return 'ELLANSE';
  if (product === 'PETARAN') return 'PETARAN';
  return 'OTHER';
}

/** Поля анкети для кожного бренду. */
export const FORMS_CONFIG: Record<BrandKey, AnketaField[]> = {
  IUSE: [
    { id: 'date_appeal', label: 'Дата звернення пацієнта із скаргами', type: 'date' },
    { id: 'date_proc', label: 'Дата проведення процедури', type: 'date' },
    { id: 'tool', label: 'Чим проводили процедуру (голка, канюля), розмір', type: 'text' },
    { id: 'anest', label: 'Чи проводили знеболювання (так/ні, препарат)', type: 'text' },
    { id: 'tech', label: 'Опишіть техніку виконання процедури', type: 'textarea' },
    { id: 'compl_during', label: 'Чи були скарги під час процедури? (так/ні, на що)', type: 'text' },
    { id: 'post_proc', label: 'Особливості постпроцедурного періоду', type: 'textarea' },
    { id: 'compl_now', label: 'Скарги пацієнта в даний момент', type: 'textarea' },
    { id: 'st_localis', label: 'Status Localis (дані огляду)', type: 'textarea' },
    { id: 'allergy', label: 'Чи схильний пацієнт до алергічних реакцій?', type: 'text' },
    { id: 'sick', label: 'Чим хворів(ла) за останні 2 місяці?', type: 'text' },
    { id: 'cosm', label: 'Які косметичні засоби використовує пацієнт?', type: 'text' },
    { id: 'meds', label: 'Які ліки приймає зараз?', type: 'text' },
  ],

  VITARAN: [
    { id: 'date_complaint', label: 'Дата звернення пацієнта із скаргами', type: 'date' },
    { id: 'date_proc', label: 'Дата проведення процедури', type: 'date' },
    { id: 'tool', label: 'Чим проводили процедуру (голка, канюля), розмір', type: 'text' },
    { id: 'anesthesia', label: 'Чи проводили знеболювання (яким препаратом)', type: 'text' },
    { id: 'technique', label: 'Опишіть техніку виконання процедури', type: 'textarea' },
    { id: 'complaints_during', label: 'Скарги під час процедури', type: 'textarea' },
    { id: 'post_proc', label: 'Особливості постпроцедурного періоду', type: 'textarea' },
    { id: 'complaints_now', label: 'Скарги пацієнта в даний момент', type: 'textarea' },
    { id: 'status_localis', label: 'Status Localis (дані огляду)', type: 'textarea' },
    { id: 'allergies', label: 'Схильність пацієнта до алергічних реакцій, зокрема на ПН?', type: 'select', options: ['Ні', 'Так'] },
    { id: 'illness', label: 'Чим хворів(ла) за останні 2 місяці?', type: 'textarea' },
    { id: 'cosmetics', label: 'Які косметичні засоби використовує?', type: 'text' },
    { id: 'meds', label: 'Які ліки приймає зараз?', type: 'textarea' },
  ],

  NEURONOX: [
    { id: 'date_complaint', label: 'Дата звернення пацієнта', type: 'date' },
    { id: 'date_proc', label: 'Дата проведення процедури', type: 'date' },
    { id: 'date_dilution', label: 'Дата відновлення (розведення)', type: 'date' },
    { id: 'diluent', label: "Чим відновлювали та об'єм розчинника", type: 'text' },
    { id: 'anesthesia', label: 'Знеболення (препарат)', type: 'text' },
    { id: 'technique', label: 'Техніка виконання', type: 'textarea' },
    { id: 'complaints_during', label: 'Скарги під час процедури', type: 'textarea' },
    { id: 'post_proc', label: 'Постпроцедурний період', type: 'textarea' },
    { id: 'complaints_now', label: 'Скарги пацієнта в даний момент', type: 'textarea' },
    { id: 'status_localis', label: 'Status Localis', type: 'textarea' },
    { id: 'allergies', label: 'Схильність до алергічних реакцій?', type: 'select', options: ['Ні', 'Так'] },
    { id: 'illness', label: 'Чим хворів(ла) за останні 2 місяці?', type: 'textarea' },
    { id: 'meds', label: 'Які ліки приймає зараз?', type: 'textarea' },
  ],

  NEURAMIS: [
    { id: 'date_complaint', label: 'Дата звернення пацієнта', type: 'date' },
    { id: 'date_proc', label: 'Дата проведення процедури', type: 'date' },
    { id: 'tool', label: 'Інструмент (голка/канюля, розмір)', type: 'text' },
    { id: 'anesthesia', label: 'Знеболення (препарат)', type: 'text' },
    { id: 'complaints_during', label: 'Скарги під час процедури', type: 'textarea' },
    { id: 'post_proc', label: 'Особливості постпроцедурного періоду', type: 'textarea' },
    { id: 'complaints_now', label: 'Скарги на даний момент', type: 'textarea' },
    { id: 'status_localis', label: 'Status Localis (дані огляду)', type: 'textarea' },
    { id: 'prev_contour', label: 'Попередня пластика цієї зони: препарат?', type: 'textarea' },
    { id: 'prev_complaints', label: 'Скарги після попер. процедури?', type: 'textarea' },
    { id: 'hyaluronidase', label: 'Чи застосовували гіалуронідазу?', type: 'select', options: ['Ні', 'Так'] },
    { id: 'allergies', label: 'Схильність до алергічних реакцій?', type: 'select', options: ['Ні', 'Так'] },
    { id: 'illness', label: 'Чим хворів за останні 2 міс?', type: 'textarea' },
    { id: 'meds', label: 'Які ліки приймає зараз?', type: 'textarea' },
  ],

  ELLANSE: [
    { id: 'date_complaint', label: 'Дата звернення пацієнта із скаргами', type: 'date' },
    { id: 'date_proc', label: 'Дата проведення процедури', type: 'date' },
    { id: 'tool', label: 'Чим проводили процедуру (голка, канюля), розмір', type: 'text' },
    { id: 'complaints_during', label: 'Скарги під час процедури', type: 'textarea' },
    { id: 'post_proc', label: 'Особливості постпроцедурного періоду', type: 'textarea' },
    { id: 'complaints_now', label: 'Скарги пацієнта в даний момент', type: 'textarea' },
    { id: 'status_localis', label: 'Status Localis (дані огляду)', type: 'textarea' },
    { id: 'vaccination', label: 'Дата останньої вакцинації, яка саме вакцина?', type: 'text' },
    { id: 'autoimmune', label: 'Захворювання сполучної тканини або автоімунні?', type: 'textarea' },
    { id: 'diet', label: 'Чи дотримується пацієнт особливої дієти?', type: 'text' },
    { id: 'illness', label: 'Чим хворів(ла) за останні 2 місяці?', type: 'textarea' },
    { id: 'meds', label: 'Які ліки / БАДи приймає зараз?', type: 'textarea' },
    { id: 'other_procs', label: 'Які процедури робили в цей період (препарати, час)?', type: 'textarea' },
  ],

  PETARAN: [
    { id: 'date_complaint', label: 'Дата звернення пацієнта із скаргами', type: 'date' },
    { id: 'date_proc', label: 'Дата проведення процедури', type: 'date' },
    { id: 'tool', label: 'Чим проводили процедуру (голка, канюля), розмір', type: 'text' },
    { id: 'dilution_lido', label: 'Як проводили розведення, чи додавали лідокаїн?', type: 'text' },
    { id: 'complaints_during', label: 'Скарги під час процедури', type: 'textarea' },
    { id: 'post_proc', label: 'Особливості постпроцедурного періоду', type: 'textarea' },
    { id: 'complaints_now', label: 'Скарги пацієнта в даний момент', type: 'textarea' },
    { id: 'status_localis', label: 'Status Localis (дані огляду)', type: 'textarea' },
    { id: 'allergies_poly', label: 'Схильність до алергічних реакцій, зокрема на ПН?', type: 'select', options: ['Ні', 'Так'] },
    { id: 'autoimmune', label: 'Захворювання сполучної тканини або автоімунні?', type: 'textarea' },
    { id: 'massage', label: 'Чи дотримувався пацієнт вимог щодо масажу?', type: 'select', options: ['Так', 'Ні', 'Не знаю'] },
    { id: 'illness', label: 'Чим хворів(ла) за останні 2 місяці?', type: 'textarea' },
    { id: 'meds', label: 'Які ліки приймає зараз?', type: 'textarea' },
  ],

  OTHER: [
    { id: 'problem_desc', label: 'Детальний опис проблеми', type: 'textarea' },
    { id: 'date_proc', label: 'Дата процедури (якщо була)', type: 'date' },
  ],
};

/**
 * Отримати поля анкети для конкретного продукту.
 * Якщо тип скарги не з медичних (defect_pack, quality, effectiveness, other) —
 * анкета не показується (на стороні UI), але функція все одно повертає поля.
 */
export function getAnketaForProduct(product: ProductCode): AnketaField[] {
  return FORMS_CONFIG[productToBrandKey(product)];
}

/**
 * Серіалізувати заповнену анкету у простий текст для Bitrix-поля `details`.
 * Формат із reclamation-app: "label1: value1\nlabel2: value2\n..."
 */
export function serializeAnketa(
  product: ProductCode,
  values: Record<string, string>,
): string {
  const fields = getAnketaForProduct(product);
  return fields
    .map(f => `${f.label}: ${values[f.id] || '-'}`)
    .join('\n');
}

/**
 * Типи скарг, для яких показуємо медичну анкету.
 * Список з reclamation-app/public/index.html:907 — НЕ змінювати без узгодження
 * з мед-відділом.
 */
export const MEDICAL_CLAIM_TYPES = ['side_effect', 'complication', 'effectiveness'] as const;

/**
 * Серіалізувати повний claim у текст для Bitrix details, з урахуванням 3 кейсів:
 *  1. Медична скарга → повна анкета по бренду
 *  2. Не-медична → одне поле «Опис проблеми» (з відповідним лейблом)
 *  3. product='OTHER' → додає на початку «Назва продукту: ...»
 *
 * Перенесено з reclamation-app/public/index.html:893-946 (renderDynamicForm).
 */
export function serializeClaimDetails(
  product: ProductCode,
  claimType: string,
  values: Record<string, string>,
): string {
  const parts: string[] = [];

  // 1. Якщо product='OTHER' — додаємо назву продукту зверху
  if (product === 'OTHER' && values.other_product_name) {
    parts.push(`Назва продукту: ${values.other_product_name}`);
  }

  // 2. Медична / не-медична логіка
  const isMedical = (MEDICAL_CLAIM_TYPES as readonly string[]).includes(claimType);
  if (isMedical) {
    parts.push(serializeAnketa(product, values));
  } else {
    // Простий опис: лейбл відрізняється для «quality» vs решта
    const label =
      claimType === 'quality'
        ? 'Опис невідповідності якості'
        : 'Опис проблеми / браку';
    parts.push(`${label}: ${values.simple_desc || '-'}`);
  }

  return parts.join('\n');
}
