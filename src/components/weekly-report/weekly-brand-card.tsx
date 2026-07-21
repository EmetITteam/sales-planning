'use client';

/**
 * <WeeklyBrandCard> — картка одного бренду у Тижневому звіті.
 *
 * Уся інформація по бренду компактно на карточці:
 *   Ряд 1 — метрики (План/Факт/%/мітка)
 *   Ряд 2 — Прогноз/Запл./Мин.міс. + чіпи категорій «заплановано→купили»
 *   Ретро — Причина/Дія: минулого тижня (read-only) + відмітка виконання Дії
 *           + кнопки заповнення на ЦЕЙ тиждень.
 *
 * (Фази B–E — фокус, топ-3 акції, пропозиція, динаміка % — додаються окремо.)
 */
import { useEffect, useState } from 'react';
import { PenLine, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { WeeklyNotesApi } from '@/lib/use-weekly-notes';
import { pctOf, formatUSD, formatPct } from '@/lib/format';

export interface BrandRow {
  code: string;
  name: string;
  plan: number;
  fact: number;
  pct: number;
  forecastPct: number;
  prevFact: number;
  prevPct: number;
}

interface Props {
  b: BrandRow;
  cats: { label: string; planned: number; bought: number }[];
  pace: number;
  planSeg?: { forecastFinalized?: number; gapFinalized?: number };
  notes: WeeklyNotesApi;       // цей тиждень
  prevNotes: WeeklyNotesApi;   // минулий тиждень
  /** % виконання на кінець минулого тижня (для динаміки). undefined = нема точки. */
  prevWeekPct?: number;
}

/** Мітка «В ПЛАНІ / ВІДСТАВАННЯ» за темпом виконання. */
function markOf(forecastPct: number): { label: string; cls: string } {
  return forecastPct >= 100
    ? { label: 'В ПЛАНІ', cls: 'bg-emerald-500/12 border-emerald-300/50 text-emerald-700' }
    : { label: 'ВІДСТАВАННЯ', cls: 'bg-rose-500/12 border-rose-300/50 text-rose-700' };
}

function Amt({ children }: { children: React.ReactNode }) {
  return <span className="amount">{children}</span>;
}

export function WeeklyBrandCard({ b, cats, pace, planSeg, notes, prevNotes, prevWeekPct }: Props) {
  const mk = markOf(b.forecastPct);
  const brandBuyers = cats.reduce((s, c) => s + c.bought, 0);
  const plannedSum = (planSeg?.forecastFinalized ?? 0) + (planSeg?.gapFinalized ?? 0);
  const expectedPct = b.plan > 0 ? (plannedSum / b.plan) * 100 : 0;
  const reasonDraft = [
    ...cats.map(c => `${c.label} ${c.planned}→${c.bought}`),
    `темп ${formatPct(b.forecastPct)}`,
    b.forecastPct < 100 ? `відставання −${Math.max(0, pace * 100 - b.pct).toFixed(1)}%` : 'в плані',
  ].join(' · ');

  // Ретро минулого тижня + відмітка виконання Дії.
  const lastReason = prevNotes.get('reason', b.code)?.text.trim();
  const lastAction = prevNotes.get('action', b.code)?.text.trim();

  return (
    <div className="px-4 py-2.5 border-b border-[#f0f2f8] last:border-b-0">
      {/* Ряд 1 — жорсткий grid: Бренд | ПЛАН | ФАКТ | % | МІТКА */}
      <div className="grid grid-cols-2 md:grid-cols-[1fr_96px_96px_64px_116px] gap-x-3 gap-y-1 items-center text-[13px]">
        <span className="col-span-2 md:col-span-1 min-w-0">
          <span className="font-bold text-[15px] leading-tight truncate block">{b.name}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{brandBuyers} клієнтів купили</span>
        </span>
        <span className="text-right font-mono amount tabular-nums text-[13px]">{formatUSD(b.plan)}</span>
        <span className="text-right font-mono amount tabular-nums text-[13px] text-emerald-700">{formatUSD(b.fact)}</span>
        <span className={`text-right font-bold tabular-nums text-[14px] ${b.pct >= 100 ? 'text-emerald-600' : b.pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{formatPct(b.pct)}</span>
        <span className="text-right flex flex-col items-end gap-0.5">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${mk.cls}`}>{mk.label}</span>
          {b.forecastPct < 100 && (
            <span className="text-[10px] font-bold text-rose-600 tabular-nums" title="Відставання від норми на дату (у відсоткових пунктах плану)">
              −{Math.max(0, pace * 100 - b.pct).toFixed(1)}%
            </span>
          )}
        </span>
      </div>

      {/* Динаміка % виконання: минулий тиждень → зараз (розрив скорочується?) */}
      {typeof prevWeekPct === 'number' && (() => {
        const d = b.pct - prevWeekPct;
        const up = d > 0.05, down = d < -0.05;
        const cls = up ? 'text-emerald-600' : down ? 'text-rose-600' : 'text-muted-foreground';
        const arrow = up ? '▲' : down ? '▼' : '▪';
        const note = up ? 'розрив скорочується' : down ? 'розрив росте' : 'без змін';
        return (
          <div className="mt-1 flex items-center gap-1.5 text-[11px] flex-wrap">
            <span className="text-muted-foreground">% виконання:</span>
            <span className="tabular-nums font-semibold text-slate-500">{formatPct(prevWeekPct)}</span>
            <span className="text-muted-foreground/40">→</span>
            <span className={`tabular-nums font-bold ${b.pct >= 100 ? 'text-emerald-600' : b.pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{formatPct(b.pct)}</span>
            <span className={`tabular-nums font-semibold ${cls}`}>{arrow} {d >= 0 ? '+' : ''}{d.toFixed(1)} <span className="font-normal text-muted-foreground/80">({note})</span></span>
          </div>
        );
      })()}

      {/* Ряд 2 — метрики зліва · чіпи категорій справа */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[10.5px] text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span><span className="text-amber-600">●</span> Прогноз (темп): <span className="font-bold text-amber-600">{formatPct(b.forecastPct)}</span></span>
          {b.plan > 0 && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span><span className="text-emet-blue">●</span> Запл.: <span className="font-bold text-emet-blue">{formatPct(expectedPct)}</span> · <span className="amount font-semibold">{formatUSD(plannedSum)}</span></span>
            </>
          )}
          <span className="text-muted-foreground/40">·</span>
          <span>Мин. міс. <Amt><span className="font-semibold">{formatUSD(b.prevFact)}</span></Amt> / {b.prevPct.toFixed(1)}%</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          {cats.map(c => (
            <span key={c.label} className="inline-flex items-center h-6 gap-1 rounded-md bg-[#f5f7fb] border border-[#e8ecf5] px-2">
              <span>{c.label}</span>
              <span className="tabular-nums font-semibold text-foreground/80">
                {c.planned}
                <span className="mx-0.5 text-muted-foreground font-normal">→</span>
                <span className={c.planned > 0 && c.bought >= c.planned ? 'text-emerald-600' : c.bought > 0 ? 'text-foreground' : 'text-rose-500'}>{c.bought}</span>
              </span>
              {c.planned > 0 && <span className="tabular-nums text-muted-foreground/70">· {pctOf(c.bought, c.planned).toFixed(0)}%</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Ретро: Причина / Дія — минулий тиждень + заповнення на цей */}
      <div className="mt-2 pt-2 border-t border-[#f0f2f8] space-y-1.5">
        {/* Причина */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-[46px] shrink-0 font-bold text-slate-500 uppercase tracking-wider text-[9.5px]">Причина</span>
          <span className="flex-1 min-w-0 truncate text-muted-foreground" title={lastReason || undefined}>
            {lastReason ? <>мин.&nbsp;тижд: «{lastReason}»</> : <span className="text-muted-foreground/40">минулого тижня не вказано</span>}
          </span>
          <BrandNote
            segmentName={b.name} label="Причина" value={notes.get('reason', b.code)?.text ?? ''}
            onSave={(t) => notes.save('reason', b.code, t)} draft={reasonDraft}
            hint="категорія → N із M → факт → висновок (числа з борду, висновок словами)."
            placeholder="Напр.: Активні 8 запл., купили 2 (25%) — просів темп, 4 з 12 не відвантажили…"
          />
        </div>

        {/* Дія + відмітка виконання минулотижневої Дії */}
        <div className="flex items-center gap-2 text-[11px] flex-wrap">
          <span className="w-[46px] shrink-0 font-bold text-slate-500 uppercase tracking-wider text-[9.5px]">Дія</span>
          <span className="flex-1 min-w-0 truncate text-muted-foreground" title={lastAction || undefined}>
            {lastAction ? <>мин.&nbsp;тижд: «{lastAction}»</> : <span className="text-muted-foreground/40">минулого тижня не вказано</span>}
          </span>
          {lastAction && <PromiseToggle code={b.code} notes={notes} />}
          <BrandNote
            segmentName={b.name} label="Дія" value={notes.get('action', b.code)?.text ?? ''}
            onSave={(t) => notes.save('action', b.code, t)}
            placeholder="Дія на тиждень / фокус по цьому бренду: кого відвідати, що дотиснути, дедлайн…"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Відмітка виконання минулотижневої «Дії»: [Так]/[Ні] + причина невиконання.
 * Зберігається у notes('promise_check', code) — done + text (причина, якщо Ні).
 */
function PromiseToggle({ code, notes }: { code: string; notes: WeeklyNotesApi }) {
  const st = notes.get('promise_check', code);
  const done = st?.done ?? null;
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(st?.text ?? '');
  useEffect(() => { setReason(st?.text ?? ''); }, [st?.text]);

  const setStatus = async (val: boolean) => {
    setBusy(true);
    await notes.save('promise_check', code, val ? '' : reason.trim(), val);
    setBusy(false);
  };
  const btn = (active: boolean, cls: string) =>
    `h-6 px-2 rounded-md text-[10px] font-bold border transition-colors disabled:opacity-50 ${active ? cls : 'bg-transparent border-[#e2e7ef] text-slate-500 hover:bg-[#f5f7fb]'}`;

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <button type="button" onClick={() => setStatus(true)} disabled={busy} className={btn(done === true, 'bg-emerald-500/15 border-emerald-300 text-emerald-700')}>Так</button>
      <button type="button" onClick={() => setStatus(false)} disabled={busy} className={btn(done === false, 'bg-rose-500/12 border-rose-300 text-rose-700')}>Ні</button>
      {done === false && (
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          onBlur={() => notes.save('promise_check', code, reason.trim(), false)}
          maxLength={500}
          placeholder="причина невиконання…"
          className="h-6 w-[160px] rounded-md border border-[rgba(6,42,61,0.15)] bg-white/70 px-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-emet-blue/30"
        />
      )}
    </span>
  );
}

/**
 * «Причина» / «Дія» по бренду — кнопка → діалог. Значення з weekly_report_notes,
 * збереження append-only через `onSave`. `draft` — болванка з числами.
 */
function BrandNote({ segmentName, label, placeholder, hint, draft, value, onSave }: {
  segmentName: string; label: string; placeholder: string; hint?: string; draft?: string;
  value: string; onSave: (text: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ta = 'w-full rounded-xl border border-[rgba(6,42,61,0.15)] bg-white/70 px-3 py-2 text-[13px] resize-y focus:outline-none focus:ring-2 focus:ring-emet-blue/30';
  const openDialog = () => { setText(value); setErr(null); setOpen(true); };
  const doSave = async () => {
    setBusy(true); setErr(null);
    const ok = await onSave(text.trim());
    setBusy(false);
    if (ok) setOpen(false); else setErr('Не вдалося зберегти — спробуйте ще раз');
  };
  return (
    <>
      <button
        onClick={openDialog}
        title={value || label}
        className={`inline-flex items-center h-6 gap-1 shrink-0 px-2 rounded-md text-[10.5px] font-semibold border transition-colors ${value ? 'text-emet-blue bg-emet-blue/10 border-emet-blue/25 hover:bg-emet-blue/15' : 'text-slate-600 bg-transparent border-[#e2e7ef] hover:bg-[#f5f7fb]'}`}
      >
        <PenLine className="h-3 w-3 shrink-0" />
        <span>{value ? `${label} ✓` : label}</span>
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-[15px]">{label} · {segmentName}</DialogTitle>
          {hint && <p className="text-[12px] text-muted-foreground -mt-1">{hint}</p>}
          {draft !== undefined && (
            <button
              type="button"
              onClick={() => setText(t => (t.trim() ? t : `${draft}. Висновок: `))}
              className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emet-blue bg-emet-blue/10 border border-emet-blue/25 hover:bg-emet-blue/15 transition-colors"
            >
              Підставити числа
            </button>
          )}
          <textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus rows={4} maxLength={2000} placeholder={placeholder} className={ta} />
          {err && <p className="text-[12px] text-rose-600">{err}</p>}
          <div className="flex flex-col gap-2 pt-1">
            <button onClick={doSave} disabled={busy} className="inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-emet-blue text-white font-semibold text-[13px] disabled:opacity-50 active:scale-[0.98] transition-transform">
              <Check className="h-4 w-4" /> {busy ? 'Зберігаю…' : 'Зберегти'}
            </button>
            <button onClick={() => { if (!busy) setOpen(false); }} className="h-10 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-foreground">Скасувати</button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
