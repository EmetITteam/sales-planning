'use client';

import useSWR from 'swr';
import type { StatusTone } from './status-badge';
import type { PlanState } from './rop-report-aggregate';
import type { MarketSignal } from './market-signals-store';

export type { MarketSignal } from './market-signals-store';

export interface RopRegionRow {
  code: string;
  name: string;
  managerCount: number;
  pct: number;
  forecastPct: number;
  badge: { label: string; tone: StatusTone };
  redBrands: string[];
  worst: { code: string; name: string; pct: number; forecastPct: number; reason?: string; action?: string } | null;
  reds: Array<{ code: string; name: string; pct: number; forecastPct: number; reason: string | null; action: string | null }>;
  extraRedCount: number;
  promise: {
    status: 'yes' | 'no' | 'none';
    notDone: Array<{ brand: string; reason?: string; promiseText?: string }>;
    total: number;
    doneCount: number;
  };
  reportFinalized: boolean;
  submission: 'submitted' | 'partial' | 'empty';
  promises: Array<{ brand: string; promiseText: string; done: boolean | null; reason: string | null }>;
  plan: {
    state: PlanState;
    agreed: boolean;
    inTime: boolean;
    overdueWorkingDays: number;
    finalizedAt: string | null;
    lateReason: string | null;
  };
}

export interface RopReport {
  period: string;
  week: string;
  prevWeek: string | null;
  deadline: string;
  recipients: { report: string; escalation: string };
  hero: {
    companyPlan: number;
    companyFact: number;
    companyPct: number;
    companyForecastPct: number;
    norm: number;
    regionsByTone: Record<StatusTone, number>;
    planAgreedInTime: number;
    planTotal: number;
    overdueRegions: Array<{ region: string; days: number; reason: string | null }>;
    promisesDone: number;
    promisesTotal: number;
  };
  regions: RopRegionRow[];
  redZones: Array<{ brand: string; regions: Array<{ region: string; pct: number; forecastPct: number }>; count: number; escalate: boolean }>;
  promiseRegister: Array<{
    region: string;
    status: 'yes' | 'no' | 'none';
    total: number;
    doneCount: number;
    promises: Array<{ brand: string; promiseText: string; done: boolean | null; reason: string | null }>;
  }>;
  marketSignals: MarketSignal[];   // 4.5
  meta: Record<string, unknown>;
}

/** Зведений звіт РОП (усі 8 представництв). period 'YYYY-MM', week опційно. */
export function useRopReport(period: string | null, week?: string | null): {
  data: RopReport | null;
  loading: boolean;
  error: string | null;
} {
  const key = period ? `rop-report|${period}|${week ?? ''}` : null;
  const { data, error, isLoading } = useSWR(
    key,
    async () => {
      const qs = new URLSearchParams({ period: period! });
      if (week) qs.set('week', week);
      const res = await fetch(`/api/rop-report?${qs.toString()}`, { credentials: 'same-origin' });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
      }
      return (await res.json()) as RopReport;
    },
    { dedupingInterval: 120_000, revalidateOnFocus: false, revalidateIfStale: false, errorRetryCount: 1, keepPreviousData: true },
  );
  return { data: data ?? null, loading: isLoading, error: error ? String(error.message ?? error) : null };
}
