'use client';

import { useState } from 'react';
import { formatUSD } from '@/lib/format';
import { getMonthName } from '@/lib/periods';
import { ArrowLeft, Check, X, Phone, Calendar, Target, DollarSign, TrendingUp, Users } from 'lucide-react';

interface ClientControlViewProps { onBack: () => void; }

interface WeekRecord {
  weekLabel: string; plannedAmount: number; plannedAction: string;
  actualAmount: number; callPlanned: boolean; callDone: boolean;
  meetingPlanned: boolean; meetingDone: boolean; dealClosed: boolean;
}

interface ClientControl {
  clientId: string; clientName: string; segment: string;
  monthPlan: number; monthFact: number; weeks: WeekRecord[];
}

const DATA: ClientControl[] = [
  { clientId: 'C001', clientName: 'Бліндовська Яна', segment: 'Petaran', monthPlan: 378, monthFact: 378,
    weeks: [{ weekLabel: '02-08.03', plannedAmount: 378, plannedAction: 'продаж акції', actualAmount: 378, callPlanned: true, callDone: true, meetingPlanned: false, meetingDone: false, dealClosed: true }] },
  { clientId: 'C002', clientName: 'Андрущук Катерина', segment: 'Petaran', monthPlan: 378, monthFact: 0,
    weeks: [
      { weekLabel: '02-08.03', plannedAmount: 378, plannedAction: 'зідзвон, продаж акції', actualAmount: 0, callPlanned: true, callDone: true, meetingPlanned: false, meetingDone: false, dealClosed: false },
      { weekLabel: '09-15.03', plannedAmount: 378, plannedAction: 'нагадування про акцію', actualAmount: 0, callPlanned: true, callDone: true, meetingPlanned: false, meetingDone: false, dealClosed: false },
      { weekLabel: '16-22.03', plannedAmount: 378, plannedAction: 'запросити на навчання', actualAmount: 0, callPlanned: true, callDone: false, meetingPlanned: false, meetingDone: false, dealClosed: false },
    ] },
  { clientId: 'C009', clientName: 'Воронько Катерина', segment: 'Petaran', monthPlan: 595, monthFact: 0,
    weeks: [
      { weekLabel: '02-08.03', plannedAmount: 595, plannedAction: 'зідзвон, акція від 5 флаконів', actualAmount: 0, callPlanned: true, callDone: false, meetingPlanned: false, meetingDone: false, dealClosed: false },
      { weekLabel: '09-15.03', plannedAmount: 595, plannedAction: 'повторний зідзвон', actualAmount: 0, callPlanned: true, callDone: true, meetingPlanned: false, meetingDone: false, dealClosed: false },
    ] },
  { clientId: 'C050', clientName: 'Клініка Гіппократ', segment: 'Neuronox', monthPlan: 540, monthFact: 540,
    weeks: [{ weekLabel: '02-08.03', plannedAmount: 540, plannedAction: 'замовлення', actualAmount: 540, callPlanned: true, callDone: true, meetingPlanned: false, meetingDone: false, dealClosed: true }] },
  { clientId: 'C051', clientName: 'Тараненко Альона', segment: 'Neuronox', monthPlan: 285, monthFact: 285,
    weeks: [{ weekLabel: '02-08.03', plannedAmount: 285, plannedAction: 'акційна пропозиція', actualAmount: 285, callPlanned: true, callDone: true, meetingPlanned: false, meetingDone: false, dealClosed: true }] },
  { clientId: 'C003', clientName: 'Гімішлі Анастасія', segment: 'Petaran', monthPlan: 252, monthFact: 0,
    weeks: [
      { weekLabel: '02-08.03', plannedAmount: 252, plannedAction: 'зідзвон, запрос на навчання', actualAmount: 0, callPlanned: true, callDone: true, meetingPlanned: false, meetingDone: false, dealClosed: false },
      { weekLabel: '09-15.03', plannedAmount: 252, plannedAction: 'продаж акції', actualAmount: 0, callPlanned: true, callDone: false, meetingPlanned: false, meetingDone: false, dealClosed: false },
    ] },
];

