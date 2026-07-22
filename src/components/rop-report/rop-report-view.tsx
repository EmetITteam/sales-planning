'use client';

/**
 * Зведений звіт РОП (Лист 4) — presentational. Дані з useRopReport. Стилі — у
 * мові системи (MetricCard hero, glass-card секції, статус-тинти, mono-числа).
 */
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, ChevronDown, X } from 'lucide-react';
import { MetricCard } from '@/components/dashboard/metric-card';
import { SectionHeader } from '@/components/ui/section-header';
import { PerfBadge } from '@/components/ui/perf-badge';
import type { RopReport, RopRegionRow } from '@/lib/use-rop-report';
import type { StatusTone } from '@/lib/status-badge';

const toneText: Record<StatusTone, string> = { ok: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-rose-600' };
const toneIcon: Record<StatusTone, string> = { ok: 'text-emerald-500', warn: 'text-amber-500', bad: 'text-rose-500' };
const toneAmbient: Record<StatusTone, 'good' | 'warn' | 'bad'> = { ok: 'good', warn: 'warn', bad: 'bad' };
// % — з однією десятою (як `formatPct`/паспорт регіону), без округлення до цілого.
const pct = (n: number) => `${n.toFixed(1)}%`;

/** Українське склонение «менеджер». */
function mgrWord(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'менеджер';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'менеджери';
  return 'менеджерів';
}

// Єдина grid-сітка для шапки колонок і рядків 4.1 (вирівнювання по вертикалі).
const COLS = 'grid grid-cols-[190px_60px_120px_1fr_200px_24px] items-center gap-3';

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
    </div>
  );
}

