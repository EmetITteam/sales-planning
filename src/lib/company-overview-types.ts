/**
 * Shared types for «Огляд компанії» (Admin overview) endpoint.
 *
 * Раніше ці інтерфейси були дубльовані у backend (route.ts) і frontend
 * (company-overview-dashboard.tsx) — будь-яка зміна shape ламала тип-контракт
 * мовчки. Тепер один source of truth.
 *
 * Особлива увага до `CompanyClientStats` — це 5-категорійна v2.5 структура
 * від 1С (active/sleeping/lost/new/none). Стара `ClientCategoryStats` у
 * types.ts — 3-категорійна (UI manager card), НЕ плутати.
 */

export type DivisionGroup =
  | 'representations'
  | 'call-center'
  | 'laserhouse'
  | 'adassa'
  | 'distributor-chuguy'
  | 'distributor-haylenko';

export interface SegmentTotals {
  plan: number;
  fact: number;
  prevFact: number;
}

export interface ManagerSummary {
  login: string;
  name: string;
  totalPlan: number;
  totalFact: number;
}

/** 5-категорійна статистика клієнтів з Action 5 v2.5 (per division aggregate).
 *  НЕ плутати з `ClientCategoryStats` у types.ts (3-кат, для manager card). */
export interface CompanyClientStats {
  active:   { total: number; bought: number };
  sleeping: { total: number; bought: number };
  lost:     { total: number; bought: number };
  new:      { total: number; bought: number };
  none:     { total: number; bought: number };
  totalClients: number;
  totalBought: number;
}

export interface DivisionDetails {
  /** Як приходить з 1С (canonical name) */
  divisionName: string;
  groupKey: DivisionGroup;
  /** Для UI — «Полтава», «Колл-центр», для reps = divisionName */
  displayName: string;
  /** segmentCode → totals */
  segments: Record<string, SegmentTotals>;
  totalPlan: number;
  totalFact: number;
  totalPrevFact: number;
  /** true якщо Action 5 повернув цей підрозділ з фактом > 0 */
  hasFact: boolean;
  managerCount: number;
  /** Per-manager breakdown для donut «Менеджери Представництв».
   *  Заповнено тільки для groupKey='representations'. */
  managers?: ManagerSummary[];
  /** v2.5 Action 5 clientStats — агрегат купивших клієнтів по 5 категоріях
   *  за поточний місяць (сума всіх менеджерів підрозділу). */
  clientStats?: CompanyClientStats;
  /** Те саме за попередній місяць — для delta-порівняння у hero/big card. */
  prevClientStats?: CompanyClientStats;
}

export interface CompanyOverviewResponse {
  asOfDate: string | null;
  prevMonthAsOfDate: string | null;
  divisions: DivisionDetails[];
  totalPlan: number;
  totalFact: number;
  totalPrevFact: number;
  /** displayNames підрозділів без factу */
  divisionsWithoutFact: string[];
  /** Канонічні 13 підрозділів яких НЕМАЄ у плані поточного періоду —
   *  показуємо у hero «Підрозділи не в плані» (legacy semantics). */
  divisionsNotInPlan: string[];
}

/** Helper: zero-init CompanyClientStats */
export function emptyCompanyClientStats(): CompanyClientStats {
  return {
    active: { total: 0, bought: 0 },
    sleeping: { total: 0, bought: 0 },
    lost: { total: 0, bought: 0 },
    new: { total: 0, bought: 0 },
    none: { total: 0, bought: 0 },
    totalClients: 0,
    totalBought: 0,
  };
}
