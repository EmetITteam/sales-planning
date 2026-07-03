/**
 * Класифікатор рядків продажів (line-items) для дашборду «Стратегія».
 *
 * ЄДИНЕ ДЖЕРЕЛО ІСТИНИ для правил бренд/канал/подарунок/ігнор/промо. Використовує
 * і backfill-скрипт, і live-sync endpoint (`/api/analytics/sales-sync`), щоб
 * правила не «розʼїжджалися».
 *
 * Портовано з `scripts/analytics-sales-backfill.mjs` (яке, у свою чергу, — з
 * `analytics-june-final.py`). Порядок BRAND_RULES ВАЖЛИВИЙ: специфічні першими.
 *
 * Створено 2026-07-03 (Фаза 1 live-плану).
 */

export type SalesChannel = 'representatives' | 'call_center';

/** Бренд не розпізнано — кладемо цей маркер (як у backfill). */
export const UNMAPPED_BRAND = 'НЕ_МАПНУТО';

// Порядок ВАЖЛИВИЙ: специфічні правила першими.
export const BRAND_RULES: Array<[string, RegExp]> = [
  ['Neuronox', /Neuronox|Ботулотоксин/i],
  ['Petaran', /PETARAN/i],
  ['Ellanse', /ELLANSE/i],
  ['Vitaran', /HP\s*CELL\s*VITARAN|VITARAN\s*(?:i\b|Tox|Whitening|Cosm|а\s*ассор)/i],
  ['EXOXE', /\bEXOXE\b(?!-)/i],
  ['Neuramis', /NEURAMIS/i],
  ['IUSE SB', /IUSE.*Skin\s*Booster|Skin\s*Booster/i],
  ['IUSE hair', /IUSE.*(?:hair|волос)|IUSE\s+H\b/i],
  ['IUSE Coll.', /IUSE.*Collagen|Marine\s*Collagen/i],
  ['ESSE', /\.?ESSE\b|C5\.ESSE|SkinTrial|Skin\s*Trial|Gift\s*set\s*2026|ESSE\s*(?:Gel|Cream|Serum|Emulsion|Tonic|Cleanser|Skin|Dry|Set|Bakuchiol|Biome|Concealer|tube|Sensitive)/i],
  ['БАД', /MAGNOX|Дієтична\s*добавк|Диетическая\s*добавк|БАД/i],
];

export function detectBrand(product: string): string | null {
  for (const [brand, pat] of BRAND_RULES) {
    if (pat.test(product)) return brand;
  }
  return null;
}

// Товари яких повністю ІГНОРУЄМО (розхідники, косметика без бренду).
const IGNORE_PATTERNS: RegExp[] = [
  /Exosome-PDRN/i,
  /PURE\s*CENTELLA/i,
  /Холодоагент/i,
  /Канюл/i,
  /\bГолк\b|Screw\s*Needles/i,
  /Шприц/i,
  /Картридж/i,
  /Насадк/i,
  /Beach\s*Bag|Пляжна\s*сумка|Мішечок|Сумка\s*(?:C1|Esse)/i,
  /\bсаше\b|sachet/i,
  /\bTESTER\b|ТЕСТЕР|тестер/i,
];

export function isIgnoredProduct(product: string): boolean {
  return IGNORE_PATTERNS.some(pat => pat.test(product));
}

// Поводи скидки — рядок виключаємо повністю (не рахуємо як промо).
const EXCLUDE_DISCOUNT_PATTERNS: RegExp[] = [
  /Рекламная\s*продукция/i,
  /День\s*Рождения|ДР\b/i,
  /Гонорар/i,
];

export function isExcludedDiscount(discount?: string | null): boolean {
  if (!discount) return false;
  return EXCLUDE_DISCOUNT_PATTERNS.some(pat => pat.test(discount));
}

export function isAmbassador(discount?: string | null): boolean {
  return !!discount && /Амбассадор/i.test(discount);
}

export function isGiftInDiscount(discount?: string | null): boolean {
  return !!discount && /Подар(ок|унок)/i.test(discount);
}

export function detectGiftBrand(discount?: string | null): string | null {
  if (!isGiftInDiscount(discount)) return null;
  const m = (discount as string).match(/Подар(?:ок|унок)\s+([^(]+?)(?:\s*\(|$)/i);
  if (!m) return null;
  return detectBrand(m[1]);
}

export function detectChannel(division?: string | null): SalesChannel {
  const d = (division || '').toLowerCase().trim();
  if (d.includes('коллцентр') || d.includes('call center') || d.includes('call-center')) {
    return 'call_center';
  }
  return 'representatives';
}

// Бренд-ТРИГЕР промо: бренд, який треба було купити щоб отримати подарунок.
// Береться з тексту поводу ДО слова «Подарок/Подарунок».
// Приклад: «VITARAN а ассор.на 700дол+Подарок Marine Collagen» → 'Vitaran'.
// Використовується щоб віднести гроші покупки до подарункового промо (а не до
// звичайної знижки того ж документа) — без подвоєння.
export function detectPromoTriggerBrand(discount?: string | null): string | null {
  if (!discount) return null;
  const triggerPart = discount.split(/Подар(?:ок|унок)/i)[0];
  return detectBrand(triggerPart);
}

export interface RawSaleFields {
  product: string;
  discount?: string | null;
  division: string;
  sumUsd: number;
}

export interface SaleClassification {
  brand: string;            // розпізнаний бренд або UNMAPPED_BRAND
  channel: SalesChannel;
  isIgnored: boolean;       // розхідник/косметика без бренду
  isGift: boolean;          // подарунковий рядок (sumUsd=0 + повод «Подарок»)
  isExcluded: boolean;      // Реклама/ДР/Гонорар/Амбассадор-free
  giftBrand: string | null; // бренд подарунка (для промо-агрегації)
  promoTriggerBrand: string | null; // бренд-тригер подарунка (тільки для gift-рядків)
}

/**
 * Класифікує один рядок продажу. Логіка ІДЕНТИЧНА backfill-скрипту:
 *   isIgnored  = немає бренду І товар у ignore-списку
 *   isGift     = повод «Подарок» І сума 0
 *   isExcluded = excluded-повод АБО (амбассадор І сума 0)
 */
export function classifySale(r: RawSaleFields): SaleClassification {
  const brand = detectBrand(r.product);
  const channel = detectChannel(r.division);
  const isIgnored = !brand && isIgnoredProduct(r.product);
  const isGift = isGiftInDiscount(r.discount) && r.sumUsd === 0;
  const isExcluded = isExcludedDiscount(r.discount) || (isAmbassador(r.discount) && r.sumUsd === 0);
  return {
    brand: brand || UNMAPPED_BRAND,
    channel,
    isIgnored,
    isGift,
    isExcluded,
    giftBrand: detectGiftBrand(r.discount),
    // Тригер потрібен лише для подарункових рядків (щоб віднести гроші покупки).
    promoTriggerBrand: isGift ? detectPromoTriggerBrand(r.discount) : null,
  };
}