// ── Hero (MetricCard) ────────────────────────────────────────────────────────
function Hero({ data }: { data: RopReport }) {
  const h = data.hero;
  const compTone: StatusTone = h.companyForecastPct >= 100 ? 'ok' : h.companyForecastPct >= 80 ? 'warn' : 'bad';
  const overdueNames = h.overdueRegions.map(r => r.region).join(', ');
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <MetricCard iconColor={toneIcon[compTone]} valueSize="lg" ambient={toneAmbient[compTone]}
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

      <MetricCard iconColor="text-emerald-500" valueSize="lg"
        label="План узгоджено в термін"
        value={<span className="text-emerald-600">{h.planAgreedInTime}<span className="text-[18px] text-slate-400">/{h.planTotal}</span></span>}
        caption={h.overdueRegions.length > 0
          ? <span className="text-muted-foreground">{h.overdueRegions.length} прострочив: <b className="text-foreground/70">{overdueNames}</b></span>
          : <span className="text-muted-foreground">усі регіони в термін</span>} />

      <MetricCard iconColor="text-emet-blue" valueSize="lg"
        label="Обіцянки минулого звіту"
        value={<>{h.promisesDone}<span className="text-[18px] text-slate-400">/{h.promisesTotal}</span></>}
        caption={<span className="text-muted-foreground">виконано · {h.promisesTotal - h.promisesDone} не виконано (з причинами)</span>} />
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
  if (p.status === 'yes') return <span className="inline-flex items-center h-6 px-2 rounded-full text-[11px] font-bold bg-emerald-500/12 text-emerald-700 border border-emerald-300/40">Так</span>;
  if (p.status === 'none') return <span className="block text-center text-[11px] text-muted-foreground/40">—</span>;
  const first = p.notDone[0];
  return (
    <span className="inline-flex items-center h-6 px-2 rounded-full text-[11px] font-bold bg-rose-500/12 text-rose-700 border border-rose-300/40 max-w-full truncate" title={p.notDone.map(n => `${n.brand}: ${n.reason ?? ''}`).join(' · ')}>
      Ні{first?.reason ? ` · ${first.reason}` : ''}
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
  return (
    <div className={`rounded-xl border p-3 ${worst ? 'border-rose-300/60 bg-rose-50/50' : 'border-slate-200 bg-white'}`}>
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
    <div className={muted ? 'opacity-55' : ''}>
      <div onClick={onToggle} className={`${COLS} w-full px-4 py-2.5 hover:bg-[#f5f7fb] transition-colors cursor-pointer`}>
        <div className="min-w-0">
          {/* Клік по назві → повний звіт цього регіону (не розгортання) */}
          <button type="button" onClick={openRegion} className="block max-w-full text-left font-bold text-[13px] truncate hover:text-emet-blue hover:underline" title="Відкрити звіт регіону">{r.name}</button>
          <div className="text-[10px] text-slate-400 flex items-center gap-1"><SubmissionDot r={r} />{r.managerCount} {mgrWord(r.managerCount)}</div>
        </div>
        <div className={`text-right font-mono font-extrabold text-[14px] ${toneText[r.badge.tone]}`}>{pct(r.pct)}</div>
        <div><PerfBadge forecastPct={r.forecastPct} /></div>
        <div className="flex flex-wrap gap-1 items-center min-w-0">
          {r.redBrands.length === 0
            ? <span className="text-[10.5px] font-bold rounded px-2 py-0.5 border bg-[#f5f7fb] text-slate-400 border-[#e8ecf5]">— чисто</span>
            : r.redBrands.map(b => <span key={b} className="text-[10.5px] font-bold rounded px-1.5 py-0.5 border bg-rose-500/10 text-rose-700 border-rose-300/40 whitespace-nowrap">{b}</span>)}
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
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* шапка колонок */}
          <div className={`${COLS} px-4 py-2 border-b border-[#e2e7ef] text-[10px] uppercase tracking-wider text-slate-400 font-bold`}>
            <span>Регіон</span>
            <span className="text-right">% на дату</span>
            <span>Мітка</span>
            <span>Червоні бренди</span>
            <span>Обіцянка→факт</span>
            <span />
          </div>
          <div className="divide-y divide-[#f0f2f8]">
            {filtered.map(r => (
              <RegionRow key={r.code} r={r} open={openCode === r.code} onToggle={() => setOpenCode(o => (o === r.code ? null : r.code))} />
            ))}
            {filtered.length === 0 && <div className="p-6 text-[12px] text-muted-foreground text-center">немає регіонів з цією міткою</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 4.2 Червоні зони (з % по регіонах) ───────────────────────────────────────
function RedZones({ data }: { data: RopReport }) {
  if (data.redZones.length === 0) {
    return <div className="glass-card overflow-hidden"><SectionHeader no="4.2" title="Червоні зони по брендах" /><div className="p-6 text-[12px] text-muted-foreground text-center">немає червоних брендів за період</div></div>;
  }
  return (
    <div className="glass-card overflow-hidden">
      <SectionHeader no="4.2" title="Червоні зони по брендах" hint={`Бренд у «відставанні» в 4+ регіонах → окремим пунктом на ${data.recipients.escalation}`} />
      <div className="p-2">
        {data.redZones.map(z => (
          <div key={z.brand} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#f5f7fb]">
            <div className="w-[110px] font-bold text-[13.5px] shrink-0">{z.brand}</div>
            <div className="w-[120px] h-6 bg-[#eef1f6] rounded-lg overflow-hidden shrink-0 hidden sm:block">
              <div className={`h-full rounded-lg ${z.escalate ? 'bg-rose-500' : 'bg-amber-500'}`} style={{ width: `${(z.count / 8) * 100}%` }} />
            </div>
            <div className="flex-1 text-[11px] text-muted-foreground/70 min-w-[160px] leading-relaxed">
              {z.regions.map((x, i) => (
                <span key={i}>{i > 0 && <span className="text-slate-300"> · </span>}{x.region} <span className={`font-mono font-semibold ${x.forecastPct < 80 ? 'text-rose-500' : 'text-slate-500'}`}>{pct(x.pct)}</span></span>
              ))}
            </div>
            <div className={`w-[100px] text-right font-mono font-extrabold text-[15px] shrink-0 ${z.escalate ? 'text-rose-600' : 'text-amber-600'}`}>
              {z.count}/8{z.escalate && <span className="ml-1.5 text-[10px] font-bold uppercase rounded px-1.5 py-0.5 bg-rose-500/12 border border-rose-300/40 whitespace-nowrap">→ {data.recipients.escalation}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 4.3 Реєстр обіцянок (по кліку — усі, вкл. виконані) ───────────────────────
function PromiseItem({ p }: { p: RopReport['promiseRegister'][number]['promises'][number] }) {
  const [open, setOpen] = useState(false);
  const icon = p.done === true
    ? <Check className="h-3.5 w-3.5 text-emerald-600" />
    : p.done === false ? <X className="h-3.5 w-3.5 text-rose-500" /> : <span className="block w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 ml-1" />;
  const long = (p.promiseText?.length ?? 0) > 90;
  return (
    <div className="flex gap-2">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-bold text-foreground/80 mb-0.5">{p.brand}</div>
        <p className={`text-[11.5px] text-muted-foreground leading-snug ${open ? '' : 'line-clamp-2'}`}>{p.promiseText || '—'}</p>
        {long && <button type="button" onClick={() => setOpen(o => !o)} className="text-[10px] font-semibold text-emet-blue hover:underline">{open ? 'згорнути' : 'розгорнути'}</button>}
        {p.done === false && <div className="text-[11px] text-rose-600 mt-0.5">{p.reason || 'причину не вказано'}</div>}
      </div>
    </div>
  );
}

function PromiseRegionCard({ r }: { r: RopReport['promiseRegister'][number] }) {
  const [open, setOpen] = useState(false);
  const notDone = r.promises.filter(p => p.done === false).length;
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-[#f5f7fb]">
        <span className="font-bold text-[13px]">{r.region}</span>
        {r.status === 'yes' && <span className="text-[11px] font-bold text-emerald-700">усі виконані ({r.doneCount})</span>}
        {r.status === 'no' && <span className="text-[11px] font-bold text-rose-700">не виконано: {notDone} з {r.total}</span>}
        {r.status === 'none' && <span className="text-[11px] text-muted-foreground/60">не відмічено</span>}
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 ml-auto shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
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
        ? <div className="p-6 text-[12px] text-muted-foreground text-center">за період обіцянок не було</div>
        : <div className="p-3 space-y-2">{reg.map(r => <PromiseRegionCard key={r.region} r={r} />)}</div>}
    </div>
  );
}

// ── 4.4 Підсумки планування (одна строка/регіон) ─────────────────────────────
const planChip: Record<string, { cls: string; label: string }> = {
  in_time: { cls: 'bg-emerald-500/12 text-emerald-700 border-emerald-300/40', label: 'в термін' },
  late: { cls: 'bg-rose-500/12 text-rose-700 border-rose-300/40', label: '' },
  draft: { cls: 'bg-amber-500/12 text-amber-700 border-amber-300/40', label: 'чернетка' },
  not_started: { cls: 'bg-slate-100 text-slate-500 border-slate-200', label: 'не розпочато' },
};

function Planning({ data }: { data: RopReport }) {
  const inTime = data.regions.filter(r => r.plan.inTime).length;
  return (
    <div className="glass-card overflow-hidden h-full">
      <SectionHeader no="4.4" title="Підсумки планування" hint="до 16:00 4-го роб. дня" />
      <div className="px-4 pt-3 pb-2 text-[11.5px] text-muted-foreground">{inTime} із {data.regions.length} регіонів узгодили план у термін.</div>
      <div>{data.regions.map(r => <PlanRow key={r.code} period={data.period} r={r} />)}</div>
    </div>
  );
}

function PlanRow({ period, r }: { period: string; r: RopRegionRow }) {
  const c = planChip[r.plan.state];
  const [val, setVal] = useState(r.plan.lateReason ?? '');
  const [busy, setBusy] = useState(false);
  const [savedVal, setSavedVal] = useState(r.plan.lateReason ?? '');
  const dirty = val.trim() !== savedVal.trim();
  const canEdit = r.plan.state !== 'in_time';
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
    <div className="px-4 py-2 border-t border-[#f0f2f8] flex items-center gap-2 flex-wrap">
      <span className="font-bold text-[12px] w-[78px] shrink-0">{r.name}</span>
      <span className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1 border shrink-0 ${c.cls}`}>
        {r.plan.state === 'late' ? `+${r.plan.overdueWorkingDays} дні` : c.label}
      </span>
      {canEdit && (
        <>
          <input value={val} onChange={e => setVal(e.target.value)} disabled={busy} maxLength={300}
            placeholder="причина затримки…"
            className="flex-1 min-w-[140px] h-8 rounded-lg border border-[rgba(6,42,61,0.15)] bg-white px-2.5 text-[11.5px] focus:outline-none focus:ring-2 focus:ring-emet-blue/30 disabled:opacity-50" />
          {dirty && (
            <button type="button" onClick={save} disabled={busy}
              className="h-8 px-3 rounded-lg text-[11px] font-bold text-white bg-emet-blue disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Зберегти
            </button>
          )}
        </>
      )}
    </div>
  );
}
