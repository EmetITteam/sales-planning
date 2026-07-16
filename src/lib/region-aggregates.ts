/**
 * Агрегати з адаптованої відповіді Action 5 (`RegionDataResponse`).
 *
 * Дашборд РМ показує цифри по своєму регіону (зведено по всіх менеджерах).
 * Дашборд Директора — по всій компанії (зведено по всіх регіонах).
 *
 * Цей хелпер централізує всі обчислення щоб вони були ідентичні в обох
 * дашбордах і у формі (де теж може знадобитись підсумок).
 */

import type { RegionData, ManagerSegmentData, ClientCategoryStats } from './types';
import { SEGMENTS } from './mock-data';
import { isTrialBrandPlan } from './trial-manager';

/** Порожній агрегат клієнтів — стартова точка для reduce. */
function emptyClientStats(): ClientCategoryStats {
  return {
    active: { total: 0, bought: 0 },
    sleeping: { total: 0, bought: 0 },
    lost: { total: 0, bought: 0 },
    newClients: { total: 0, bought: 0 },
    none: { total: 0, bought: 0 },
    totalBought: 0,
    totalClients: 0,
  };
}

/**
 * v2.5: сума clientStats по всіх менеджерах регіону.
 *
 * Повертає null коли ХОЧА Б один менеджер не має clientStats — означає що 1С
 * на цьому запиті регресне з v2.5 (раніше до повного rolloutу був fallback,
 * наразі дашборд просто покаже 0/total — не критично).
 */
export function aggregateRegionClientStats(region: RegionData): ClientCategoryStats | null {
  const out = emptyClientStats();
  for (const m of region.managers) {
    if (!m.clientStats) return null;
    out.active.total += m.clientStats.active.total;
    out.active.bought += m.clientStats.active.bought;
    out.sleeping.total += m.clientStats.sleeping.total;
    out.sleeping.bought += m.clientStats.sleeping.bought;
    out.lost.total += m.clientStats.lost.total;
    out.lost.bought += m.clientStats.lost.bought;
    out.newClients.total += m.clientStats.newClients.total;
    out.newClients.bought += m.clientStats.newClients.bought;
    out.none.total += m.clientStats.none?.total ?? 0;
    out.none.bought += m.clientStats.none?.bought ?? 0;
    out.totalBought += m.clientStats.totalBought;
    out.totalClients += m.clientStats.totalClients;
  }
  return out;
}

/** v2.5: сума clientStats по всіх регіонах (для Director-дашборду). */
export function aggregateCompanyClientStats(regions: RegionData[]): ClientCategoryStats | null {
  const out = emptyClientStats();
  for (const region of regions) {
    const reg = aggregateRegionClientStats(region);
    if (!reg) return null; // якщо у будь-якому регіоні incomplete — UI покаже 0/total
    out.active.total += reg.active.total;
    out.active.bought += reg.active.bought;
    out.sleeping.total += reg.sleeping.total;
    out.sleeping.bought += reg.sleeping.bought;
    out.lost.total += reg.lost.total;
    out.lost.bought += reg.lost.bought;
    out.newClients.total += reg.newClients.total;
    out.newClients.bought += reg.newClients.bought;
    out.none.total += reg.none?.total ?? 0;
    out.none.bought += reg.none?.bought ?? 0;
    out.totalBought += reg.totalBought;
    out.totalClients += reg.totalClients;
  }
  return out;
}

export interface SegmentAggregate {
  segmentCode: string;
  segmentName: string;
  planAmount: number;
  factAmount: number;
  prevMonthFactAmount: number;
  prevMonthPlanAmount: number;
  /** Кількість менеджерів які мають план (>0) на цей сегмент. */
  managerCount: number;
}

export interface RegionAggregate {
  regionName: string;
  regionCode: string;
  totalPlan: number;
  totalFact: number;
  totalPrevMonthFact: number;
  totalPrevMonthPlan: number;
  managerCount: number;
  /** План/факт зведений по сегментах (9 брендів). */
  segments: SegmentAggregate[];
}

