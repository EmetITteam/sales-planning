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
 * Сегменти — брендові групи для яких у 1С єдиний план у $ (не per-sub-brand).
 * Приклад: «IUSE» містить SB / hair / Coll. — план по сегменту, а не по трьом
 * підбрендам окремо.
 *
 * На дашборді сегмент відображається як ОДНА pill замість трьох підбрендів.
 * Hero % — грошовий (fact_sum / plan_sum по сегменту). У channel-блоках —
 * три sub-cards з клієнтськими метриками без % (тільки дані з strategic_targets
 * per підбренд).
 */
export const STRATEGIC_SEGMENTS = {
  IUSE: ['IUSE SB', 'IUSE hair', 'IUSE Coll.'] as StrategicBrand[],
} as const;

export type StrategicSegment = keyof typeof STRATEGIC_SEGMENTS;

/**
 * Бренди які «сховані» під сегментом (не показуємо їх окремо у пікері).
 */
export const SEGMENT_HIDDEN_BRANDS = new Set<StrategicBrand>(
  Object.values(STRATEGIC_SEGMENTS).flat() as StrategicBrand[],
);

/**
 * Список того що показуємо у пікері — не підбренди сегментів (SB/hair/Coll.),
 * а сегменти (IUSE) + окремі бренди.
 */
export const STRATEGIC_PICKER_ITEMS: Array<StrategicBrand | StrategicSegment> = [
  ...STRATEGIC_BRANDS.filter(b => !SEGMENT_HIDDEN_BRANDS.has(b)),
  ...(Object.keys(STRATEGIC_SEGMENTS) as StrategicSegment[]),
];

export function isSegment(id: string): id is StrategicSegment {
  return id in STRATEGIC_SEGMENTS;
}

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
 * Бренди які продає Колл-центр. Інші (Vitaran, Neuronox, Petaran тощо) КЦ
 * не продає — не показуємо цей канал для них.
 *
 * Правило узгоджено з ITD 2026-07-02.
 */
export const CALL_CENTER_BRANDS: Set<StrategicBrand> = new Set(['ESSE', 'IUSE Coll.', 'БАД']);

/**
 * Дистриб'ютори — активні тільки для Ellanse (2 фізичні локації: Полтава + Чернівці).
 * Колл-центр — активний тільки для CALL_CENTER_BRANDS.
 * Представництва — для всіх брендів.
 */
export function isChannelActive(brand: StrategicBrand, channel: StrategicChannel): boolean {
  if (channel === 'distributors') return brand === ELLANSE_BRAND;
  if (channel === 'call_center') return CALL_CENTER_BRANDS.has(brand);
  return true;
}

/**
 * Локації дистриб'юторів Ellanse. По кожній — окремий факт семінарів (per місяць).
 */
export const ELLANSE_DISTRIBUTOR_LOCATIONS = ['poltava', 'chernivtsi'] as const;
export type EllanseDistributorLocation = (typeof ELLANSE_DISTRIBUTOR_LOCATIONS)[number];

export const LOCATION_LABEL: Record<EllanseDistributorLocation, string> = {
  poltava: 'Полтава',
  chernivtsi: 'Чернівці',
};
