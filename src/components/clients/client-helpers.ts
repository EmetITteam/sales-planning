/**
 * Pure helpers для модуля «Мої клієнти».
 * Без JSX, без React, без side-effects — все тестується юніт-тестами без jsdom.
 *
 * Виокремлено з `clients-page.tsx` (Day 2 рефактору god-component).
 */

import { mapClientCategory } from '@/lib/onec-adapters';

// ─────────────────────────────────────────────────────────────────────────
// Типи + константи категорій
// ─────────────────────────────────────────────────────────────────────────

/**
 * 5 реальних категорій 1С + окремий error-bucket `missing`
 * («Без категорії в 1С» — поле порожнє у контрагента 1С, треба виправити).
 */
export type UICategory = 'active' | 'sleeping' | 'new' | 'lost' | 'none' | 'missing';

export const CAT_LABEL: Record<UICategory, string> = {
  active:   'Активні',
  sleeping: 'Сплячі',
  new:      'Нові',
  lost:     'Втрачені',
  none:     'Без закупок',
  missing:  'Без категорії в 1С',
};

export const CAT_COLOR: Record<UICategory, { dot: string; ring: string; text: string }> = {
  active:   { dot: 'bg-emet-blue shadow-[0_0_6px_#066aab]',  ring: 'text-emet-blue',   text: 'text-emet-blue' },
  sleeping: { dot: 'bg-amber-500 shadow-[0_0_6px_#d97706]',   ring: 'text-amber-600',   text: 'text-amber-600' },
  new:      { dot: 'bg-emerald-500 shadow-[0_0_6px_#10b981]', ring: 'text-emerald-500', text: 'text-emerald-600' },
  lost:     { dot: 'bg-rose-500 shadow-[0_0_6px_#e11d48]',    ring: 'text-rose-500',    text: 'text-rose-600' },
  none:     { dot: 'bg-slate-400 shadow-[0_0_6px_#94a3b8]',   ring: 'text-slate-500',   text: 'text-slate-500' },
  // missing = warning: жовтогарячий щоб впадало в око
  missing:  { dot: 'bg-orange-500 shadow-[0_0_6px_#f97316]',  ring: 'text-orange-600',  text: 'text-orange-600' },
};

export const CAT_ORDER: UICategory[] = ['active', 'sleeping', 'new', 'lost', 'none', 'missing'];

// ─────────────────────────────────────────────────────────────────────────
// Category mapping
// ─────────────────────────────────────────────────────────────────────────

export function toUICategory(raw: string | null | undefined): UICategory {
  if (!raw || !raw.trim()) return 'missing';
  return mapClientCategory(raw);
}

