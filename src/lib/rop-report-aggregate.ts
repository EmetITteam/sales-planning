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
  /** Виконання = факт/план (cumulative). ВІДОБРАЖАЄМО це — узгоджено з паспортом
   *  регіону і зіставно з нормою-на-дату. Червоне визначаємо по темпу (forecastPct). */
  pct: number;
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
export interface RegionRed { region: string; redBrands: Array<{ name: string; pct: number; forecastPct: number }> }
export interface ZoneRegion { region: string; pct: number; forecastPct: number }
export interface ZoneRow {
  brand: string;
  regions: ZoneRegion[];  // регіони де бренд червоний + його % (гірші перші)
  count: number;
  escalate: boolean;      // count >= поріг → «→ CPO/CMO»
}

/**
 * Скільки регіонів мають кожен бренд «червоним» + % бренда у кожному (для
 * наочності). count >= escalateThreshold (4) → окремим пунктом на CPO/CMO
 * (правило 4.2). Сортування брендів: count desc; регіонів усередині: % зростанням.
 */
export function crossRegionRedZones(regions: RegionRed[], escalateThreshold = 4): ZoneRow[] {
  const map = new Map<string, ZoneRegion[]>();
  for (const r of regions) {
    for (const b of r.redBrands) {
      const arr = map.get(b.name) ?? [];
      arr.push({ region: r.region, pct: b.pct, forecastPct: b.forecastPct });
      map.set(b.name, arr);
    }
  }
  const rows: ZoneRow[] = [...map.entries()].map(([brand, regs]) => ({
    brand,
    regions: [...regs].sort((a, b) => a.forecastPct - b.forecastPct),
    count: regs.length,
    escalate: regs.length >= escalateThreshold,
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

/**
 * Стан узгодження плану регіону:
 *   'not_started' — жодного запису у period_summaries (план не розпочато)
 *   'draft'       — є записи, але не всі менеджери фіналізували (чернетки)
 *   'in_time'     — повністю узгоджено <= дедлайн
 *   'late'        — повністю узгоджено, але ПІСЛЯ дедлайну (прострочено)
 */
export type PlanState = 'not_started' | 'draft' | 'in_time' | 'late';
export interface PlanStatusResult {
  state: PlanState;
  agreed: boolean;            // in_time | late (план повністю узгоджено)
  inTime: boolean;            // in_time
  overdueWorkingDays: number; // роб. днів прострочення (0 крім 'late')
  finalizedAt: Date | null;
}

/**
 * Статус узгодження плану регіону vs дедлайн.
 * ⚠️ Регіон БЕЗ жодного запису (hasAnyRecord=false) — це 'not_started', а НЕ
 * «узгоджено» (інакше «нема чернеток» було б вакуумно-істинним → фейкове ✓).
 */
export function resolvePlanStatus(input: {
  hasAnyRecord: boolean;         // хоч у одного менеджера регіону є рядок у period_summaries
  fullyFinalized: boolean;       // ВСІ менеджери фіналізували, без чернеток
  finalizedAt: Date | null;      // max(finalized_at) коли fullyFinalized
  deadline: Date;
}): PlanStatusResult {
  if (!input.hasAnyRecord) {
    return { state: 'not_started', agreed: false, inTime: false, overdueWorkingDays: 0, finalizedAt: null };
  }
  if (!input.fullyFinalized || !input.finalizedAt) {
    return { state: 'draft', agreed: false, inTime: false, overdueWorkingDays: 0, finalizedAt: null };
  }
  const inTime = input.finalizedAt <= input.deadline;
  return {
    state: inTime ? 'in_time' : 'late',
    agreed: true,
    inTime,
    overdueWorkingDays: inTime ? 0 : workingDaysBetween(input.deadline, input.finalizedAt),
    finalizedAt: input.finalizedAt,
  };
}

// ── стан подачі тижневого звіту регіону ──────────────────────────────────────
export type ReportSubmission = 'submitted' | 'partial' | 'empty';

/**
 * Стан подачі звіту регіону за тиждень:
 *   'submitted' — звіт фіналізовано (weekly_report_status.finalized_at)
 *   'partial'   — НЕ фіналізовано, але вже є замітки (причина/дія/обіцянки) →
 *                 заповнюється, рядок НЕ приглушуємо
 *   'empty'     — ні фіналізації, ні заміток → «звіт не подано», рядок приглушений
 *
 * ⚠️ Фіналізація звіту — рівня РЕГІОНУ (migration 056: РМ фіналізує на планёрці),
 * НЕ per-менеджер. Тому «подано N з M мгр» не рахуємо з наявних даних.
 */
export function reportSubmissionState(finalized: boolean, hasNotes: boolean): ReportSubmission {
  if (finalized) return 'submitted';
  if (hasNotes) return 'partial';
  return 'empty';
}

// ── hero: лічильники ─────────────────────────────────────────────────────────
export function countByTone(forecastPcts: number[]): Record<StatusTone, number> {
  const r: Record<StatusTone, number> = { ok: 0, warn: 0, bad: 0 };
  for (const p of forecastPcts) r[statusTone(p)]++;
  return r;
}
