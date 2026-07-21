'use client';

/**
 * /rop-report — Зведений звіт РОП → CSO/CMO (Лист 4). Усі 8 представництв.
 * Доступ: РОП/CSO/strategic/admin (canViewRopReport). РМ — редирект на '/'
 * (плюс серверний 403 у /api/rop-report).
 */
import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import { AppHeader } from '@/components/layout/app-header';
import { useAppStore } from '@/lib/store';
import { canViewRopReport } from '@/lib/feature-flags';
import { REPORT_RECIPIENT } from '@/lib/rop-report-config';
import { getMonthOptions } from '@/lib/periods';
import { useRopReport } from '@/lib/use-rop-report';
import { RopReportView } from '@/components/rop-report/rop-report-view';

export default function RopReportPage() {
  const router = useRouter();
  const user = useAppStore(s => s.user);
  const allowed = canViewRopReport(user);
  useEffect(() => { if (user && !allowed) router.replace('/'); }, [user, allowed, router]);

  const months = useMemo(() => getMonthOptions(), []);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const { data, loading, error } = useRopReport(allowed ? period : null);

  if (!user || !allowed) return null;

  return (
    <>
      <AppHeader />
      <main className="p-4 md:p-6 max-w-6xl mx-auto w-full min-w-0 space-y-4">
        {/* Шапка */}
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-emet-blue">Нарада відділу продажів</div>
            <h1 className="text-[22px] md:text-[26px] font-extrabold tracking-tight leading-tight">Зведений звіт РОП → {REPORT_RECIPIENT}</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {data ? <>дата звіту <b>нд {data.week.slice(8)}.{data.week.slice(5, 7)}</b> · наростаючим підсумком · подання <b>щовівторка до 10:00</b></> : 'завантаження…'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-2 text-[11.5px] font-semibold text-muted-foreground bg-white border border-slate-200 rounded-full px-3 py-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" />Live з 1С{data ? ` · на ${data.week.slice(8)}.${data.week.slice(5, 7)}` : ''}
            </span>
            <select value={period} onChange={e => setPeriod(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold focus:outline-none focus:ring-2 focus:ring-emet-blue/30">
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <button type="button" disabled title="у розробці"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-bold text-white bg-emet-blue opacity-40 cursor-not-allowed">
              <Download className="h-3.5 w-3.5" />Експорт .xlsx
            </button>
          </div>
        </div>

        {/* Контент */}
        {loading && !data && <div className="glass-card p-10 text-center text-[13px] text-muted-foreground">Збираю звіт по 8 представництвах…</div>}
        {error && !data && <div className="glass-card p-8 text-center text-[13px] text-rose-600">Не вдалося завантажити звіт: {error}</div>}
        {data && data.regions.length === 0 && !loading && <div className="glass-card p-10 text-center text-[13px] text-muted-foreground">немає даних за період</div>}
        {data && data.regions.length > 0 && <RopReportView data={data} />}
      </main>
    </>
  );
}
