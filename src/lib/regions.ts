/**
 * Централізована мапа регіонів EMET.
 *
 * ⚠️ ВАЖЛИВО: коди (DNP/KYV/...) — заглушки до отримання реального
 * формату від 1С. Коли 1С почне віддавати свій `regionCode` (наприклад
 * "01", "Дніпро" повним рядком, або номер підрозділу) — поправляємо
 * ТУТ В ОДНОМУ МІСЦІ. Усі дашборди, моки, спека звертаються через
 * REGIONS / regionByCode().
 */

export interface Region {
  /** Той рядок який поверне 1С у регіоні-полі. Зараз заглушка. */
  code: string;
  /** Повна назва підрозділу */
  name: string;
}

export const REGIONS: Region[] = [
  { code: 'DNP', name: 'Дніпро' },
  { code: 'KYV', name: 'Київ' },
  { code: 'ODS', name: 'Одеса' },
  { code: 'LVV', name: 'Львів' },
  { code: 'KHK', name: 'Харків' },
  { code: 'ZPR', name: 'Запоріжжя' },
  { code: 'VNN', name: 'Вінниця' },
];

/** Знайти регіон за кодом. Повертає undefined якщо не знайдений. */
export function regionByCode(code: string | undefined | null): Region | undefined {
  if (!code) return undefined;
  return REGIONS.find(r => r.code === code);
}

/** Назва регіону за кодом. Якщо не знайдений — повертає сам код як fallback. */
export function regionName(code: string | undefined | null): string {
  return regionByCode(code)?.name ?? code ?? '—';
}