/** Переклад 1С-категорії → UA chip-string у рядку клієнта. */
export function toUkrainianChip(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return 'Без категорії в 1С';
  const cat = toUICategory(raw);
  switch (cat) {
    case 'active':   return 'Активний';
    case 'sleeping': return 'Сплячий';
    case 'new':      return 'Новий';
    case 'lost':     return 'Втрачений';
    case 'none':     return 'Без закупок';
    case 'missing':  return 'Без категорії в 1С';
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Бренди — канонізація кодів сегментів
// ─────────────────────────────────────────────────────────────────────────

/**
 * Аліаси кодів брендів — нормалізують різні написання тієї самої сутності
 * у блоку «План × Факт» (3-міс історія лишається з усіма sub-брендами окремо).
 *
 * Правила за домовленістю 2026-05-27:
 *  - 'Vitaran Cosmetics' / 'Vitaran БАДи' / будь-який 'Vitaran ...' → OTHER
 *  - 'IUSE Collagen' / 'IUSE SkinBooster' / 'IUSE Hair' / 'IUSE ...' → IUSE
 *  - 'ДРУГИЕ ТМ' / 'Інші ТМ' / 'OTHER BRANDS' → OTHER
 */
const BRAND_CODE_ALIASES: Record<string, string> = {
  'ДРУГИЕ ТМ': 'OTHER',
  'другие тм': 'OTHER',
  'ДРУГИЕТМ': 'OTHER',
  'другиетм': 'OTHER',
  'Інші ТМ': 'OTHER',
  'інші тм': 'OTHER',
  'OTHER BRANDS': 'OTHER',
};

export function canonicalSegmentCode(raw: string): string {
  const cleaned = (raw ?? '').replace(/^_+/, '').trim();
  if (!cleaned) return raw;

  if (BRAND_CODE_ALIASES[cleaned]) return BRAND_CODE_ALIASES[cleaned];
  const lower = cleaned.toLowerCase();
  if (BRAND_CODE_ALIASES[lower]) return BRAND_CODE_ALIASES[lower];

  if (lower.startsWith('vitaran ')) return 'OTHER';
  if (lower.startsWith('iuse ')) return 'IUSE';

  return cleaned.toUpperCase();
}

/** Прибрати ведучий '_' (у 1С деякі бренди приходять як '_ESSE' / '_Neuronox'). */
export function cleanBrandName(name: string | undefined | null): string {
  return (name ?? '').replace(/^_+/, '').trim();
}

// ─────────────────────────────────────────────────────────────────────────
// Initials з назви клієнта (для аватара)
// ─────────────────────────────────────────────────────────────────────────

export function initials(name: string | null | undefined): string {
  const safe = (name ?? '').trim();
  if (!safe) return '?';
  // «Андрущук (Недолуга) Катерина» → «АН» (Андрущук + Недолуга), не «А(»
  const firstLetterOf = (s: string): string => {
    const m = s.match(/[\p{L}\p{N}]/u);
    return m ? m[0].toUpperCase() : '';
  };
  const parts = safe.split(/\s+/).slice(0, 2);
  return parts.map(firstLetterOf).join('') || '?';
}

// ─────────────────────────────────────────────────────────────────────────
// Місяці: парсинг RU/UA labels + форматування
// ─────────────────────────────────────────────────────────────────────────

const MONTH_PREFIXES_LOWER: string[][] = [
  ['янв', 'січ'],       // 01
  ['фев', 'лют'],       // 02
  ['март', 'берез'],    // 03
  ['апр', 'квіт'],      // 04
  ['май', 'трав'],      // 05
  ['июн', 'черв'],      // 06
  ['июл', 'лип'],       // 07
  ['авг', 'серп'],      // 08
  ['сент', 'верес'],    // 09
  ['окт', 'жовт'],      // 10
  ['нояб', 'лист'],     // 11
  ['дек', 'груд'],      // 12
];

/** Парсинг RU/UA month-label ('Май 2026' | 'Травень 2026') → YYYY-MM. Null якщо не вдалось. */
export function parseMonthLabelToYM(label: string | undefined | null): string | null {
  if (!label) return null;
  const low = label.toLowerCase().trim();
  const yearMatch = low.match(/(\d{4})/);
  if (!yearMatch) return null;
  const year = yearMatch[1];
  for (let i = 0; i < 12; i++) {
    if (MONTH_PREFIXES_LOWER[i].some(p => low.includes(p))) {
      return `${year}-${String(i + 1).padStart(2, '0')}`;
    }
  }
  return null;
}

export const UA_MONTHS = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

export function formatMonthLabel(yyyymm: string): string {
  const [y, mStr] = yyyymm.split('-');
  const m = parseInt(mStr, 10);
  return (UA_MONTHS[m - 1] || mStr) + ' ' + y;
}

export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const UA_MONTHS_SHORT = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];

/** UA-назва місяця у короткому форматі для YYYY-MM. */
export function fmtYMShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${UA_MONTHS_SHORT[(m - 1) % 12] ?? '?'} ${y}`;
}

/** Останні N ПОСЛІДОВНИХ місяців ДО currentYM (без нього), у порядку asc. */
export function lastNMonthsBefore(currentYM: string, n: number): string[] {
  const [cy, cm] = currentYM.split('-').map(Number);
  const out: string[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(cy, (cm - 1) - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Properties: фільтр технічних полів
// ─────────────────────────────────────────────────────────────────────────

/**
 * Технічні properties які НЕ показуємо менеджеру (service-info, не релевантне
 * під час дзвінка). Перевіряємо case-insensitive includes.
 */
const HIDDEN_PROP_PATTERNS = [
  'viber',  // «Валидный viber номер»
];

export function isHiddenProperty(prop: string): boolean {
  const low = prop.toLowerCase();
  return HIDDEN_PROP_PATTERNS.some(p => low.includes(p));
}

// ─────────────────────────────────────────────────────────────────────────
// Plural UA: рік / роки / років
// ─────────────────────────────────────────────────────────────────────────

/** UA-plural для слова «рік» (1 рік / 2-4 роки / 5-20 років / 21 рік ...). */
export function pluralUaYears(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'рік';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'роки';
  return 'років';
}
