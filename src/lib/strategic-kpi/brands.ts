/**
 * Список брендів + каналів для стратегічного дашборду.
 *
 * ⚠️ Ці 11 брендів — окремий продуктовий групування для аналітики
 * (не збігається з SEGMENTS у /lib/mock-data — там 9 сегментів планування).
 * Розшивка IUSE на SB/hair/Coll. + окремі Neuronox і БАД.
 *
 * Правила детекції з тексту номенклатури — у scripts/analytics-june-final.py
 * (потім портуватимемо на TS).
 */

export const STRATEGIC_BRANDS = [
  'Vitaran',
  'Neuronox',
  'Ellanse',
  'Petaran',
  'Neuramis',
  'EXOXE',
  'IUSE SB',
  'IUSE hair',
  'IUSE Coll.',
  'ESSE',
  'БАД',
] as const;

export type StrategicBrand = (typeof STRATEGIC_BRANDS)[number];

/**
 * Канали продажу для стратегічного дашборду.
 * - representatives: усі 8 регіонів (Київ, Одеса, ..., Житомир) агрегатом
 * - call_center: Колл-центр B2C
 * - distributors: дистриб'ютори, ТІЛЬКИ для Ellanse (кількість обучень/міс)
 */
export const STRATEGIC_CHANNELS = ['representatives', 'call_center', 'distributors'] as const;
export type StrategicChannel = (typeof STRATEGIC_CHANNELS)[number];

export const CHANNEL_LABEL: Record<StrategicChannel, string> = {
  representatives: 'Представництва',
  call_center: 'Колл-центр',
  distributors: 'Дистриб’ютори',
};

/**
 * Ellanse-only: показуємо блок навчань (нових обучених, провести навчань, ...).
 * Розширюємо якщо додадуться інші brand-specific метрики.
 */
export const ELLANSE_BRAND: StrategicBrand = 'Ellanse';

/**
 * Дистриб'ютори активні тільки для Ellanse.
 */
export function isChannelActive(brand: StrategicBrand, channel: StrategicChannel): boolean {
  if (channel === 'distributors') return brand === ELLANSE_BRAND;
  return true;
}