const Dot = ({ ok }: { ok: boolean }) => (
  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${ok ? 'bg-emerald-100' : 'bg-rose-100'}`}>
    {ok ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-rose-400" />}
  </div>
);

export function ClientControlView({ onBack }: ClientControlViewProps) {
  const [filter, setFilter] = useState<'all' | 'done' | 'pending'>('all');

  const filtered = DATA.filter(c => {
    if (filter === 'done') return c.monthFact >= c.monthPlan;
    if (filter === 'pending') return c.monthFact < c.monthPlan;
    return true;
  });

  const totalPlan = DATA.reduce((s, c) => s + c.monthPlan, 0);
  const totalFact = DATA.reduce((s, c) => s + c.monthFact, 0);
  const doneCount = DATA.filter(c => c.monthFact >= c.monthPlan).length;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Дашборд
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-[15px] font-bold">Контроль виконання</span>
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#e8f4fc] text-[#066aab]">{getMonthName(new Date().getFullYear(), new Date().getMonth())}</span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'План по клієнтах', value: formatUSD(totalPlan), icon: <Target className="h-5 w-5" />, grad: 'from-[#066aab] to-[#0880cc]', isAmount: true },
          { label: 'Факт', value: formatUSD(totalFact), icon: <DollarSign className="h-5 w-5" />, grad: 'from-emerald-500 to-teal-600', isAmount: true },
          { label: 'Виконали план', value: `${doneCount} / ${DATA.length}`, icon: <TrendingUp className="h-5 w-5" />, grad: 'from-[#066aab] to-[#0880cc]', isAmount: false },
          { label: 'В роботі', value: String(DATA.length - doneCount), icon: <Users className="h-5 w-5" />, grad: 'from-amber-500 to-orange-600', isAmount: false },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden">
            <div className={`flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br ${m.grad} text-white shadow-lg mb-3`}>{m.icon}</div>
            <p className="text-[12px] text-muted-foreground font-medium">{m.label}</p>
            <p className={`text-2xl font-extrabold tracking-tight ${m.isAmount ? 'amount' : ''}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {([
          { key: 'all' as const, label: 'Всі', count: DATA.length },
          { key: 'done' as const, label: 'Виконано', count: doneCount },
          { key: 'pending' as const, label: 'В роботі', count: DATA.length - doneCount },
        ]).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
              filter === f.key
                ? 'bg-[#066aab] text-white shadow-lg shadow-[#066aab]/15'
                : 'bg-white text-muted-foreground hover:bg-gray-50 shadow-sm'
            }`}
          >
            {f.label}
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
              filter === f.key ? 'bg-white/20 text-white' : 'bg-[#f0f2f8] text-muted-foreground'
            }`}>{f.count}</span>
          </button>
        ))}
      </div>

      {/* Client cards */}
      <div className="space-y-4">
        {filtered.map(client => {
          const done = client.monthFact >= client.monthPlan;
          const pct = client.monthPlan > 0 ? (client.monthFact / client.monthPlan) * 100 : 0;
          return (
            <div key={client.clientId} className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-[14px] ${
                    done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {client.clientName.charAt(0)}
                  </div>
                  <div>
                    <p className="text-[14px] font-bold">{client.clientName}</p>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f0f2f8] text-muted-foreground font-medium">{client.segment}</span>
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">План</p>
                    <p className="text-[16px] font-bold amount">{formatUSD(client.monthPlan)}</p>
                  </div>
                  <div className="w-px h-8 bg-[#e8ebf4]" />
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Факт</p>
                    <p className={`text-[16px] font-extrabold amount ${done ? 'text-emerald-600' : 'text-foreground'}`}>
                      {formatUSD(client.monthFact)}
                    </p>
                  </div>
                  {/* Mini progress */}
                  <div className="w-16">
                    <div className="w-full h-2 rounded-full bg-[#f0f2f8] overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${done ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#066aab] to-[#0880cc]'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-center text-muted-foreground mt-0.5">{pct.toFixed(0)}%</p>
                  </div>
                  {done && (
                    <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-200">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              </div>

              {/* Weeks timeline */}
              <div className="px-6 pb-4">
                <div className="space-y-0">
                  {client.weeks.map((w, i) => (
                    <div key={w.weekLabel} className="flex items-center gap-4 py-2.5 border-t border-[#f0f2f8]">
                      {/* Week label */}
                      <div className="w-[80px] shrink-0">
                        <span className="text-[12px] font-semibold text-muted-foreground bg-[#f6f8fc] px-2 py-1 rounded-lg">{w.weekLabel}</span>
                      </div>
                      {/* Plan amount */}
                      <div className="w-[60px] shrink-0 text-right">
                        <span className="text-[13px] font-mono font-medium">{w.plannedAmount > 0 ? <span className="amount">{formatUSD(w.plannedAmount)}</span> : '—'}</span>
                      </div>
                      {/* Action */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-muted-foreground truncate">{w.plannedAction || '—'}</p>
                      </div>
                      {/* Call status */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {w.callPlanned ? (
                          <>
                            <Phone className="h-3.5 w-3.5 text-muted-foreground/60" />
                            <Dot ok={w.callDone} />
                          </>
                        ) : <div className="w-[42px]" />}
                      </div>
                      {/* Meeting status */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {w.meetingPlanned ? (
                          <>
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
                            <Dot ok={w.meetingDone} />
                          </>
                        ) : <div className="w-[42px]" />}
                      </div>
                      {/* Actual */}
                      <div className="w-[65px] text-right shrink-0">
                        {w.actualAmount > 0 ? (
                          <span className="text-[13px] font-bold text-emerald-600 amount">{formatUSD(w.actualAmount)}</span>
                        ) : (
                          <span className="text-[12px] text-muted-foreground/40">—</span>
                        )}
                      </div>
                      {/* Deal status */}
                      <div className="shrink-0">
                        {w.dealClosed ? (
                          <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center"><Check className="h-3.5 w-3.5 text-white" /></div>
                        ) : w.plannedAmount > 0 ? (
                          <div className="w-7 h-7 rounded-full bg-[#f0f2f8] flex items-center justify-center"><X className="h-3 w-3 text-muted-foreground/40" /></div>
                        ) : <div className="w-7" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