/** Зводимо один регіон по сегментах і всіх його менеджерах. */
export function aggregateRegion(region: RegionData): RegionAggregate {
  // Map<segmentCode, SegmentAggregate> — collect across managers.
  const bySeg = new Map<string, SegmentAggregate>();
  for (const seg of SEGMENTS) {
    bySeg.set(seg.code, {
      segmentCode: seg.code,
      segmentName: seg.name,
      planAmount: 0,
      factAmount: 0,
      prevMonthFactAmount: 0,
      prevMonthPlanAmount: 0,
      managerCount: 0,
    });
  }

  for (const m of region.managers) {
    for (const s of m.segments) {
      const agg = bySeg.get(s.segmentCode);
      if (!agg) continue; // невідомий сегмент — пропускаємо
      // $1 sentinel (trial-новачок без реального плану) НЕ додаємо у план.
      // Інакше факт $950 / план $1 = 95000% і Адасса показує "+$9" зайвих.
      // Узгоджено з Company Overview backend (route.ts).
      const planToAdd = isTrialBrandPlan(s.planAmount) ? 0 : s.planAmount;
      agg.planAmount += planToAdd;
      agg.factAmount += s.factAmount;
      agg.prevMonthFactAmount += s.prevMonthFactAmount ?? 0;
      agg.prevMonthPlanAmount += s.prevMonthPlanAmount ?? 0;
      if (planToAdd > 0) agg.managerCount += 1;
    }
  }

  const segments = SEGMENTS.map(s => bySeg.get(s.code)!);
  const totalPlan = segments.reduce((a, s) => a + s.planAmount, 0);
  const totalFact = segments.reduce((a, s) => a + s.factAmount, 0);
  // ⚠️ totalPrevMonthFact беремо з manager.totalPrevMonthFact (що 1С прислала),
  // НЕ суму по segments. Бо segments — лише по 9 наших брендах, а totalPrev
  // включає продажі по ВСІХ номенклатурах (можуть бути позасегментні).
  // Перевірено vs 1С звітом: $1,027,384 (1С) vs наша сума по сегментах $1,024,476.
  const totalPrevMonthFact = region.managers.reduce((a, m) => a + (m.totalPrevMonthFact ?? 0), 0);
  const totalPrevMonthPlan = segments.reduce((a, s) => a + s.prevMonthPlanAmount, 0);

  return {
    regionName: region.regionName,
    regionCode: region.regionCode,
    totalPlan,
    totalFact,
    totalPrevMonthFact,
    totalPrevMonthPlan,
    managerCount: region.managers.length,
    segments,
  };
}

/** Менеджер з підрахованими сумами (для списку у дашборді РМ). */
export interface ManagerAggregate {
  login: string;
  name: string;
  totalPlan: number;
  totalFact: number;
  totalPrevMonthFact: number;
  factPercent: number;
  /** Trial-новачок — 1С виставила $1 sentinel на КОЖЕН сегмент. factPercent примусово 0. */
  isTrial: boolean;
}

export function aggregateManagers(region: RegionData): ManagerAggregate[] {
  return region.managers.map(m => {
    const totalPlan = m.segments.reduce((a, s) => a + s.planAmount, 0);
    const totalFact = m.segments.reduce((a, s) => a + s.factAmount, 0);
    const totalPrevMonthFact = m.totalPrevMonthFact ?? 0;
    // Trial-новачок: 1С виставила $1 sentinel замість реального плану.
    // Без обробки: $1143 / $9 = 12700% — у managersBrief mini-list червоніє «12702%».
    const nonZeroPlans = m.segments.map(s => s.planAmount).filter(p => p > 0);
    const isTrial = nonZeroPlans.length > 0 && nonZeroPlans.every(p => p <= 1);
    return {
      login: m.login,
      name: m.name,
      totalPlan,
      totalFact,
      totalPrevMonthFact,
      factPercent: isTrial ? 0 : (totalPlan > 0 ? (totalFact / totalPlan) * 100 : 0),
      isTrial,
    };
  });
}

/** Усі регіони директора → зведена агрегація компанії. */
export function aggregateCompany(regions: RegionData[]): {
  totalPlan: number;
  totalFact: number;
  totalPrevMonthFact: number;
  totalPrevMonthPlan: number;
  segments: SegmentAggregate[];
  regionAggregates: RegionAggregate[];
} {
  const regionAggregates = regions.map(aggregateRegion);

  // Зводимо segments по всіх регіонах.
  const bySeg = new Map<string, SegmentAggregate>();
  for (const seg of SEGMENTS) {
    bySeg.set(seg.code, {
      segmentCode: seg.code,
      segmentName: seg.name,
      planAmount: 0,
      factAmount: 0,
      prevMonthFactAmount: 0,
      prevMonthPlanAmount: 0,
      managerCount: 0,
    });
  }
  for (const ra of regionAggregates) {
    for (const s of ra.segments) {
      const agg = bySeg.get(s.segmentCode)!;
      agg.planAmount += s.planAmount;
      agg.factAmount += s.factAmount;
      agg.prevMonthFactAmount += s.prevMonthFactAmount;
      agg.prevMonthPlanAmount += s.prevMonthPlanAmount;
      agg.managerCount += s.managerCount;
    }
  }
  const segments = SEGMENTS.map(s => bySeg.get(s.code)!);

  return {
    totalPlan: regionAggregates.reduce((a, r) => a + r.totalPlan, 0),
    totalFact: regionAggregates.reduce((a, r) => a + r.totalFact, 0),
    totalPrevMonthFact: regionAggregates.reduce((a, r) => a + r.totalPrevMonthFact, 0),
    totalPrevMonthPlan: regionAggregates.reduce((a, r) => a + r.totalPrevMonthPlan, 0),
    segments,
    regionAggregates,
  };
}

/** Знайти ManagerSegmentData за кодом сегмента (для drill-down детальніше). */
export function getManagerSegment(
  region: RegionData,
  managerLogin: string,
  segmentCode: string,
): ManagerSegmentData | null {
  const m = region.managers.find(x => x.login === managerLogin);
  if (!m) return null;
  return m.segments.find(s => s.segmentCode === segmentCode) ?? null;
}
