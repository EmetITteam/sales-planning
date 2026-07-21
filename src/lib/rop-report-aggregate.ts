/**
 * Pure-функції агрегації Зведеного звіту РОП (Лист 4). Без HTTP/1С/БД — вся
 * робота з уже зібраними per-region даними. Тестуються unit-тестами.
 *
 * Переиспользує єдині правила: `isRed`/`statusTone` (status-badge) та календар
 * робочих днів (working-days). Нічого не дублює.
 */
import { isRed, statusTone, type StatusTone } from './status-badge';
import { getNthWorkingDay, isWorkingDay, assertHolidaysConfigured } from './working-days';

// ── 4.1: свёртка бренд→регіон (причина/дія) ──────────────────────────────────
export interface BrandLine {
  code: string;
  name: string;
  forecastPct: number;
  reason?: string;   // weekly_report_notes.reason (per бренд)
  action?: string;   // weekly_report_notes.action (per бренд)
}
export interface WorstBrandResult {
  /** Гірший бренд регіону (min forecastPct) — його причину/дію показуємо у 4.1. */
  worst: BrandLine | null;
  /** Усі червоні бренди (forecastPct < 80), відсортовані за forecastPct зростанням. */
  red: BrandLine[];
  /** Скільки ЩЕ червоних окрім показаного (бейдж «+N»). Для чистого регіону = 0. */
  extraRedCount: number;
  hasRed: boolean;
}

/**
 * Обираємо бренд для причина/дія у рядку регіону: ГІРШИЙ за forecastPct.
 * Якщо є червоні — worst = найгірший червоний, «+N» = решта червоних.
 * Якщо червоних нема (чистий регіон) — показуємо гірший бренд без «+N».
 */
export function pickWorstBrand(brands: BrandLine[]): WorstBrandResult {
  if (brands.length === 0) return { worst: null, red: [], extraRedCount: 0, hasRed: false };
  const sorted = [...brands].sort((a, b) => a.forecastPct - b.forecastPct);
  const red = sorted.filter(b => isRed(b.forecastPct));
  return {
    worst: sorted[0],
    red,
    extraRedCount: Math.max(0, red.length - 1),
    hasRed: red.length > 0,
  };
}

// ── 4.1 / 4.3: свёртка обіцянок по регіону ───────────────────────────────────
export interface PromiseLine {
  brand: string;
  hadPromise: boolean;   // була дія у минулому звіті (обіцянка)
  done: boolean | null;  // promise_check.done (null = не відмічено)
  reason?: string;       // promise_check.text (причина невиконання)
  promiseText?: string;  // сама обіцянка (prev action)
}
export type PromiseStatus = 'yes' | 'no' | 'none';
export interface PromiseRollup {
  status: PromiseStatus;          // Так / Ні / — (не було або не відмічено)
  notDone: Array<{ brand: string; reason?: string; promiseText?: string }>;
  total: number;                  // скільки обіцянок було
  doneCount: number;
}

/**
 * Згортка обіцянок регіону у 3 стани:
 *   'no'   — є хоч одна явно НЕ виконана (done === false) → показуємо причини
 *   'yes'  — є виконані, і жодної не-виконаної
 *   'none' — обіцянок не було, або жодна не відмічена (done === null у всіх)
 */
export function rollupPromises(promises: PromiseLine[]): PromiseRollup {
  const withPromise = promises.filter(p => p.hadPromise);
  const total = withPromise.length;
  if (total === 0) return { status: 'none', notDone: [], total: 0, doneCount: 0 };
  const notDone = withPromise.filter(p => p.done === false);
  const doneCount = withPromise.filter(p => p.done === true).length;
  const status: PromiseStatus = notDone.length > 0 ? 'no' : doneCount > 0 ? 'yes' : 'none';
  return {
    status,
    notDone: notDone.map(p => ({ brand: p.brand, reason: p.reason, promiseText: p.promiseText })),
    total,
    doneCount,
  };
}

// ── 4.2: червоні зони по брендах (крос-регіон) ───────────────────────────────
export interface RegionRed { region: string; redBrands: string[] }
export interface ZoneRow {
  brand: string;
  regions: string[];
  count: number;
  escalate: boolean;   // count >= поріг → «→ CPO/CMO»
}

/**
 * Скільки регіонів мають кожен бренд «червоним». count >= escalateThreshold (4)
 * → окремим пунктом на CPO/CMO (правило регламенту 4.2). Сортування: count desc.
 */
export function crossRegionRedZones(regions: RegionRed[], escalateThreshold = 4): ZoneRow[] {
  const map = new Map<string, string[]>();
  for (const r of regions) {
    for (const b of r.redBrands) {
      const arr = map.get(b) ?? [];
      arr.push(r.region);
      map.set(b, arr);
    }
  }
  const rows: ZoneRow[] = [...map.entries()].map(([brand, regs]) => ({
    brand, regions: regs, count: regs.length, escalate: regs.length >= escalateThreshold,
  }));
  rows.sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand));
  return rows;
}

// ── 4.4: дедлайн узгодження плану + прострочення ─────────────────────────────
/** Дедлайн узгодження плану: 16:00 4-го робочого дня місяця period 'YYYY-MM'. */
export function computeRopDeadline(period: string): Date {
  const [y, m] = period.split('-').map(Number);
  assertHolidaysConfigured(y); // без свят дедлайн був би неточним (лише пн-пт)
  const d = getNthWorkingDay(y, m - 1, 4); // month 0-indexed
  d.setHours(16, 0, 0, 0);
  return d;
}

/** Робочі дні у інтервалі (from, to] — рахуємо ПІСЛЯ дати from, включно з датою to. */
export function workingDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + 1); // ПІСЛЯ дати дедлайну
  let count = 0;
  while (d <= end) {
    if (isWorkingDay(d)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export interface PlanStatus {
  agreed: boolean;            // всі менеджери регіону фіналізували план
  inTime: boolean;            // узгоджено <= дедлайн
  overdueWorkingDays: number; // роб. днів прострочення (0 якщо в термін або не узгоджено)
}

/**
 * Статус узгодження плану регіону vs дедлайн. finalizedAt = коли регіон повністю
 * узгодив план (max з фіналізацій менеджерів) або null якщо не всі узгодили.
 */
export function planDeadlineStatus(finalizedAt: Date | null, deadline: Date): PlanStatus {
  if (!finalizedAt) return { agreed: false, inTime: false, overdueWorkingDays: 0 };
  const inTime = finalizedAt <= deadline;
  return {
    agreed: true,
    inTime,
    overdueWorkingDays: inTime ? 0 : workingDaysBetween(deadline, finalizedAt),
  };
}

// ── hero: лічильники ─────────────────────────────────────────────────────────
export function countByTone(forecastPcts: number[]): Record<StatusTone, number> {
  const r: Record<StatusTone, number> = { ok: 0, warn: 0, bad: 0 };
  for (const p of forecastPcts) r[statusTone(p)]++;
  return r;
}
