'use client';

/**
 * <ReportFinalizeBar> — нижня панель фіналізації Тижневого звіту (для РМ).
 *
 * Не фіналізовано + є незаповнене → попередження зі списком, кнопка disabled.
 * Не фіналізовано + усе заповнено → кнопка «Фіналізувати звіт».
 * Фіналізовано → зелений стан (хто/коли) + «Пере-відкрити» (з підтвердженням).
 *
 * Повноту рахує сторінка (має доступ до заміток) і передає `missing[]`.
 */
import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Lock, Unlock, Loader2 } from 'lucide-react';

interface Props {
  regionName: string;
  missing: string[];
  finalizedAt: string | null;
  finalizedBy: string | null;
  busy: boolean;
  onFinalize: () => void;
  onUnfinalize: () => void;
}

export function ReportFinalizeBar({ regionName, missing, finalizedAt, finalizedBy, busy, onFinalize, onUnfinalize }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ── Фіналізовано ──
  if (finalizedAt) {
    const when = (() => { try { return new Date(finalizedAt).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return finalizedAt; } })();
    return (
      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold">Звіт фіналізовано · {regionName}</p>
            <p className="text-[11px] text-muted-foreground">
              {finalizedBy ? <>ким: <b className="text-foreground/80">{finalizedBy}</b> · </> : null}{when}
            </p>
          </div>
          {!confirmOpen ? (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[12px] font-semibold text-slate-600 bg-white/60 border border-[#e2e7ef] hover:bg-white/80 disabled:opacity-50 transition-colors"
            >
              <Unlock className="h-3.5 w-3.5" /> Пере-відкрити
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => { onUnfinalize(); setConfirmOpen(false); }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[12px] font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />} Підтвердити
              </button>
              <button type="button" onClick={() => setConfirmOpen(false)} className="h-9 px-3 rounded-xl text-[12px] font-medium text-muted-foreground hover:text-foreground">Скасувати</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const ready = missing.length === 0;

  // ── Не фіналізовано ──
  return (
    <div className="glass-card overflow-hidden">
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ready ? 'bg-emet-50' : 'bg-amber-50'}`}>
            {ready ? <Lock className="h-5 w-5 text-emet-blue" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold">Фіналізація звіту · {regionName}</p>
            <p className="text-[11px] text-muted-foreground">
              {ready
                ? 'Усе заповнено — можна фіналізувати звіт за тиждень.'
                : `Заповніть ${missing.length} ${missing.length === 1 ? 'пункт' : 'пунктів'}, щоб фіналізувати.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onFinalize}
            disabled={!ready || busy}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[13px] font-bold text-white bg-emet-blue disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Фіналізувати звіт
          </button>
        </div>

        {!ready && (
          <div className="rounded-xl border border-amber-200/70 bg-amber-50/60 px-3.5 py-2.5">
            <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-1.5">Ще не заповнено</p>
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {missing.map((m, i) => (
                <li key={i} className="text-[12px] text-amber-800 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />{m}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
