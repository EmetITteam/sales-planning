'use client';

/**
 * Зведений звіт РОП (Лист 4) — presentational. Дані з useRopReport. Стилі —
 * у мові системи (glass-card, статус-тинти, mono-числа, emet-blue).
 */
import { useState } from 'react';
import { Flame, Loader2, Check } from 'lucide-react';
import type { RopReport, RopRegionRow } from '@/lib/use-rop-report';
import type { StatusTone } from '@/lib/status-badge';
import { formatUSD } from '@/lib/format';

const toneText: Record<StatusTone, string> = { ok: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-rose-600' };
const badgeCls: Record<StatusTone, string> = {
  ok: 'bg-emerald-500/12 border-emerald-300/50 text-emerald-700',
  warn: 'bg-amber-500/12 border-amber-300/50 text-amber-700',
  bad: 'bg-rose-500/12 border-rose-300/50 text-rose-700',
};
const pct = (n: number) => `${Math.round(n)}%`;

export function RopReportView({ data, onSaved }: { data: RopReport; onSaved?: () => void }) {
  return (
    <div className="space-y-4">
      <Hero data={data} />
      <SummaryTable data={data} />
      <RedZones data={data} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Promises data={data} />
        <Planning data={data} onSaved={onSaved} />
      </div>
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────
function Metric({ label, children, foot }: { label: string; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <div className="glass-card p-4">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1.5">{children}</div>
      {foot && <div className="text-[11.5px] text-muted-foreground mt-2">{foot}</div>}
    </div>
  );
}

function Hero({ data }: { data: RopReport }) {
  const h = data.hero;
  const compTone: StatusTone = h.companyForecastPct >= 100 ? 'ok' : h.companyForecastPct >= 80 ? 'warn' : 'bad';
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Metric label="Виконання компанії"
        foot={<>норма на дату — <b className="tabular-nums">{pct(h.norm)}</b> · темп <b className="tabular-nums">{pct(h.companyForecastPct)}</b></>}>
        <span className={`amount text-[30px] font-extrabold tabular-nums ${toneText[compTone]}`}>{pct(h.companyPct)}</span>
      </Metric>
      <Metric label="Регіони за міткою">
        <div className="flex gap-1.5">
          {(['ok', 'warn', 'bad'] as StatusTone[]).map(t => (
            <span key={t} className={`flex-1 text-center rounded-lg py-1.5 ${badgeCls[t]}`}>
              <span className="block text-[18px] font-extrabold tabular-nums leading-none mb-1">{h.regionsByTone[t]}</span>
              <span className="text-[10px] font-bold">{t === 'ok' ? 'в плані' : t === 'warn' ? 'ризик' : 'відстав.'}</span>
            </span>
          ))}
        </div>
      </Metric>
      <Metric label="План узгоджено в термін"
        foot={h.overdueRegions.length > 0
          ? <>{h.overdueRegions.length} прострочив: {h.overdueRegions.map(r => r.region).join(', ')}</>
          : 'усі регіони в термін'}>
        <span className="amount text-[30px] font-extrabold tabular-nums text-emerald-600">{h.planAgreedInTime}<span className="text-[18px] text-slate-400">/{h.planTotal}</span></span>
      </Metric>
      <Metric label="Обіцянки минулого звіту"
        foot={<>виконано · {h.promisesTotal - h.promisesDone} не виконано (з причинами)</>}>
        <span className="amount text-[30px] font-extrabold tabular-nums">{h.promisesDone}<span className="text-[18px] text-slate-400">/{h.promisesTotal}</span></span>
      </Metric>
    </div>
  );
}

// ── 4.1 Зведена таблиця ──────────────────────────────────────────────────────
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

function PromiseCell({ p }: { p: RopRegionRow['promise'] }) {
  if (p.status === 'yes') return <span className="inline-flex items-center h-6 px-2 rounded-full text-[11px] font-bold bg-emerald-500/12 text-emerald-700 border border-emerald-300/40">Так</span>;
  if (p.status === 'none') return <span className="text-[11px] text-muted-foreground/50">—</span>;
  const first = p.notDone[0];
  return (
    <span className="inline-flex items-center h-6 px-2 rounded-full text-[11px] font-bold bg-rose-500/12 text-rose-700 border border-rose-300/40 max-w-[220px] truncate" title={p.notDone.map(n => `${n.brand}: ${n.reason ?? ''}`).join(' · ')}>
      Ні{first?.reason ? ` · ${first.reason}` : ''}
    </span>
  );
}

function SummaryTable({ data }: { data: RopReport }) {
  const rows = [...data.regions].sort((a, b) => a.forecastPct - b.forecastPct); // проблемні внизу? — за темпом зростанням = гірші зверху
  return (
    <div className="glass-card overflow-hidden">
      <SectionHead no="4.1" title="Зведена таблиця по регіонах" hint={`Автозбір з тижневих звітів РМ · ${data.regions.length} представництв`} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[880px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
              <th className="text-left px-3.5 py-2.5 border-b border-[#e2e7ef]">Регіон</th>
              <th className="text-right px-3.5 py-2.5 border-b border-[#e2e7ef]">% на дату</th>
              <th className="text-left px-3.5 py-2.5 border-b border-[#e2e7ef]">Мітка</th>
              <th className="text-left px-3.5 py-2.5 border-b border-[#e2e7ef]">Червоні бренди</th>
              <th className="text-left px-3.5 py-2.5 border-b border-[#e2e7ef]">Причина за стандартом</th>
              <th className="text-left px-3.5 py-2.5 border-b border-[#e2e7ef]">Дія на тиждень</th>
              <th className="text-left px-3.5 py-2.5 border-b border-[#e2e7ef]">Обіцянка→факт</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const muted = !r.reportFinalized;
              return (
                <tr key={r.code} className={`text-[12.5px] border-b border-[#f0f2f8] last:border-0 hover:bg-[#f5f7fb] ${muted ? 'opacity-60' : ''}`}>
                  <td className="px-3.5 py-3 align-top">
                    <div className="font-bold text-[13.5px]">{r.name}</div>
                    <div className="text-[10.5px] text-slate-400">{r.managerCount} мгр{muted ? ' · звіт не подано' : ''}</div>
                  </td>
                  <td className={`px-3.5 py-3 text-right align-top font-mono font-extrabold text-[16px] ${toneText[r.badge.tone]}`}>{pct(r.pct)}</td>
                  <td className="px-3.5 py-3 align-top"><span className={`inline-block text-[9.5px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 border ${badgeCls[r.badge.tone]}`}>{r.badge.label}</span></td>
                  <td className="px-3.5 py-3 align-top">
                    {r.redBrands.length === 0
                      ? <span className="text-[10.5px] font-bold rounded px-2 py-0.5 border bg-[#f5f7fb] text-slate-400 border-[#e8ecf5]">— чисто</span>
                      : <div className="flex flex-wrap gap-1">{r.redBrands.map(b => <span key={b} className="text-[10.5px] font-bold rounded px-1.5 py-0.5 border bg-rose-500/10 text-rose-700 border-rose-300/40">{b}</span>)}</div>}
                  </td>
                  <td className="px-3.5 py-3 align-top text-[11.8px] text-muted-foreground max-w-[240px]">
                    {r.worst?.reason || <span className="italic text-muted-foreground/50">причину не внесено</span>}
                    {r.extraRedCount > 0 && <span className="ml-1 text-[10px] font-bold text-rose-600">+{r.extraRedCount}</span>}
                  </td>
                  <td className="px-3.5 py-3 align-top text-[11.8px] text-muted-foreground max-w-[240px]">
                    {r.worst?.action || <span className="italic text-muted-foreground/50">дію не внесено</span>}
                  </td>
                  <td className="px-3.5 py-3 align-top"><PromiseCell p={r.promise} /></td>
                </tr>
              );
            })}
          </tbody>
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
            <div className="w-[120px] font-bold text-[13.5px] shrink-0"><Flame className="inline h-3.5 w-3.5 text-amber-500 mr-1" />{z.brand}</div>
            <div className="flex-1 h-6 bg-[#eef1f6] rounded-lg overflow-hidden min-w-[100px]">
              <div className={`h-full rounded-lg ${z.escalate ? 'bg-rose-500' : 'bg-amber-500'}`} style={{ width: `${(z.count / 8) * 100}%` }} />
            </div>
            <div className="flex-[1.3] text-[11.5px] text-muted-foreground min-w-[140px]">{z.regions.join(' · ')}</div>
            <div className={`w-[110px] text-right font-mono font-extrabold text-[15px] shrink-0 ${z.escalate ? 'text-rose-600' : 'text-amber-600'}`}>
              {z.count}/8{z.escalate && <span className="ml-1.5 text-[10px] font-bold uppercase rounded px-1.5 py-0.5 bg-rose-500/12 border border-rose-300/40 whitespace-nowrap">→ {data.recipients.escalation}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 4.3 Реєстр обіцянок ──────────────────────────────────────────────────────
function Promises({ data }: { data: RopReport }) {
  const reg = data.promiseRegister;
  const done = reg.reduce((a, r) => a + r.doneCount, 0);
  const total = reg.reduce((a, r) => a + r.total, 0);
  return (
    <div className="glass-card overflow-hidden">
      <SectionHead no="4.3" title="Реєстр обіцянок" hint={total > 0 ? `${total} обіцянок · ${done} виконано` : undefined} />
      {reg.length === 0
        ? <div className="p-6 text-[12px] text-muted-foreground text-center">за період обіцянок не було</div>
        : reg.map(r => (
          <div key={r.region} className="px-4 py-3 border-b border-[#f0f2f8] last:border-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[12.5px] w-[80px] shrink-0">{r.region}</span>
              {r.status === 'yes' && <span className="text-[11px] font-bold text-emerald-700">усі виконані ({r.doneCount})</span>}
              {r.status === 'none' && <span className="text-[11px] text-muted-foreground/60">не відмічено</span>}
              {r.status === 'no' && <span className="text-[11px] font-bold text-rose-700">не виконано: {r.notDone.length}</span>}
            </div>
            {r.status === 'no' && (
              <ul className="mt-1 ml-[80px] space-y-0.5">
                {r.notDone.map((n, i) => (
                  <li key={i} className="text-[11.5px] text-muted-foreground leading-snug">
                    <b className="text-foreground/70">{n.brand}</b>{n.promiseText ? ` «${n.promiseText}»` : ''} — <span className="text-rose-600">{n.reason || 'причину не вказано'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
    </div>
  );
}

// ── 4.4 Підсумки планування (+ ручна причина затримки) ───────────────────────
const planChip: Record<string, string> = {
  in_time: 'bg-emerald-500/12 text-emerald-700 border-emerald-300/40',
  late: 'bg-rose-500/12 text-rose-700 border-rose-300/40',
  draft: 'bg-amber-500/12 text-amber-700 border-amber-300/40',
  not_started: 'bg-slate-100 text-slate-500 border-slate-200',
};
const planLabel: Record<string, string> = { in_time: '', late: '', draft: 'чернетка', not_started: 'не розпочато' };

function Planning({ data, onSaved }: { data: RopReport; onSaved?: () => void }) {
  const inTime = data.regions.filter(r => r.plan.inTime).length;
  return (
    <div className="glass-card overflow-hidden">
      <SectionHead no="4.4" title="Підсумки планування" hint="до 16:00 4-го роб. дня" />
      <div className="flex flex-wrap gap-2 p-4">
        {data.regions.map(r => (
          <span key={r.code} className={`inline-flex items-center gap-1.5 text-[12px] font-bold rounded-lg px-3 py-2 border ${planChip[r.plan.state]}`}>
            {r.name}
            {r.plan.state === 'late' && <small className="font-medium opacity-80">+{r.plan.overdueWorkingDays} дні</small>}
            {planLabel[r.plan.state] && <small className="font-medium opacity-80">{planLabel[r.plan.state]}</small>}
          </span>
        ))}
      </div>
      <div className="px-4 pb-3 text-[11.5px] text-muted-foreground">
        {inTime} із {data.regions.length} регіонів узгодили план у термін.
      </div>
      {/* Причина затримки — ручний ввід РОП по прострочених/не-узгоджених */}
      {data.regions.filter(r => r.plan.state === 'late' || r.plan.state === 'draft' || r.plan.state === 'not_started').map(r => (
        <LateReasonRow key={r.code} period={data.period} region={r} onSaved={onSaved} />
      ))}
    </div>
  );
}

function LateReasonRow({ period, region, onSaved }: { period: string; region: RopRegionRow; onSaved?: () => void }) {
  const auto = region.plan.state === 'late'
    ? `прострочено на ${region.plan.overdueWorkingDays} роб. дні`
    : region.plan.state === 'not_started' ? 'план не розпочато' : 'є чернетки, не фіналізовано';
  const [val, setVal] = useState(region.plan.lateReason ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setBusy(true); setSaved(false);
    try {
      const res = await fetch('/api/rop-report/late-reason', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ period, regionCode: region.code, reason: val.trim() }),
      });
      if (res.ok) { setSaved(true); onSaved?.(); }
    } finally { setBusy(false); }
  };
  return (
    <div className="px-4 py-2 border-t border-[#f0f2f8] flex items-center gap-2 flex-wrap">
      <span className="text-[11.5px] font-bold w-[80px] shrink-0">{region.name}</span>
      <span className="text-[10.5px] text-rose-600 shrink-0">{auto}</span>
      <input value={val} onChange={e => { setVal(e.target.value); setSaved(false); }} disabled={busy}
        placeholder="причина затримки (необов'язково)…" maxLength={300}
        className="flex-1 min-w-[160px] h-8 rounded-lg border border-[rgba(6,42,61,0.15)] bg-white px-2.5 text-[11.5px] focus:outline-none focus:ring-2 focus:ring-emet-blue/30 disabled:opacity-50" />
      <button type="button" onClick={save} disabled={busy}
        className="h-8 px-3 rounded-lg text-[11px] font-bold text-white bg-emet-blue disabled:opacity-50 inline-flex items-center gap-1.5">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
        {busy ? 'Зберігаю' : saved ? 'Збережено' : 'Зберегти'}
      </button>
    </div>
  );
}
