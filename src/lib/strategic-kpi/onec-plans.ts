// Real money plans from 1C Action 4 (getRegistryPlans) - the same numbers
// shown by "Ogljad kompaniji":
//   ELLANSE representatives = $81,928 (June 2026).
//
// Returns nested Record<brand, Record<channel, plan_usd>>.
// divisionName -> channel mapping is identical to company-overview:
//   REP regions -> representatives; Kollcentr* -> call_center;
//   Poltava*/Chernovcy* -> distributors; Adassa / Lazerhauz* -> skipped.
//
// 1C segmentCode -> strategic brand. IUSE in 1C is ONE segment (no SB/hair/Coll split).
//
// Created 2026-07-02.

import { AsyncCache } from './cache-helper';

const CACHE = new AsyncCache<Record<string, Record<string, number>>>(5 * 60 * 1000, 'onec-plans');
const FACT_CACHE = new AsyncCache<Record<string, Record<string, number>>>(5 * 60 * 1000, 'onec-facts');

const DIRECTOR_PROXY_LOGIN = 'sdu@emet.in.ua';

// 8 representative-office regions (Ukrainian names, exactly as 1C Action 4 returns).
const REP = new Set(['Київ', 'Дніпро', 'Одеса', 'Харків', 'Запоріжжя', 'Вінниця', 'Миколаєв', 'Житомир']);

function divisionToChannel(name: string): string | null {
  if (REP.has(name)) return 'representatives';
  if (name.startsWith('Коллцентр')) return 'call_center';
  if (name === 'Полтава*' || name === 'Черновцы*') return 'distributors';
  return null; // Adassa / Lazerhauz* are not part of strategic-kpi
}

// 1C segmentCode -> strategic brand. IUSE is a segment (not a sub-brand).
// DRUGIETM (OTHER) and BAD have no 1C Action 4 plan, so they are not mapped.
const SEGMENT_TO_BRAND: Record<string, string> = {
  VITARAN: 'Vitaran',
  NEURONOX: 'Neuronox',
  ELLANSE: 'Ellanse',
  PETARAN: 'Petaran',
  NEURAMIS: 'Neuramis',
  EXOXE: 'EXOXE',
  ESSE: 'ESSE',
  IUSE: 'IUSE',
};

interface Plan { divisionName?: string; segmentCode?: string; planAmountUSD?: number | string }
interface RegionSeg { segmentCode?: string; factAmountUSD?: number | string }
interface RegionMgr { segments?: RegionSeg[] }
interface Region { regionName?: string; managers?: RegionMgr[] }

async function callOnec(action: string, payload: Record<string, unknown>): Promise<{ status: string; data?: { plans?: Plan[]; regions?: Region[] }; message?: string }> {
  const url = process.env.ONEC_BASE_URL;
  if (!url) throw new Error('ONEC_BASE_URL not configured');
  const login = process.env.ONEC_LOGIN;
  const password = process.env.ONEC_PASSWORD;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (login && password) {
    headers.Authorization = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
  }
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ action, payload }) });
  if (!r.ok) throw new Error(`1C ${action}: HTTP ${r.status}`);
  return r.json();
}

// $1 sentinel - trial newbie without a real plan. Ignore (same as company-overview).
function isTrial(amount: number): boolean {
  return amount > 0 && amount < 2;
}

// Money plans per (brand x channel) for a date range.
// dateFrom / dateTo in YYYY-MM-DD (inclusive).
export async function fetch1CBrandChannelPlans(
  dateFrom: string,
  dateTo: string,
): Promise<Record<string, Record<string, number>>> {
  return CACHE.getOrLoad(`${dateFrom}|${dateTo}`, () => doFetch(dateFrom, dateTo));
}

async function doFetch(dateFrom: string, dateTo: string): Promise<Record<string, Record<string, number>>> {
  const r = await callOnec('getRegistryPlans', { dateFrom, dateTo, login: DIRECTOR_PROXY_LOGIN });
  if (r.status !== 'success') throw new Error(`getRegistryPlans: ${r.message ?? 'unknown'}`);

  const out: Record<string, Record<string, number>> = {};
  for (const p of r.data?.plans ?? []) {
    const amt = Number(p.planAmountUSD ?? 0);
    if (!(amt > 0) || isTrial(amt)) continue;
    const brand = SEGMENT_TO_BRAND[String(p.segmentCode ?? '').toUpperCase().trim()];
    if (!brand) continue;
    const channel = divisionToChannel(String(p.divisionName ?? '').trim());
    if (!channel) continue;
    (out[brand] = out[brand] ?? {})[channel] = (out[brand][channel] ?? 0) + amt;
  }
  return out;
}

// Money FACT per (brand x channel) from 1C Action 5 (getRegionData) — the same
// source «Ogljad kompaniji» uses. period = YYYY-MM (one month only, as 1C
// getRegionData accepts a single month). includeAll: true — return all
// divisions (call-center, distributors), admin-only proxy login.
export async function fetch1CBrandChannelFacts(
  period: string,
): Promise<Record<string, Record<string, number>>> {
  return FACT_CACHE.getOrLoad(period, () => doFetchFacts(period));
}

async function doFetchFacts(period: string): Promise<Record<string, Record<string, number>>> {
  const r = await callOnec('getRegionData', { login: DIRECTOR_PROXY_LOGIN, period, includeAll: true });
  if (r.status !== 'success') throw new Error(`getRegionData: ${r.message ?? 'unknown'}`);

  const out: Record<string, Record<string, number>> = {};
  for (const reg of r.data?.regions ?? []) {
    const channel = divisionToChannel(String(reg.regionName ?? '').trim());
    if (!channel) continue; // Adassa / Lazerhauz* — not part of strategic-kpi
    for (const mgr of reg.managers ?? []) {
      for (const seg of mgr.segments ?? []) {
        const brand = SEGMENT_TO_BRAND[String(seg.segmentCode ?? '').toUpperCase().trim()];
        if (!brand) continue;
        const fact = Number(seg.factAmountUSD ?? 0);
        if (!(fact > 0)) continue;
        (out[brand] = out[brand] ?? {})[channel] = (out[brand][channel] ?? 0) + fact;
      }
    }
  }
  return out;
}
