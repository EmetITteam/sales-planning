'use client';

/**
 * <FinalizationSummary> — зведення фіналізації Тижневого звіту по регіонах
 * (для оверсайт-ролей: директор/адмін/РОП). Аналог «Готовності планування».
 *
 * Показує: скільки регіонів здали звіт за тиждень, скільки ні. Розкривається у
 * список регіонів (✓ фіналізовано ким/коли · ✗ ще ні). Список регіонів —
 * ті, що видно юзеру (передає сторінка); статуси тягне сам за weekKey.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ClipboardCheck, CheckCircle2 } from 'lucide-react';

interface RegionRef { regionCode: string; regionName: string }
interface StatusRow { region_code: string; finalized_at: string | null; finalized_by: string | null }

export function FinalizationSummary({ regions, weekKey }: { regions: RegionRef[]; weekKey: string | null }) {
  const [statuses, setStatuses] = useState<Record<string, StatusRow>>({});
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!weekKey) { setStatuses({}); return; }
    let cancelled = false;
    fetch(`/api/weekly-report/finalize?week=${encodeURIComponent(weekKey)}&all=1`, { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : { statuses: [] }))
      .then((d: { statuses?: StatusRow[] }) => {
        if (cancelled) return;
        const map: Record<string, StatusRow> = {};
        for (const s of d.statuses ?? []) map[s.region_code] = s;
        setStatuses(map);
      })
      .catch(() => { /* мовчки */ });
    return () => { cancelled = true; };
  }, [weekKey]);

  const rows = useMemo(() => regions
    .map(r => ({ ...r, status: statuses[r.regionCode] ?? null }))
    .sort((a, b) => Number(!!a.status) - Number(!!b.status) || a.regionName.localeCompare(b.regionName)),
    [regions, statuses]);

  const total = regions.length;
  const done = rows.filter(r => r.status?.finalized_at).length;
  if (total === 0) return null;

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = done === total;
  const color = allDone ? 'emerald' : done > 0 ? 'amber' : 'rose';
  const dot = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500' }[color];
  const txt = { emerald: 'text-emerald-600', amber: 'text-amber-600', rose: 'text-rose-600' }[color];

  // Усі здали → компактний інлайн.
  if (allDone) {
    return (
      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-bold">Усі регіони здали звіт за тиждень</p>
            <p className="text-[11px] text-muted-foreground">{total} {total === 1 ? 'регіон' : 'регіонів'} · фіналізовано</p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap bg-emerald-500/12 border border-emerald-300/40 text-emerald-700">✓ ЗДАНО</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-white/40 transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-emet-50 flex items-center justify-center shrink-0">
          <ClipboardCheck className="h-5 w-5 text-emet-blue" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold">Фіналізація звітів · тиждень</p>
          <p className="text-[11px] text-muted-foreground">
            <span className={`font-bold ${txt}`}>{done}</span> з {total} регіонів здали звіт
          </p>
        </div>
        <div className="flex flex-col items-center gap-1 w-20 shrink-0">
          <div className="w-full h-2 rounded-full bg-[#f0f2f8] overflow-hidden">
            <div className={`h-full ${dot}`} style={{ width: `${pct}%` }} />
          </div>
          <span className={`text-[11px] font-bold leading-none ${txt}`}>{pct}%</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground/40 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-5 pb-4 pt-1 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5 bg-white/30 border-t border-white/40">
          {rows.map(r => {
            const fin = r.status?.finalized_at;
            const when = fin ? (() => { try { return new Date(fin).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } })() : '';
            return (
              <div key={r.regionCode} className="flex items-center gap-2 text-[12px] py-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${fin ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                <span className={`font-semibold flex-1 truncate ${fin ? '' : 'text-rose-700'}`}>{r.regionName}</span>
                {fin ? (
                  <span className="text-[10.5px] text-muted-foreground shrink-0 truncate max-w-[160px]" title={`${r.status?.finalized_by ?? ''} · ${when}`}>
                    {r.status?.finalized_by ?? '—'} · {when}
                  </span>
                ) : (
                  <span className="text-[10.5px] font-semibold text-rose-600 shrink-0">не здано</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
