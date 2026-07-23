'use client';

/**
 * Зведений звіт РОП (Лист 4) — presentational. Дані з useRopReport. Стилі — у
 * мові системи (MetricCard hero, glass-card секції, статус-тинти, mono-числа).
 */
import { useState, useEffect, useRef } from 'react';
import { useSWRConfig } from 'swr';
import { useRouter } from 'next/navigation';
import { Loader2, Check, ChevronDown, X, Plus, Pencil, Trash2, Minus, Inbox, ShieldCheck, type LucideIcon } from 'lucide-react';
import { MetricCard } from '@/components/dashboard/metric-card';
import { SectionHeader } from '@/components/ui/section-header';
import { PerfBadge } from '@/components/ui/perf-badge';
import type { RopReport, RopRegionRow, MarketSignal } from '@/lib/use-rop-report';
import type { StatusTone } from '@/lib/status-badge';

const toneText: Record<StatusTone, string> = { ok: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-rose-600' };
const toneIcon: Record<StatusTone, string> = { ok: 'text-emerald-500', warn: 'text-amber-500', bad: 'text-rose-500' };
const toneAmbient: Record<StatusTone, 'good' | 'warn' | 'bad'> = { ok: 'good', warn: 'warn', bad: 'bad' };
// bg-версія toneText — для міні-бару виконання (колірна індикація за міткою).
const toneBar: Record<StatusTone, string> = { ok: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-rose-500' };
// % — з однією десятою (як `formatPct`/паспорт регіону), без округлення до цілого.
const pct = (n: number) => `${n.toFixed(1)}%`;

/**
 * Єдиний порожній стан для всіх секцій (4.1–4.5): приглушена lucide-іконка +
 * приглушений текст, по центру. Щоб «нема даних» читалось однаково скрізь.
 */
function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center">
      <Icon className="h-7 w-7 text-slate-300" strokeWidth={1.75} />
      <p className="text-[12px] text-muted-foreground">{text}</p>
    </div>
  );
}

/** Українське склонение «менеджер». */
function mgrWord(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'менеджер';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'менеджери';
  return 'менеджерів';
}

// Єдина grid-сітка для шапки колонок і рядків 4.1 (вирівнювання по вертикалі).
// Колонка чипів = minmax(0,1fr) — контент не виштовхує колонку за межі (чипи
// переносяться всередині своєї колонки, не налізають на «Обіцянку»).
const COLS = 'grid grid-cols-[190px_60px_120px_minmax(0,1fr)_200px_24px] items-center gap-3';

export function RopReportView({ data }: { data: RopReport }) {
  return (
    <div className="space-y-4">
      <Hero data={data} />
      <Summary data={data} />
      <RedZones data={data} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <Promises data={data} />
        <Planning data={data} />
      </div>
      <MarketSignals data={data} />
    </div>
  );
}

