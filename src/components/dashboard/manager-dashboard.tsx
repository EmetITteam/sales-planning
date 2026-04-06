'use client';

import { useState } from 'react';
import { getMockTMSummaries } from '@/lib/mock-data';
import { formatUSD, formatPct, getTrafficLight } from '@/lib/format';
import { PlanningForm } from '../planning/planning-form';
import { ClientControlView } from '../control/client-control-view';
import {
  DollarSign, Target, TrendingUp, ChevronRight,
  ClipboardCheck, ArrowUpRight, ArrowDownRight, Users, UserPlus, RefreshCw,
} from 'lucide-react';

export function ManagerDashboard() {
  const [view, setView] = useState<'dashboard' | 'plan' | 'control'>('dashboard');
  const [selectedSegment, setSelectedSegment] = useState('');

  const summaries = getMockTMSummaries();
  const totalPlan = summaries.reduce((s, t) => s + t.planAmount, 0);
  const totalFact = summaries.reduce((s, t) => s + t.factAmount, 0);
  const totalPct = totalPlan > 0 ? (totalFact / totalPlan) * 100 : 0;

  if (view === 'plan' && selectedSegment) return <PlanningForm segmentCode={selectedSegment} onBack={() => setView('dashboard')} />;
  if (view === 'control') return <ClientControlView onBack={() => setView('dashboard')} />;

  // Мок: факт по категоріях клієнтів (буде з 1С)
  const clientStats = {
    active: { total: 131, bought: 28, amount: 12450 },
    sleeping: { total: 45, bought: 5, amount: 1890 },
    newClients: { total: 8, bought: 2, amount: 680 },
  };

  return (
    <div className="space-y-8">
      {/* Hero metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          {
            label: 'План місяця', value: formatUSD(totalPlan),
            icon: <Target className="h-5 w-5" />,
            gradient: 'from-[#066aab] to-[#0880cc]',
          },
          {
            label: 'Факт', value: formatUSD(totalFact),
            badge: totalPct >= 20
              ? { text: `+${(totalPct - 22.73).toFixed(1)}%`, positive: true }
              : { text: `${(totalPct - 22.73).toFixed(1)}%`, positive: false },
            icon: <DollarSign className="h-5 w-5" />,
            gradient: 'from-emerald-500 to-teal-600',
          },
          {
            label: 'Виконання', value: formatPct(totalPct),
            subtitle: 'Очікуване: 22.7%',
            icon: <TrendingUp className="h-5 w-5" />,
            gradient: 'from-[#066aab] to-[#0880cc]',
          },
        ].map((m) => (
          <div key={m.label} className="relative overflow-hidden bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_24px_rgba(0,0,0,0.04)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_12px_36px_rgba(0,0,0,0.06)] transition-shadow duration-300">
            <div className="flex items-start justify-between">
              <div className={`flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br ${m.gradient} text-white shadow-lg`}>
                {m.icon}
              </div>
              {m.badge && (
                <span className={`inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                  m.badge.positive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {m.badge.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {m.badge.text}
                </span>
              )}
            </div>
            <div className="mt-4">
              <p className="text-[13px] font-medium text-muted-foreground">{m.label}</p>
              <p className="text-2xl font-extrabold tracking-tight mt-0.5">{m.value}</p>
              {m.subtitle && <p className="text-[11px] text-muted-foreground mt-1">{m.subtitle}</p>}
            </div>
            <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-gradient-to-br ${m.gradient} opacity-[0.06] blur-2xl`} />
          </div>
        ))}

        {/* Клієнти по категоріях — факт купівель */}
        <div className="relative overflow-hidden bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_24px_rgba(0,0,0,0.04)]">
          <p className="text-[13px] font-medium text-muted-foreground mb-3">Клієнти — факт купівель</p>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#066aab]" />
                <span className="text-[12px] font-medium">Активні</span>
              </div>
              <span className="text-[13px] font-bold">
                <span className="text-emerald-600">{clientStats.active.bought}</span>
                <span className="text-muted-foreground font-normal"> / {clientStats.active.total}</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-amber-500" />
                <span className="text-[12px] font-medium">Сплячі</span>
              </div>
              <span className="text-[13px] font-bold">
                <span className="text-emerald-600">{clientStats.sleeping.bought}</span>
                <span className="text-muted-foreground font-normal"> / {clientStats.sleeping.total}</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-emerald-500" />
                <span className="text-[12px] font-medium">Нові</span>
              </div>
              <span className="text-[13px] font-bold">
                <span className="text-emerald-600">{clientStats.newClients.bought}</span>
                <span className="text-muted-foreground font-normal"> / {clientStats.newClients.total}</span>
              </span>
            </div>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-[#f0f2f8]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Всього купили</span>
              <span className="text-[14px] font-extrabold text-emerald-600">
                {clientStats.active.bought + clientStats.sleeping.bought + clientStats.newClients.bought}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Control banner */}
      <button
        onClick={() => setView('control')}
        className="w-full flex items-center gap-4 bg-gradient-to-r from-[#066aab]/5 via-[#0880cc]/5 to-[#066aab]/5 hover:from-[#066aab]/10 hover:to-[#0880cc]/10 rounded-2xl border border-[#066aab]/15 p-5 transition-all duration-300 cursor-pointer group"
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-[#066aab] to-[#0880cc] text-white shadow-lg shadow-[#066aab]/15">
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <div className="text-left flex-1">
          <p className="text-[15px] font-bold text-foreground">Контроль виконання</p>
          <p className="text-[13px] text-muted-foreground mt-0.5">Понедільний план → факт по клієнтах за місяць</p>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-[#066aab] group-hover:translate-x-1 transition-all" />
      </button>

      {/* TM Cards Grid */}
      <div>
        <h3 className="text-[15px] font-bold mb-4">Торгові марки</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {summaries.map((tm) => {
            const tl = getTrafficLight(tm.factPercent, tm.expectedPercent);
            return (
              <button
                key={tm.segmentCode}
                onClick={() => { setSelectedSegment(tm.segmentCode); setView('plan'); }}
                className="group text-left bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_12px_36px_rgba(0,0,0,0.08)] transition-all duration-300 cursor-pointer hover:-translate-y-0.5 relative overflow-hidden"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-3 h-3 rounded-full ${tl.dot} shadow-sm`} />
                    <span className="text-[15px] font-bold">{tm.segmentName}</span>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${tl.bg} ${tl.color}`}>
                    {tl.label}
                  </span>
                </div>
                <div className="mb-4">
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-2xl font-extrabold tracking-tight">{formatPct(tm.factPercent)}</span>
                    <span className="text-[11px] text-muted-foreground">/ {formatPct(tm.expectedPercent)} очік.</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[#f0f2f8] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#066aab] to-[#0880cc] transition-all duration-500"
                      style={{ width: `${Math.min(tm.factPercent * (100 / Math.max(tm.expectedPercent * 2, 100)), 100)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">План</p>
                    <p className="text-[14px] font-bold mt-0.5">{formatUSD(tm.planAmount)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Факт</p>
                    <p className="text-[14px] font-bold mt-0.5">{formatUSD(tm.factAmount)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Клієнти</p>
                    <p className="text-[14px] font-bold mt-0.5">{tm.clientCount}</p>
                  </div>
                </div>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight className="h-5 w-5 text-[#066aab]" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
