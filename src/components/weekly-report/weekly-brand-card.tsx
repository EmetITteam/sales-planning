'use client';

/**
 * <WeeklyBrandCard> — картка одного бренду у Тижневому звіті.
 *
 * Три візуальні зони (щоб не було «наляписто»):
 *   1. ШАПКА       — бренд + План→Факт→%→бейдж + динаміка %.
 *   2. МЕТРИКИ      — приглушені чіпи (Прогноз/Запл./Мин.міс), воронка клієнтів
 *                    з міні-барами, топ-акції (2 + «+N ще»), фокус.
 *   3. РАБОЧА ЗОНА  — Причина / Дія / Пропозиція (фон, лейбли, кнопки праворуч).
 *
 * Дані/пропси/збереження — без змін (лише реструктуризація + стилі).
 */
import { useEffect, useState } from 'react';
import { PenLine, Check, Target, Flame, Plus, Loader2, MessageCircle, Lightbulb, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { WeeklyNotesApi } from '@/lib/use-weekly-notes';
import type { BrandInsight, PromoOut } from '@/lib/weekly-brand-insights';
import { pctOf, formatUSD, formatPct } from '@/lib/format';
import { PerfBadge } from '@/components/ui/perf-badge';
import { StatChip } from '@/components/ui/stat-chip';

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
  cats: { label: string; planned: number; bought: number; prevBought?: number }[];
  pace: number;
  planSeg?: { forecastFinalized?: number; gapFinalized?: number };
  notes: WeeklyNotesApi;       // цей тиждень
  prevNotes: WeeklyNotesApi;   // минулий тиждень
  /** % виконання на кінець минулого тижня (для динаміки). undefined = нема точки. */
  prevWeekPct?: number;
  /** Інсайти з sales: топ-3 акції + купили по фокусу. */
  insight?: BrandInsight;
}

// ── helpers ──────────────────────────────────────────────────────────────────
/** Колір % — за планом бренду: у плані (темп ≥100) зелений, інакше червоний. */
function planColor(forecastPct: number): string {
  return forecastPct >= 100 ? 'text-emerald-600' : 'text-rose-600';
}
function Amt({ children }: { children: React.ReactNode }) {
  return <span className="amount">{children}</span>;
}

export function WeeklyBrandCard({ b, cats, pace, planSeg, notes, prevNotes, prevWeekPct, insight }: Props) {
  // «N клієнтів купили» = сума воронки (bought по категоріях) — ТОТ ЖЕ источник,
  // что и сама воронка ниже, тождественно. Раньше брали insight.totalBuyers (наша
  // sales) — для 8 реальних брендів воно збігається з воронкою (перевірено), але
  // для службового OTHER/«Інші ТМ» розходилось (sales кладе непізнане у
  // НЕ_МАПНУТО, 1С — у ДРУГИЕТМ): 7 vs 19. Сума воронки прибирає це розходження.
  // Акції/фокус (insight, sales) — суб-деталі; для реальних брендів sales=воронка,
  // тож акція ніколи не більша за шапку.
  const brandBuyers = cats.reduce((s, c) => s + c.bought, 0);
  const plannedSum = (planSeg?.forecastFinalized ?? 0) + (planSeg?.gapFinalized ?? 0);
  const expectedPct = b.plan > 0 ? (plannedSum / b.plan) * 100 : 0;
  const reasonDraft = [
    ...cats.map(c => `${c.label} ${c.planned}→${c.bought}`),
    `темп ${formatPct(b.forecastPct)}`,
    b.forecastPct < 100 ? `відставання −${Math.max(0, pace * 100 - b.pct).toFixed(1)}%` : 'в плані',
  ].join(' · ');

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <BrandCardHeader b={b} brandBuyers={brandBuyers} prevWeekPct={prevWeekPct} />
      <BrandCardMetrics b={b} cats={cats} plannedSum={plannedSum} expectedPct={expectedPct} insight={insight} />
      <BrandCardWorkzone b={b} notes={notes} prevNotes={prevNotes} reasonDraft={reasonDraft} />
    </div>
  );
}