// ── Hero (MetricCard) ────────────────────────────────────────────────────────
function Hero({ data }: { data: RopReport }) {
  const h = data.hero;
  const compTone: StatusTone = h.companyForecastPct >= 100 ? 'ok' : h.companyForecastPct >= 80 ? 'warn' : 'bad';
  const overdueNames = h.overdueRegions.map(r => r.region).join(', ');
  // Кожна hero-картка тоноване за ВЛАСНИМ станом (не 4 різні кольори):
  //  · «Виконання» — нейтрально-теплий accent (первинна метрика, не «тривога»).
  //  · «План/Обіцянки» — good коли все ок, warn коли є проблема (м'який тон).
  const hasOverdue = h.overdueRegions.length > 0;
  const promisesUndone = h.promisesTotal - h.promisesDone;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <MetricCard iconColor={toneIcon[compTone]} valueSize="lg" ambient={compTone === 'ok' ? 'accent' : compTone === 'warn' ? 'warn' : 'bad'}
        label="Виконання представництв"
        value={<span className={toneText[compTone]}>{pct(h.companyPct)}</span>}
        caption={<span className="text-muted-foreground">норма — <b className="tabular-nums text-foreground/70">{pct(h.norm)}</b> · темп <b className="tabular-nums text-foreground/70">{pct(h.companyForecastPct)}</b></span>} />

      <div className="glass-card p-4 sm:p-5 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emet-blue text-emet-blue shadow-[0_0_6px_currentColor]" />
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Регіони за міткою</p>
        </div>
        <div className="flex items-center flex-1 divide-x divide-slate-200/60">
          {(['ok', 'warn', 'bad'] as StatusTone[]).map(t => (
            <div key={t} className="flex-1 text-center px-1">
              <span className={`block text-[24px] font-extrabold tabular-nums leading-none mb-1 ${toneText[t]}`}>{h.regionsByTone[t]}</span>
              <span className="text-[10px] font-bold text-muted-foreground">{t === 'ok' ? 'в плані' : t === 'warn' ? 'ризик' : 'відстав.'}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground/70 leading-snug">
          Мітка за темпом прогнозу: <b className="text-emerald-600">≥100%</b> в плані · <b className="text-amber-600">80–99%</b> ризик · <b className="text-rose-600">&lt;80%</b> відставання
        </p>
      </div>

      <MetricCard iconColor={hasOverdue ? 'text-amber-500' : 'text-emet-blue'} valueSize="lg"
        ambient={hasOverdue ? 'warn' : undefined}
        label="План узгоджено в термін"
        value={<span className={hasOverdue ? 'text-amber-600' : 'text-slate-700'}>{h.planAgreedInTime}<span className="text-[18px] text-slate-400">/{h.planTotal}</span></span>}
        caption={hasOverdue
          ? <span className="text-muted-foreground">{h.overdueRegions.length} прострочив: <b className="text-foreground/70">{overdueNames}</b></span>
          : <span className="text-muted-foreground">усі регіони в термін</span>} />

      <MetricCard iconColor={promisesUndone > 0 ? 'text-amber-500' : 'text-emet-blue'} valueSize="lg"
        ambient={promisesUndone > 0 ? 'warn' : undefined}
        label="Обіцянки минулого звіту"
        value={<span className={promisesUndone > 0 ? 'text-amber-600' : 'text-slate-700'}>{h.promisesDone}<span className="text-[18px] text-slate-400">/{h.promisesTotal}</span></span>}
        caption={<span className="text-muted-foreground">виконано · {promisesUndone} не виконано (з причинами)</span>} />
    </div>
  );
}

// ── 4.1 акордеон ─────────────────────────────────────────────────────────────
function SubmissionDot({ r }: { r: RopRegionRow }) {
  const map = {
    submitted: ['bg-emerald-500', 'Звіт подано'],
    partial: ['bg-amber-500', 'Заповнюється (не фіналізовано)'],
    empty: ['bg-slate-300', 'Звіт не подано'],
  } as const;
  const [cls, tip] = map[r.submission];
  return <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} title={tip} />;
}

function PromiseCell({ p }: { p: RopRegionRow['promise'] }) {
  if (p.status === 'yes') return (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold text-slate-500">
      <Check className="h-3 w-3 shrink-0 text-slate-400" />виконано
    </span>
  );
  if (p.status === 'none') return (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold text-muted-foreground/50">
      <Minus className="h-3 w-3 shrink-0" />нема
    </span>
  );
  // Лише лічильник невиконаних (без тексту причини — він у 4.3). Деталі — у тултипі.
  return (
    <span className="inline-flex items-center gap-1 h-6 text-[11px] font-semibold text-rose-700" title={p.notDone.map(n => `${n.brand}: ${n.reason ?? ''}`).join(' · ')}>
      <X className="h-3 w-3 shrink-0 text-rose-500" />не викон. {p.notDone.length}
    </span>
  );
}

// Міні-картка бренду у панелі: причина + дія. Повний текст, clamp лише через CSS.
// «розгорнути» знімає clamp — текст на всю ширину картки (картка НЕ розтягується
// на 2 колонки, лишається у своїй клітинці; напів-порожні картки — норм).
function BrandDetailCard({ b, worst }: { b: { name: string; pct: number; forecastPct: number; reason?: string | null; action?: string | null }; worst: boolean }) {
  const [open, setOpen] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const reasonRef = useRef<HTMLParagraphElement>(null);
  const actionRef = useRef<HTMLParagraphElement>(null);
  // Кнопку показуємо ЛИШЕ коли текст реально обрізається (не за к-стю символів):
  // вимірюємо у згорнутому стані scrollHeight > clientHeight. Інакше кнопка нічого
  // не робить (текст влазить у 2 рядки після прибирання переносів).
  useEffect(() => {
    if (open) return; // міряємо лише у clamped-стані
    const overflows = (el: HTMLParagraphElement | null) => !!el && el.scrollHeight - el.clientHeight > 1;
    setCanExpand(overflows(reasonRef.current) || overflows(actionRef.current));
  }, [open, b.reason, b.action]);
  const clamp = open ? '' : 'line-clamp-2';
  // Розгорнути лише знімає clamp — картка лишається у своїй клітинці (без col-span,
  // щоб сітка не перебудовувалась і сусідні картки не «стрибали»).
  return (
    <div className={`rounded-xl border bg-white p-3 ${worst ? 'border-rose-200' : 'border-slate-200'}`}>
      <div className="font-bold text-[13px] mb-2">{b.name}<span className="font-mono text-slate-400 font-semibold"> · {pct(b.pct)}</span></div>
      <div className="mb-2">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-bold mb-0.5">Причина</div>
        {b.reason?.trim()
          ? <p ref={reasonRef} className={`text-[12px] text-muted-foreground leading-snug ${clamp}`}>{b.reason}</p>
          : <p className="text-[12px] italic text-muted-foreground/50">причину не внесено</p>}
      </div>
      <div>
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-bold mb-0.5">Дія</div>
        {b.action?.trim()
          ? <p ref={actionRef} className={`text-[12px] text-muted-foreground leading-snug ${clamp}`}>{b.action}</p>
          : <p className="text-[12px] italic text-muted-foreground/50">дію не внесено</p>}
      </div>
      {(canExpand || open) && <button type="button" onClick={() => setOpen(o => !o)} className="mt-1.5 text-[10.5px] font-semibold text-emet-blue hover:underline">{open ? 'згорнути' : 'розгорнути'}</button>}
    </div>
  );
}

function RegionRow({ r, open, onToggle }: { r: RopRegionRow; open: boolean; onToggle: () => void }) {
  const router = useRouter();
  const muted = r.submission === 'empty';
  const panelBrands = r.reds.length > 0 ? r.reds : (r.worst ? [r.worst] : []);
  const openRegion = (e: React.MouseEvent) => { e.stopPropagation(); router.push(`/weekly-report?region=${r.code}`); };
  return (
    <div className={`bg-white rounded-xl border border-slate-200/60 shadow-[0_4px_14px_rgba(6,42,61,0.04)] hover:shadow-[0_8px_30px_rgba(6,42,61,0.06)] hover:border-slate-300 transition-all overflow-hidden ${muted ? 'opacity-55' : ''}`}>
      <div onClick={onToggle} className={`${COLS} w-full px-5 py-4 min-h-[100px] cursor-pointer`}>
        <div className="min-w-0">
          {/* Клік по назві → повний звіт цього регіону (не розгортання) */}
          <button type="button" onClick={openRegion} className="block max-w-full text-left font-bold text-[13px] truncate hover:text-emet-blue hover:underline" title="Відкрити звіт регіону">{r.name}</button>
          <div className="text-[10px] text-slate-400 flex items-center gap-1"><SubmissionDot r={r} />{r.managerCount} {mgrWord(r.managerCount)}</div>
        </div>
        <div>
          {/* % — нейтральне число; колірна індикація — у міні-барі за міткою */}
          <div className="text-right font-mono font-extrabold text-[16px] text-slate-800">{pct(r.pct)}</div>
          {/* Міні-бар виконання — ширина = % (cap 100), колір за міткою */}
          <div className="mt-1 h-1 rounded-full bg-[#e2e7ef] overflow-hidden">
            <div className={`h-full rounded-full ${toneBar[r.badge.tone]}`} style={{ width: `${Math.min(100, Math.max(0, r.pct))}%` }} />
          </div>
        </div>
        <div><PerfBadge forecastPct={r.forecastPct} /></div>
        <div className="flex flex-wrap content-center items-center gap-x-1.5 gap-y-1.5 min-w-0 max-h-[46px] overflow-hidden">
          {r.reds.length === 0
            ? <span className="text-[10.5px] font-bold rounded px-2 py-0.5 border bg-[#f5f7fb] text-slate-400 border-[#e8ecf5]">— чисто</span>
            : r.reds.map((b, i) => (
                // Усі чипи; перенос на 2-й ряд у межах колонки (без «+N»). Нейтральні,
                // єдине червоне — % найгіршого (reds[0]). 3-й ряд кліпається
                // (max-h) — приховані бренди видно у розкритій панелі.
                <span key={b.code} className="text-[10.5px] font-bold rounded px-1.5 py-0.5 border border-slate-200 bg-white text-slate-700 whitespace-nowrap shrink-0">
                  {b.name} <span className={`font-mono font-semibold ${i === 0 ? 'text-rose-600' : 'text-slate-500'}`}>· {pct(b.pct)}</span>
                </span>
              ))}
        </div>
        <div className="min-w-0"><PromiseCell p={r.promise} /></div>
        <ChevronDown className={`h-4 w-4 text-slate-400 justify-self-end transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <div className="px-4 pt-1 pb-4 bg-slate-50 border-t border-slate-100">
          {panelBrands.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-3 items-start">
              {panelBrands.map((b, i) => <BrandDetailCard key={b.code ?? String(i)} b={b} worst={i === 0} />)}
            </div>
          )}
          <button type="button" onClick={() => router.push(`/weekly-report?region=${r.code}`)} className="mt-3 text-[12px] font-semibold text-emet-blue hover:underline inline-flex items-center gap-1">
            Відкрити повний звіт регіону →
          </button>
        </div>
      )}
    </div>
  );
}

const TONE_FILTER: Array<{ key: 'all' | StatusTone; label: string }> = [
  { key: 'all', label: 'Всі' },
  { key: 'bad', label: 'Відставання' },
  { key: 'warn', label: 'Ризик' },
  { key: 'ok', label: 'В плані' },
];
const filterActiveCls: Record<'all' | StatusTone, string> = {
  all: 'bg-emet-blue text-white border-emet-blue',
  ok: 'bg-emerald-500 text-white border-emerald-500',
  warn: 'bg-amber-500 text-white border-amber-500',
  bad: 'bg-rose-500 text-white border-rose-500',
};

function Summary({ data }: { data: RopReport }) {
  const [filter, setFilter] = useState<'all' | StatusTone>('all');
  const [openCode, setOpenCode] = useState<string | null>(null);
  const rows = [...data.regions].sort((a, b) => a.forecastPct - b.forecastPct);
  const counts: Record<'all' | StatusTone, number> = {
    all: rows.length,
    ok: rows.filter(r => r.badge.tone === 'ok').length,
    warn: rows.filter(r => r.badge.tone === 'warn').length,
    bad: rows.filter(r => r.badge.tone === 'bad').length,
  };
  const filtered = filter === 'all' ? rows : rows.filter(r => r.badge.tone === filter);
  return (
    <div className="glass-card overflow-hidden">
      <SectionHeader no="4.1" title="Зведена таблиця по регіонах" hint={
        <span className="flex items-center gap-1 flex-wrap">
          {TONE_FILTER.map(f => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)}
              className={`text-[11px] font-bold rounded-lg px-2.5 py-1 border transition-colors ${filter === f.key ? filterActiveCls[f.key] : 'bg-white text-muted-foreground border-slate-200 hover:bg-slate-50'}`}>
              {f.label} {counts[f.key]}
            </button>
          ))}
        </span>
      } />
      <div className="bg-slate-50/60 overflow-x-auto">
        <div className="min-w-[800px] p-3">
          {/* шапка колонок — px-5 збігається з внутрішнім px-5 карток (1px бордер — допустимий зсув) */}
          <div className={`${COLS} px-5 py-2 text-[10px] uppercase tracking-wider text-slate-400 font-bold`}>
            <span>Регіон</span>
            <span className="text-right">% на дату</span>
            <span>Мітка</span>
            <span>Червоні бренди</span>
            <span>Обіцянка→факт</span>
            <span />
          </div>
          <div className="space-y-3">
            {filtered.map(r => (
              <RegionRow key={r.code} r={r} open={openCode === r.code} onToggle={() => setOpenCode(o => (o === r.code ? null : r.code))} />
            ))}
            {filtered.length === 0 && <EmptyState icon={Inbox} text="немає регіонів з цією міткою" />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 4.2 Червоні зони (з % по регіонах) ───────────────────────────────────────
function RedZones({ data }: { data: RopReport }) {
  if (data.redZones.length === 0) {
    return <div className="glass-card overflow-hidden"><SectionHeader no="4.2" title="Червоні зони по брендах" /><EmptyState icon={ShieldCheck} text="немає червоних брендів за період" /></div>;
  }
  return (
    <div className="glass-card overflow-hidden">
      <SectionHeader no="4.2" title="Червоні зони по брендах" hint={`Бренд у «відставанні» в 4+ регіонах → окремим пунктом на ${data.recipients.escalation}`} />
      <div className="p-2">
        {data.redZones.map(z => (
          <RedZoneRow key={z.brand} z={z} escalation={data.recipients.escalation} />
        ))}
      </div>
    </div>
  );
}

/**
 * Один рядок червоної зони: бренд · тонкий бар (ЄДИНИЙ носій кольору рядка:
 * rose при ескалації 4+, amber при 1–3) · перелік регіонів (нейтральний, 5 + «+N»)
 * · лічильник N/8 (нейтральний) + бейдж ескалації лише при 4+.
 */
function RedZoneRow({ z, escalation }: { z: RopReport['redZones'][number]; escalation: string }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-[#f5f7fb]">
      <div className="w-[110px] font-bold text-[13.5px] shrink-0 pt-0.5">{z.brand}</div>
      <div className="w-[120px] h-2.5 mt-1.5 bg-[#eef1f6] rounded-full overflow-hidden shrink-0 hidden sm:block">
        <div className={`h-full rounded-full ${z.escalate ? 'bg-rose-500' : 'bg-amber-400'}`} style={{ width: `${(z.count / 8) * 100}%` }} />
      </div>
      {/* Усі регіони видно (перенос на новий рядок), без «+N» */}
      <div className="flex-1 text-[11px] min-w-[160px] leading-relaxed pt-0.5">
        {z.regions.map((x, i) => (
          <span key={i}>{i > 0 && <span className="text-slate-300"> · </span>}<span className="text-slate-400">{x.region}</span> <span className="font-mono font-semibold text-slate-500">{pct(x.pct)}</span></span>
        ))}
      </div>
      {/* Лічильник N/8 — червоний при ескалації (4+), інакше нейтральний */}
      <div className={`w-[100px] text-right font-mono font-extrabold text-[15px] shrink-0 pt-0.5 ${z.escalate ? 'text-rose-600' : 'text-slate-700'}`}>
        {z.count}/8{z.escalate && <span className="ml-1.5 text-[10px] font-bold uppercase rounded px-1.5 py-0.5 bg-white border border-rose-200 text-rose-700 whitespace-nowrap">→ {escalation}</span>}
      </div>
    </div>
  );
}

// ── 4.3 Реєстр обіцянок (по кліку — усі, вкл. виконані) ───────────────────────
function PromiseItem({ p }: { p: RopReport['promiseRegister'][number]['promises'][number] }) {
  const [open, setOpen] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  // Кнопку показуємо ЛИШЕ коли текст реально обрізаний (вимір overflow у clamped-
  // стані), а не за к-стю символів — інакше «розгорнути» нічого не робить.
  useEffect(() => {
    if (open) return;
    const el = textRef.current;
    setCanExpand(!!el && el.scrollHeight - el.clientHeight > 1);
  }, [open, p.promiseText]);
  const icon = p.done === true
    ? <Check className="h-3.5 w-3.5 text-emerald-600" />
    : p.done === false ? <X className="h-3.5 w-3.5 text-rose-500" /> : <span className="block w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 ml-1" />;
  return (
    <div className="flex gap-2">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-bold text-foreground/80 mb-0.5">{p.brand}</div>
        {/* Обіцянка як цитата з лівим бордером (як quote-box у паспорті регіону) */}
        <div className="border-l-2 border-slate-200 bg-slate-50 rounded-r-md px-2 py-1">
          <p ref={textRef} className={`text-[11.5px] text-slate-600 leading-snug ${open ? '' : 'line-clamp-2'}`}>{p.promiseText || '—'}</p>
          {(canExpand || open) && <button type="button" onClick={() => setOpen(o => !o)} className="mt-0.5 text-[10px] font-semibold text-emet-blue hover:underline">{open ? 'згорнути' : 'розгорнути'}</button>}
        </div>
        {p.done === false && <div className="text-[11px] text-rose-700 mt-0.5">{p.reason || 'причину не вказано'}</div>}
      </div>
    </div>
  );
}

const promiseChip = 'inline-flex items-center gap-1 text-[10.5px] font-bold rounded-full px-2 py-0.5 border whitespace-nowrap';

function PromiseRegionCard({ r }: { r: RopReport['promiseRegister'][number] }) {
  // Регіони з невиконаними обіцянками (status 'no') розгорнуті одразу — це фокус наради.
  const [open, setOpen] = useState(r.status === 'no');
  const notDone = r.promises.filter(p => p.done === false).length;
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full grid grid-cols-[140px_1fr_28px] items-center gap-3 px-3 py-3.5 text-left hover:bg-[#f5f7fb]">
        <span className="font-bold text-[13px] truncate">{r.region}</span>
        <span className="justify-self-start">
          {r.status === 'yes' && <span className={`${promiseChip} bg-emerald-500/12 text-emerald-700 border-emerald-300/40`}><Check className="h-3 w-3 shrink-0" />усі виконані ({r.doneCount})</span>}
          {r.status === 'no' && <span className={`${promiseChip} bg-rose-500/12 text-rose-700 border-rose-300/40`}><X className="h-3 w-3 shrink-0" />не виконано {notDone} з {r.total}</span>}
          {r.status === 'none' && <span className={`${promiseChip} bg-slate-100 text-slate-500 border-slate-200`}><Minus className="h-3 w-3 shrink-0" />не відмічено</span>}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 justify-self-end shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-2 space-y-2 border-t border-slate-100 bg-slate-50/60">
          {r.promises.map((p, i) => <PromiseItem key={i} p={p} />)}
        </div>
      )}
    </div>
  );
}

function Promises({ data }: { data: RopReport }) {
  const reg = data.promiseRegister;
  const done = reg.reduce((a, r) => a + r.doneCount, 0);
  const total = reg.reduce((a, r) => a + r.total, 0);
  return (
    <div className="glass-card overflow-hidden h-full">
      <SectionHeader no="4.3" title="Реєстр обіцянок" hint={total > 0 ? `${total} обіцянок · ${done} виконано` : undefined} />
      {reg.length === 0
        ? <EmptyState icon={Inbox} text="за період обіцянок не було" />
        : <div className="p-3 space-y-2">{reg.map(r => <PromiseRegionCard key={r.region} r={r} />)}</div>}
    </div>
  );
}

// ── 4.4 Підсумки планування (одна строка/регіон) ─────────────────────────────
const planChip: Record<string, { cls: string; label: string }> = {
  in_time: { cls: 'bg-slate-100 text-slate-500 border-slate-200', label: 'в термін' },
  late: { cls: 'bg-rose-500/12 text-rose-700 border-rose-300/40', label: '' },
  draft: { cls: 'bg-amber-500/12 text-amber-700 border-amber-300/40', label: 'чернетка' },
  not_started: { cls: 'bg-slate-100 text-slate-500 border-slate-200', label: 'не розпочато' },
};

function Planning({ data }: { data: RopReport }) {
  const inTime = data.regions.filter(r => r.plan.inTime).length;
  return (
    <div className="glass-card overflow-hidden h-full">
      <SectionHeader no="4.4" title="Підсумки планування" hint="до 16:00 4-го роб. дня" />
      {data.regions.length === 0
        ? <EmptyState icon={Inbox} text="немає регіонів для планування за період" />
        : <>
            <div className="px-4 pt-3 pb-2 text-[11.5px] text-muted-foreground">{inTime} із {data.regions.length} регіонів узгодили план у термін.</div>
            <div className="bg-slate-50/60 p-3 space-y-2.5">{data.regions.map(r => <PlanRow key={r.code} period={data.period} r={r} />)}</div>
          </>}
    </div>
  );
}

function PlanRow({ period, r }: { period: string; r: RopRegionRow }) {
  const c = planChip[r.plan.state];
  const [val, setVal] = useState(r.plan.lateReason ?? '');
  const [busy, setBusy] = useState(false);
  const [savedVal, setSavedVal] = useState(r.plan.lateReason ?? '');
  const dirty = val.trim() !== savedVal.trim();
  // Поле «причина затримки» — лише для проблемних рядків (late/draft), не для
  // «в термін» і не для «не розпочато» (там причини затримки ще нема).
  const canEdit = r.plan.state !== 'in_time' && r.plan.state !== 'not_started';
  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/rop-report/late-reason', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ period, regionCode: r.code, reason: val.trim() }),
      });
      if (res.ok) setSavedVal(val.trim());
    } finally { setBusy(false); }
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-[0_4px_14px_rgba(6,42,61,0.04)] hover:shadow-[0_8px_30px_rgba(6,42,61,0.06)] hover:border-slate-300 transition-all px-4 py-3 grid grid-cols-[110px_120px_1fr] items-center gap-3">
      <span className="font-bold text-[12px] truncate">{r.name}</span>
      <span className={`justify-self-start inline-flex items-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1 border ${c.cls}`}>
        {r.plan.state === 'in_time' && <Check className="h-3 w-3 shrink-0 text-slate-400" />}
        {r.plan.state === 'late' ? `+${r.plan.overdueWorkingDays} дні` : c.label}
      </span>
      <div className="min-w-0">
        {canEdit && (
          <div className="flex items-center gap-2">
            <input value={val} onChange={e => setVal(e.target.value)} disabled={busy} maxLength={300}
              placeholder="причина затримки…"
              className="flex-1 min-w-0 h-8 rounded-lg border border-[rgba(6,42,61,0.15)] bg-white px-2.5 text-[11.5px] focus:outline-none focus:ring-2 focus:ring-emet-blue/30 disabled:opacity-50" />
            {dirty && (
              <button type="button" onClick={save} disabled={busy}
                className="h-8 px-3 rounded-lg text-[11px] font-bold text-white bg-emet-blue disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Зберегти
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 4.5 Ринкові сигнали (РОП вводить вручну) ─────────────────────────────────
// Регламент (макет rop-report.html): текст сигналу · джерело · кому (→ CPO/CMO) ·
// дедлайн. Без пріоритету/статусу (migration 064).
function MarketSignals({ data }: { data: RopReport }) {
  const { mutate } = useSWRConfig();
  const refresh = () => mutate((k: unknown) => typeof k === 'string' && k.startsWith('rop-report|'));
  // null = форма закрита; {} = нова; {..signal} = редагування наявної.
  const [form, setForm] = useState<Partial<MarketSignal> | null>(null);
  const signals = data.marketSignals;
  return (
    <div className="glass-card overflow-hidden">
      <SectionHeader no="4.5" title="Ринкові сигнали"
        hint={
          <span className="flex items-center gap-2">
            {signals.length > 0 && <span className="text-[11px] text-muted-foreground">{signals.length}</span>}
            <button type="button" onClick={() => setForm({})}
              className="inline-flex items-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1 border border-emet-blue/25 text-emet-blue bg-emet-blue/10 hover:bg-emet-blue/15 transition-colors">
              <Plus className="h-3.5 w-3.5" /> Додати
            </button>
          </span>
        } />
      {form && <SignalForm period={data.period} initial={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
      {signals.length === 0 && !form
        ? <EmptyState icon={Inbox} text="ринкових сигналів за період немає" />
        : <div className="divide-y divide-[#f0f2f8]">{signals.map(s => <SignalRow key={s.id} s={s} onEdit={() => setForm(s)} onChanged={refresh} />)}</div>}
    </div>
  );
}

/** Дедлайн прострочено (< сьогодні) → підсвічуємо. */
function isOverdue(deadline: string | null): boolean {
  if (!deadline) return false;
  return deadline < new Date().toISOString().slice(0, 10);
}

function SignalRow({ s, onEdit, onChanged }: { s: MarketSignal; onEdit: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const overdue = isOverdue(s.deadline);
  const del = async () => {
    if (!confirm('Видалити сигнал?')) return;
    setBusy(true);
    try {
      await fetch(`/api/rop-report/signals?id=${encodeURIComponent(s.id)}`, { method: 'DELETE', credentials: 'same-origin' });
      onChanged();
    } finally { setBusy(false); }
  };
  return (
    <div className="px-4 py-3 flex items-start gap-3 hover:bg-[#f5f7fb]">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-foreground/90 leading-snug">{s.signal}</p>
        <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {s.source && <span>Джерело: <b className="text-foreground/70">{s.source}</b></span>}
          {s.deadline && <span className={overdue ? 'text-rose-600 font-bold' : ''}>· Дедлайн: {s.deadline}{overdue ? ' (прострочено)' : ''}</span>}
        </div>
      </div>
      {s.recipient && <span className="shrink-0 text-[12px] font-bold text-emet-blue mt-0.5 whitespace-nowrap">→ {s.recipient}</span>}
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={onEdit} disabled={busy} title="Редагувати" className="p-1.5 rounded-lg text-slate-400 hover:text-emet-blue hover:bg-white disabled:opacity-50"><Pencil className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={del} disabled={busy} title="Видалити" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button>
      </div>
    </div>
  );
}

function SignalForm({ period, initial, onClose, onSaved }: {
  period: string; initial: Partial<MarketSignal>; onClose: () => void; onSaved: () => void;
}) {
  const [signal, setSignal] = useState(initial.signal ?? '');
  const [source, setSource] = useState(initial.source ?? '');
  const [recipient, setRecipient] = useState(initial.recipient ?? '');
  const [deadline, setDeadline] = useState(initial.deadline ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isEdit = !!initial.id;
  const inputCls = 'h-9 rounded-lg border border-[rgba(6,42,61,0.15)] bg-white px-2.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-emet-blue/30';

  const save = async () => {
    if (!signal.trim()) { setErr('Опишіть сигнал'); return; }
    setBusy(true); setErr(null);
    const payload = { period, id: initial.id, signal: signal.trim(), source, recipient, deadline: deadline || null };
    try {
      const res = await fetch('/api/rop-report/signals', {
        method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      if (res.ok) onSaved();
      else setErr((await res.json().catch(() => ({})))?.error || 'Не вдалося зберегти');
    } catch { setErr('Мережна помилка'); }
    finally { setBusy(false); }
  };

  return (
    <div className="px-4 py-3 border-b border-[#e2e7ef] bg-slate-50/60 space-y-2">
      <textarea value={signal} onChange={e => setSignal(e.target.value)} autoFocus rows={2} maxLength={1000}
        placeholder="Сигнал: що відбувається на ринку (дії конкурента, зміна попиту, регуляторика, дефіцит…)"
        className="w-full rounded-lg border border-[rgba(6,42,61,0.15)] bg-white px-2.5 py-2 text-[12.5px] resize-y focus:outline-none focus:ring-2 focus:ring-emet-blue/30" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input value={source} onChange={e => setSource(e.target.value)} maxLength={300} placeholder="Джерело (регіон/и)" className={inputCls} />
        <input value={recipient} onChange={e => setRecipient(e.target.value)} maxLength={300} placeholder="Кому (→ CPO / CMO)" className={inputCls} />
        <input type="date" value={deadline ?? ''} onChange={e => setDeadline(e.target.value)} className={inputCls} title="Дедлайн реакції" />
      </div>
      {err && <p className="text-[12px] text-rose-600">{err}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={busy}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[12.5px] font-bold text-white bg-emet-blue disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{isEdit ? 'Зберегти' : 'Додати'}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className="h-9 px-3 rounded-lg text-[12.5px] font-medium text-muted-foreground hover:text-foreground">Скасувати</button>
      </div>
    </div>
  );
}
