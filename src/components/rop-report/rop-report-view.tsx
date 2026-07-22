'use client';

/**
 * Зведений звіт РОП (Лист 4) — presentational. Дані з useRopReport. Стилі — у
 * мові системи (MetricCard hero, glass-card секції, статус-тинти, mono-числа).
 */
import { useState } from 'react';
import { Loader2, Check, ChevronDown } from 'lucide-react';
import { MetricCard } from '@/components/dashboard/metric-card';
import type { RopReport, RopRegionRow } from '@/lib/use-rop-report';
import type { StatusTone } from '@/lib/status-badge';

const toneText: Record<StatusTone, string> = { ok: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-rose-600' };
const toneIcon: Record<StatusTone, string> = { ok: 'text-emerald-500', warn: 'text-amber-500', bad: 'text-rose-500' };
const toneAmbient: Record<StatusTone, 'good' | 'warn' | 'bad'> = { ok: 'good', warn: 'warn', bad: 'bad' };
const badgeCls: Record<StatusTone, string> = {
  ok: 'bg-emerald-500/12 border-emerald-300/50 text-emerald-700',
  warn: 'bg-amber-500/12 border-amber-300/50 text-amber-700',
  bad: 'bg-rose-500/12 border-rose-300/50 text-rose-700',
};
const pct = (n: number) => `${Math.round(n)}%`;

export function RopReportView({ data }: { data: RopReport }) {
  return (
    <div className="space-y-4">
      <Hero data={data} />
      <SummaryTable data={data} />
      <RedZones data={data} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Promises data={data} />
        <Planning data={data} />
      </div>
    </div>
  );
}

// ── clamp-текст з розгорнути/згорнути ────────────────────────────────────────
function ClampText({ text, lines = 3, empty }: { text?: string | null; lines?: 2 | 3; empty: string }) {
  const [open, setOpen] = useState(false);
  if (!text || !text.trim()) return <span className="italic text-muted-foreground/50">{empty}</span>;
  const long = text.length > 90;
  return (
    <>
      <p className={`whitespace-pre-wrap ${open ? '' : lines === 2 ? 'line-clamp-2' : 'line-clamp-3'}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen(o => !o)} className="mt-0.5 text-[10.5px] font-semibold text-emet-blue hover:underline">
          {open ? 'згорнути' : 'розгорнути'}
        </button>
      )}
    </>
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
        label="Виконання компанії"
        value={<span className={toneText[compTone]}>{pct(h.companyPct)}</span>}
        caption={<span className="text-muted-foreground">норма — <b className="tabular-nums text-foreground/70">{pct(h.norm)}</b> · темп <b className="tabular-nums text-foreground/70">{pct(h.companyForecastPct)}</b></span>} />

      <div className="glass-card p-4 sm:p-5 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emet-blue text-emet-blue shadow-[0_0_6px_currentColor]" />
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Регіони за міткою</p>
        </div>
        <div className="flex gap-1.5">
          {(['ok', 'warn', 'bad'] as StatusTone[]).map(t => (
            <span key={t} className={`flex-1 text-center rounded-lg py-1.5 border ${badgeCls[t]}`}>
              <span className="block text-[20px] font-extrabold tabular-nums leading-none mb-1">{h.regionsByTone[t]}</span>
              <span className="text-[10px] font-bold">{t === 'ok' ? 'в плані' : t === 'warn' ? 'ризик' : 'відстав.'}</span>
            </span>
          ))}
        </div>
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

// ── section header (як у звіті РМ) ───────────────────────────────────────────
function SectionHead({ no, title, hint }: { no: string; title: string; hint?: string }) {
  return (
    <div className="px-4 py-2.5 border-b border-[#e2e7ef] flex items-center justify-between gap-3 flex-wrap">
      <h2 className="text-[13px] font-bold flex items-center">
        <span className="font-mono text-[11px] font-bold text-white bg-emet-blue rounded px-1.5 py-0.5 mr-2">{no}</span>{title}
      </h2>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

// ── 4.1 Зведена таблиця ──────────────────────────────────────────────────────
function PromiseCell({ p }: { p: RopRegionRow['promise'] }) {
  if (p.status === 'yes') return <span className="inline-flex items-center h-6 px-2 rounded-full text-[11px] font-bold bg-emerald-500/12 text-emerald-700 border border-emerald-300/40">Так</span>;
  if (p.status === 'none') return <span className="text-[11px] text-muted-foreground/50">—</span>;
  const first = p.notDone[0];
  return (
    <span className="inline-flex items-center h-6 px-2 rounded-full text-[11px] font-bold bg-rose-500/12 text-rose-700 border border-rose-300/40 max-w-[200px] truncate" title={p.notDone.map(n => `${n.brand}: ${n.reason ?? ''}`).join(' · ')}>
      Ні{first?.reason ? ` · ${first.reason}` : ''}
    </span>
  );
}

function SubmissionBadge({ r }: { r: RopRegionRow }) {
  if (r.submission === 'submitted') return <span className="text-[10px] font-bold text-emerald-600">звіт подано</span>;
  if (r.submission === 'partial') return <span className="text-[10px] font-bold text-amber-600">заповнюється</span>;
  return <span className="text-[10px] font-bold text-slate-400">звіт не подано</span>;
}

function SummaryRow({ r }: { r: RopRegionRow }) {
  const [showReds, setShowReds] = useState(false);
  const muted = r.submission === 'empty'; // приглушуємо ТІЛЬКИ якщо нема ні звіту, ні заміток
  const otherReds = r.reds.filter(b => b.code !== r.worst?.code);
  return (
    <>
      <tr className={`text-[12.5px] border-b border-[#f0f2f8] hover:bg-[#f5f7fb] ${muted ? 'opacity-55' : ''}`}>
        <td className="px-3.5 py-3 align-top min-w-[130px]">
          <div className="font-bold text-[13.5px]">{r.name}</div>
          <div className="text-[10.5px] text-slate-400">{r.managerCount} мгр · <SubmissionBadge r={r} /></div>
        </td>
        <td className={`px-3.5 py-3 text-right align-top font-mono font-extrabold text-[16px] ${toneText[r.badge.tone]}`}>{pct(r.pct)}</td>
        <td className="px-3.5 py-3 align-top"><span className={`inline-block text-[9.5px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 border ${badgeCls[r.badge.tone]}`}>{r.badge.label}</span></td>
        <td className="px-3.5 py-3 align-top min-w-[110px]">
          {r.redBrands.length === 0
            ? <span className="text-[10.5px] font-bold rounded px-2 py-0.5 border bg-[#f5f7fb] text-slate-400 border-[#e8ecf5]">— чисто</span>
            : <div className="flex flex-wrap gap-1 items-center">
                <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5 border bg-rose-500/10 text-rose-700 border-rose-300/40">{r.worst?.name}</span>
                {r.extraRedCount > 0 && (
                  <button type="button" onClick={() => setShowReds(s => !s)} className="text-[10px] font-bold rounded px-1.5 py-0.5 border bg-rose-500/8 text-rose-600 border-rose-300/40 hover:bg-rose-500/15 inline-flex items-center gap-0.5">
                    +{r.extraRedCount}<ChevronDown className={`h-2.5 w-2.5 transition-transform ${showReds ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>}
        </td>
        <td className="px-3.5 py-3 align-top text-[11.8px] text-muted-foreground min-w-[200px] max-w-[260px]">
          <ClampText text={r.worst?.reason} empty="причину не внесено" />
        </td>
        <td className="px-3.5 py-3 align-top text-[11.8px] text-muted-foreground min-w-[180px] max-w-[260px]">
          <ClampText text={r.worst?.action} empty="дію не внесено" />
        </td>
        <td className="px-3.5 py-3 align-top"><PromiseCell p={r.promise} /></td>
      </tr>
      {showReds && otherReds.length > 0 && (
        <tr className="bg-[#fbf4f5] border-b border-[#f0f2f8]">
          <td colSpan={7} className="px-3.5 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-rose-500/70 font-bold mb-1.5">Інші червоні бренди регіону</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
              {otherReds.map(b => (
                <div key={b.code} className="text-[11.5px] text-muted-foreground">
                  <b className="text-rose-700">{b.name}</b> <span className="text-slate-400 font-mono">({pct(b.forecastPct)})</span>
                  <div className="mt-0.5"><ClampText text={b.reason} lines={2} empty="причину не внесено" /></div>
                  {b.action?.trim() && <div className="mt-0.5 text-slate-500"><b className="text-slate-600">Дія:</b> {b.action}</div>}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SummaryTable({ data }: { data: RopReport }) {
  const rows = [...data.regions].sort((a, b) => a.forecastPct - b.forecastPct);
  return (
    <div className="glass-card overflow-hidden">
      <SectionHead no="4.1" title="Зведена таблиця по регіонах" hint={`Автозбір з тижневих звітів РМ · ${data.regions.length} представництв`} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[920px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
              {['Регіон', '% на дату', 'Мітка', 'Червоні бренди', 'Причина за стандартом', 'Дія на тиждень', 'Обіцянка→факт'].map((h, i) => (
                <th key={h} className={`px-3.5 py-2.5 border-b border-[#e2e7ef] ${i === 1 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{rows.map(r => <SummaryRow key={r.code} r={r} />)}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── 4.2 Червоні зони ─────────────────────────────────────────────────────────
function RedZones({ data }: { data: RopReport }) {
  if (data.redZones.length === 0) {
    return <div className="glass-card overflow-hidden"><SectionHead no="4.2" title="Червоні зони по брендах" /><div className="p-6 text-[12px] text-muted-foreground text-center">немає червоних брендів за період</div></div>;
  }
  return (
    <div className="glass-card overflow-hidden">
      <SectionHead no="4.2" title="Червоні зони по брендах" hint={`Бренд у «відставанні» в 4+ регіонах → окремим пунктом на ${data.recipients.escalation}`} />
      <div className="p-2">
        {data.redZones.map(z => (
          <div key={z.brand} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#f5f7fb]">
            <div className="w-[120px] font-bold text-[13.5px] shrink-0">{z.brand}</div>
            <div className="flex-1 h-6 bg-[#eef1f6] rounded-lg overflow-hidden min-w-[100px]">
              <div className={`h-full rounded-lg ${z.escalate ? 'bg-rose-500' : 'bg-amber-500'}`} style={{ width: `${(z.count / 8) * 100}%` }} />
            </div>
            <div className="flex-[1.3] text-[11px] text-muted-foreground/60 min-w-[140px]">{z.regions.join(' · ')}</div>
            <div className={`w-[110px] text-right font-mono font-extrabold text-[15px] shrink-0 ${z.escalate ? 'text-rose-600' : 'text-amber-600'}`}>
              {z.count}/8{z.escalate && <span className="ml-1.5 text-[10px] font-bold uppercase rounded px-1.5 py-0.5 bg-rose-500/12 border border-rose-300/40 whitespace-nowrap">→ {data.recipients.escalation}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 4.3 Реєстр обіцянок (по регіону) ─────────────────────────────────────────
function Promises({ data }: { data: RopReport }) {
  const reg = data.promiseRegister;
  const done = reg.reduce((a, r) => a + r.doneCount, 0);
  const total = reg.reduce((a, r) => a + r.total, 0);
  return (
    <div className="glass-card overflow-hidden">
      <SectionHead no="4.3" title="Реєстр обіцянок" hint={total > 0 ? `${total} обіцянок · ${done} виконано` : undefined} />
      {reg.length === 0
        ? <div className="p-6 text-[12px] text-muted-foreground text-center">за період обіцянок не було</div>
        : <div className="p-3 space-y-2.5">
          {reg.map(r => (
            <div key={r.region} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-[13px]">{r.region}</span>
                {r.status === 'yes' && <span className="text-[11px] font-bold text-emerald-700">усі виконані ({r.doneCount})</span>}
                {r.status === 'no' && <span className="text-[11px] font-bold text-rose-700">не виконано: {r.notDone.length}</span>}
                {r.status === 'none' && <span className="text-[11px] text-muted-foreground/60">не відмічено</span>}
              </div>
              {r.status === 'no' && (
                <div className="space-y-2 mt-1.5">
                  {r.notDone.map((n, i) => (
                    <div key={i}>
                      <div className="border-l-2 border-slate-300 pl-2 text-[11.5px] text-muted-foreground italic">
                        <b className="not-italic text-foreground/60">{n.brand}</b> {n.promiseText ? <ClampText text={n.promiseText} lines={2} empty="" /> : ''}
                      </div>
                      <div className="text-[11.5px] text-rose-600 mt-0.5 pl-2">{n.reason || 'причину не вказано'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>}
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
    <div className="glass-card overflow-hidden">
      <SectionHead no="4.4" title="Підсумки планування" hint="до 16:00 4-го роб. дня" />
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
  const canEdit = r.plan.state !== 'in_time'; // причина потрібна лише де є проблема
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