// ── Зона 1: ШАПКА ─────────────────────────────────────────────────────────────
function BrandCardHeader({ b, brandBuyers, prevWeekPct }: { b: BrandRow; brandBuyers: number; prevWeekPct?: number }) {
  return (
    <div className="px-4 pt-3 pb-1.5 flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
      <div className="min-w-0">
        <div className="font-bold text-[18px] leading-tight truncate">{b.name}</div>
        <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{brandBuyers} клієнтів купили</div>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        {/* Лінійка План | Факт | Викон.(% + бейдж) — з роздільниками */}
        <div className="flex items-stretch divide-x divide-slate-200 rounded-lg border border-slate-200 bg-slate-50/40">
          <StatCol label="План"><span className="amount">{formatUSD(b.plan)}</span></StatCol>
          <StatCol label="Факт"><span className="amount text-emerald-700">{formatUSD(b.fact)}</span></StatCol>
          <StatCol label="Викон.">
            <span className="flex items-center gap-2">
              <span className={`font-bold tabular-nums text-[16px] md:text-[18px] leading-none ${planColor(b.forecastPct)}`}>{formatPct(b.pct)}</span>
              <PerfBadge forecastPct={b.forecastPct} />
            </span>
          </StatCol>
        </div>
        {/* Динаміка — під лінійкою, справа, приглушено; кольорова лише дельта */}
        {typeof prevWeekPct === 'number' && (() => {
          const d = b.pct - prevWeekPct;
          const up = d > 0.05, down = d < -0.05;
          const cls = up ? 'text-emerald-600' : down ? 'text-rose-600' : 'text-muted-foreground';
          const arrow = up ? '▲' : down ? '▼' : '▪';
          return (
            <div className="text-[11px] tabular-nums text-muted-foreground/70 flex items-center gap-1 self-end" title="Динаміка % виконання: минулий тиждень → зараз">
              <span>{formatPct(prevWeekPct)}</span>
              <span className="text-muted-foreground/40">→</span>
              <span>{formatPct(b.pct)}</span>
              <span className={`font-semibold ${cls}`}>{arrow} {d >= 0 ? '+' : ''}{d.toFixed(1)}</span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/** Колонка лінійки: лейбл зверху (uppercase, slate-400), значення знизу. */
function StatCol({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-end justify-center px-3 md:px-4 py-1.5">
      <div className="text-[9px] md:text-[10px] uppercase tracking-wider text-slate-400 leading-none mb-1">{label}</div>
      <div className="font-mono tabular-nums text-[14px] md:text-[16px] leading-none">{children}</div>
    </div>
  );
}

// ── Зона 2: МЕТРИКИ ───────────────────────────────────────────────────────────
function BrandCardMetrics({ b, cats, plannedSum, expectedPct, insight }: {
  b: BrandRow; cats: Props['cats']; plannedSum: number; expectedPct: number; insight?: BrandInsight;
}) {
  const hasFocus = !!insight && (insight.focusParticipants > 0 || insight.focusBought > 0);
  const hasPromos = !!insight && insight.topPromos.length > 0;
  return (
    <div className="px-4 pb-2.5 space-y-1.5 text-[10.5px] text-muted-foreground">
      {/* Ряд 1 — метрики-чіпи */}
      <div className="flex flex-wrap items-center gap-1.5">
        <StatChip dot="amber">Прогноз (темп) <b className="text-amber-600">{formatPct(b.forecastPct)}</b></StatChip>
        {b.plan > 0 && <StatChip dot="blue">Заплановано <b className="text-emet-blue">{formatPct(expectedPct)}</b> · <Amt><span className="font-semibold text-foreground/70">{formatUSD(plannedSum)}</span></Amt></StatChip>}
        <StatChip>Мин. міс. <Amt><span className="font-semibold text-foreground/70">{formatUSD(b.prevFact)}</span></Amt> / {b.prevPct.toFixed(1)}%</StatChip>
      </div>

      {/* Ряд 2 — воронка клієнтів (міні-бари) */}
      <div className="flex flex-wrap items-stretch gap-1.5">
        {cats.map(c => <FunnelChip key={c.label} c={c} />)}
      </div>

      {/* Фокус + топ-акції */}
      {(hasFocus || hasPromos) && (
        <div className="space-y-1 pt-0.5">
          {hasFocus && insight && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Target className="h-3 w-3 text-violet-500 shrink-0" />
              <span>Фокус:</span>
              {insight.focusParticipants > 0 && <span className="font-bold tabular-nums text-foreground/80">{insight.focusParticipants} учасн.</span>}
              <span>купили</span>
              <span className="font-bold tabular-nums text-emerald-700">{insight.focusBought}</span>
              {insight.focusParticipants > 0 && <span className="tabular-nums font-bold text-emet-blue">({Math.round((insight.focusBought / insight.focusParticipants) * 100)}%)</span>}
              {insight.focusSum > 0 && <span className="amount">· ${insight.focusSum.toLocaleString('en-US')}</span>}
            </div>
          )}
          {hasPromos && insight && <TopPromos promos={insight.topPromos} />}
        </div>
      )}
    </div>
  );
}

function FunnelChip({ c }: { c: { label: string; planned: number; bought: number; prevBought?: number } }) {
  const hasPlan = c.planned > 0;
  const pct = hasPlan ? Math.round(pctOf(c.bought, c.planned)) : 0;
  // Колір бара за %: ≥70 зелений · 40–69 синій · <40 оранжевий. Червоний не використовуємо.
  const barCls = pct >= 70 ? 'bg-emerald-400' : pct >= 40 ? 'bg-blue-400' : 'bg-amber-400';
  // Динаміка клієнтів vs минулий тиждень (більше купило = зростання).
  const d = typeof c.prevBought === 'number' ? c.bought - c.prevBought : null;
  return (
    <span className="inline-flex flex-col gap-1 rounded-md bg-[#f5f7fb] border border-[#e8ecf5] px-2 py-1 min-w-[96px]">
      <span className="flex items-center justify-between gap-2">
        <span>{c.label}</span>
        <span className="tabular-nums font-semibold text-foreground/80 inline-flex items-center gap-1">
          {hasPlan ? <>{c.bought}/{c.planned} <span className="text-emet-blue">({pct}%)</span></> : c.bought}
          {d !== null && d !== 0 && (
            <span className={d > 0 ? 'text-emerald-600' : 'text-rose-500'} title={`минулого тижня: ${c.prevBought} кл`}>{d > 0 ? `▲+${d}` : `▼${d}`}</span>
          )}
        </span>
      </span>
      {hasPlan && (
        <span className="h-1 rounded-full bg-[#e2e7ef] overflow-hidden">
          <span className={`block h-full rounded-full ${barCls}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </span>
      )}
    </span>
  );
}

function TopPromos({ promos }: { promos: PromoOut[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? promos : promos.slice(0, 2);
  const rest = promos.length - 2;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Flame className="h-3 w-3 text-amber-500 shrink-0" />
      <span className="shrink-0">Топ акції:</span>
      {shown.map(p => (
        <span key={p.name} title={p.name} className="inline-flex items-center h-5 gap-1 rounded bg-amber-50 border border-amber-200/60 px-1.5">
          <span className="truncate max-w-[150px]">{p.name}</span>
          <span className="tabular-nums font-semibold text-foreground/80">{p.clients}кл</span>
          <span className="amount tabular-nums">${p.sum >= 1000 ? `${Math.round(p.sum / 1000)}k` : p.sum}</span>
          <span className="tabular-nums font-bold text-emet-blue">{p.pct}%</span>
        </span>
      ))}
      {!open && rest > 0 && (
        <button type="button" onClick={() => setOpen(true)} className="h-5 px-1.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-600 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emet-blue/40 transition-colors">+{rest} ще</button>
      )}
      {open && promos.length > 2 && (
        <button type="button" onClick={() => setOpen(false)} className="h-5 px-1.5 rounded text-[10px] font-semibold text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emet-blue/40 transition-colors">згорнути</button>
      )}
    </div>
  );
}

// ── Зона 3: РАБОЧА (3 карточки — Причина / Дія / Пропозиція) ──────────────────
function BrandCardWorkzone({ b, notes, prevNotes, reasonDraft }: {
  b: BrandRow; notes: WeeklyNotesApi; prevNotes: WeeklyNotesApi; reasonDraft: string;
}) {
  const lastReason = prevNotes.get('reason', b.code)?.text.trim() || '';
  const lastAction = prevNotes.get('action', b.code)?.text.trim() || '';
  const lastProposal = prevNotes.get('proposal', b.code)?.text.trim() || '';
  const thisReason = notes.get('reason', b.code)?.text ?? '';
  const thisAction = notes.get('action', b.code)?.text ?? '';
  const proposal = notes.get('proposal', b.code)?.text ?? '';

  return (
    <div className="border-t border-slate-200 bg-slate-50/50 px-4 py-2.5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 items-stretch">
        <WorkzoneCard
          title="Причина" accent="neutral"
          icon={<MessageCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
          thisWeek={thisReason.trim()} lastWeek={lastReason}
          emptyText="причину за цей тиждень не внесено"
          footer={<BrandNote full segmentName={b.name} label="Причина" addMode={!thisReason.trim()} value={thisReason} onSave={(t) => notes.save('reason', b.code, t)} draft={reasonDraft} hint="категорія → N із M → факт → висновок (числа з борду, висновок словами)." placeholder="Напр.: Активні 8 запл., купили 2 (25%) — просів темп, 4 з 12 не відвантажили…" />}
        />
        <WorkzoneCard
          title="Дія" accent="blue"
          icon={<Target className="h-3.5 w-3.5 text-emet-blue shrink-0" />}
          thisWeek={thisAction.trim()} lastWeek={lastAction}
          emptyText="дію на цей тиждень не внесено"
          footer={
            <div className="flex items-center justify-between gap-1.5 w-full flex-wrap">
              {lastAction ? <PromiseToggle code={b.code} notes={notes} /> : <span className="text-[10px] text-muted-foreground/40">минулого тижня дії не було</span>}
              <BrandNote segmentName={b.name} label="Дія" addMode={!thisAction.trim()} value={thisAction} onSave={(t) => notes.save('action', b.code, t)} placeholder="Дія на тиждень: кого відвідати, що дотиснути, дедлайн…" />
            </div>
          }
        />
        <WorkzoneCard
          title="Пропозиція" accent="neutral"
          icon={<Lightbulb className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
          thisWeek={proposal.trim()} lastWeek={lastProposal}
          emptyText="пропозицію регіону по бренду не внесено"
          footer={<BrandNote full segmentName={b.name} label="Пропозиція" addMode={!proposal.trim()} value={proposal} onSave={(t) => notes.save('proposal', b.code, t)} placeholder="Пропозиція регіону по цьому бренду…" />}
        />
      </div>
    </div>
  );
}

/**
 * Одна карточка робочої зони (Причина / Дія / Пропозиція): header зі статусом,
 * акцентний блок «Цей тиждень» (quote-box, line-clamp-3), згорнутий «Минулий
 * тиждень», footer з кнопками (прижатий донизу). Логіку збереження несуть props.
 */
function WorkzoneCard({ title, icon, accent, thisWeek, lastWeek, emptyText, footer }: {
  title: string; icon: React.ReactNode; accent: 'neutral' | 'blue';
  thisWeek: string; lastWeek: string; emptyText: string; footer: React.ReactNode;
}) {
  const [showLast, setShowLast] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const filled = !!thisWeek.trim();
  // Порожня картка — приглушена (dashed, блідий фон, сірий текст). При заповненні
  // повертається до звичайного вигляду (білий/blue-accent).
  const cardCls = !filled
    ? 'bg-slate-50/30 border-dashed border-slate-300 text-slate-400'
    : accent === 'blue' ? 'bg-blue-50/50 border-blue-200/70' : 'bg-white border-slate-200';
  const quoteCls = accent === 'blue' ? 'border-emet-blue/50 bg-emet-blue/[0.04]' : 'border-slate-300 bg-slate-50';

  return (
    <div className={`flex flex-col rounded-xl border ${cardCls} p-2.5`}>
      {/* Header */}
      <div className="flex items-center gap-1.5">
        {icon}
        <span className={`font-bold uppercase tracking-wider text-[10px] ${filled ? 'text-slate-600' : 'text-slate-400'}`}>{title}</span>
        <span className={`ml-auto inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${filled ? 'bg-emerald-500/12 text-emerald-700 border-emerald-300/40' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
          {filled ? <><Check className="h-2.5 w-2.5" /> Заповнено</> : 'Порожньо'}
        </span>
      </div>

      {/* Цей тиждень — акцентний quote-box */}
      <div className="mt-1.5">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-1">Цей тиждень</div>
        <div className={`border-l-2 rounded-r-md px-2 py-1.5 ${quoteCls}`}>
          {filled ? (
            <p className={`text-[12px] leading-snug text-slate-800 whitespace-pre-wrap ${expanded ? '' : 'line-clamp-3'}`}>{thisWeek}</p>
          ) : (
            <p className="text-[11px] italic text-muted-foreground/50">{emptyText}</p>
          )}
          {filled && thisWeek.length > 110 && (
            <button type="button" onClick={() => setExpanded(e => !e)} className="mt-1 text-[10px] font-semibold text-emet-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emet-blue/40 rounded">
              {expanded ? 'згорнути' : 'розгорнути'}
            </button>
          )}
        </div>
      </div>

      {/* Минулий тиждень — згорнутий */}
      <div className="mt-1.5">
        {lastWeek ? (
          <>
            <button type="button" onClick={() => setShowLast(s => !s)} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emet-blue/40 rounded">
              Минулий тиждень <ChevronDown className={`h-3 w-3 transition-transform ${showLast ? 'rotate-180' : ''}`} />
            </button>
            {showLast && <p className="mt-0.5 text-[10.5px] leading-snug text-slate-500 whitespace-pre-wrap">«{lastWeek}»</p>}
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground/40">минулого тижня не вказано</span>
        )}
      </div>

      {/* Footer — прижатий донизу */}
      <div className="mt-auto pt-2 flex items-center gap-1.5 flex-wrap">
        {footer}
      </div>
    </div>
  );
}

/**
 * Відмітка виконання минулотижневої «Дії»: сегмент-контрол [Так|Ні] + причина.
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

  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <span className="inline-flex rounded-lg border border-[#e2e7ef] overflow-hidden bg-white">
        <button
          type="button" onClick={() => setStatus(true)} disabled={busy}
          className={`h-7 px-2.5 text-[10.5px] font-bold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emet-blue/40 ${done === true ? 'bg-emerald-500/15 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}
        >Так</button>
        <button
          type="button" onClick={() => setStatus(false)} disabled={busy}
          className={`h-7 px-2.5 text-[10.5px] font-bold border-l border-[#e2e7ef] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emet-blue/40 ${done === false ? 'bg-rose-500/12 text-rose-700' : 'text-slate-500 hover:bg-slate-50'}`}
        >Ні</button>
      </span>
      {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      {done === false && (
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          onBlur={() => notes.save('promise_check', code, reason.trim(), false)}
          maxLength={500}
          placeholder="причина невиконання…"
          className="h-7 w-[150px] rounded-lg border border-[rgba(6,42,61,0.15)] bg-white px-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-emet-blue/30"
        />
      )}
    </span>
  );
}

/**
 * «Причина» / «Дія» / «Пропозиція» по бренду — кнопка «Редагувати/Додати» →
 * діалог. Значення з weekly_report_notes, збереження append-only через `onSave`.
 */
function BrandNote({ segmentName, label, placeholder, hint, draft, value, onSave, addMode, full }: {
  segmentName: string; label: string; placeholder: string; hint?: string; draft?: string;
  value: string; onSave: (text: string) => Promise<boolean>; addMode?: boolean; full?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const filled = !!value.trim();
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
        className={`inline-flex items-center justify-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-semibold border bg-white border-[#e2e7ef] text-slate-600 hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emet-blue/40 transition-colors ${full ? 'w-full' : 'min-w-[112px]'}`}
      >
        {addMode && !filled
          ? <><Plus className="h-3.5 w-3.5 shrink-0" /> Додати</>
          : <><PenLine className="h-3.5 w-3.5 shrink-0" /> Редагувати</>}
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
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {busy ? 'Зберігаю…' : 'Зберегти'}
            </button>
            <button onClick={() => { if (!busy) setOpen(false); }} className="h-10 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-foreground">Скасувати</button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
