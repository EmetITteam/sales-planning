'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClientSearchModal } from './client-search-modal';
import { formatUSD } from '@/lib/format';
import { MOCK_SALES_PLAN, MOCK_SALES_FACT, MOCK_CLIENTS_PETARAN, MOCK_FORECASTS_PETARAN, MOCK_GAP_CLOSURES, SEGMENTS } from '@/lib/mock-data';
import type { ForecastRow, GapClosureRow, Client1C, ClientCategorySummary, GapActions } from '@/lib/types';
import { ArrowLeft, Save, Search, Target, DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Trash2, Plus, Users, UserPlus, RefreshCw, AlertTriangle, Check } from 'lucide-react';

interface PlanningFormProps {
  segmentCode: string;
  onBack: () => void;
}

export function PlanningForm({ segmentCode, onBack }: PlanningFormProps) {
  const segment = SEGMENTS.find(s => s.code === segmentCode);
  const plan = MOCK_SALES_PLAN.plans.find(p => p.segmentCode === segmentCode);
  const fact = MOCK_SALES_FACT.facts.find(f => f.segmentCode === segmentCode);

  const [forecasts, setForecasts] = useState<ForecastRow[]>(
    segmentCode === 'PETARAN' ? MOCK_FORECASTS_PETARAN : []
  );
  const [gapClosures, setGapClosures] = useState<GapClosureRow[]>(
    segmentCode === 'PETARAN' ? MOCK_GAP_CLOSURES : []
  );
  const [monthForecastPct, setMonthForecastPct] = useState('100');
  const [monthForecastUsd, setMonthForecastUsd] = useState('');
  const [gapActions, setGapActions] = useState<GapActions>({ action1: '', action2: '', action3: '' });
  const [searchOpen, setSearchOpen] = useState(false);

  const planAmount = plan?.planAmount ?? 0;
  const factAmount = fact?.totalAmount ?? 0;
  const factPct = planAmount > 0 ? (factAmount / planAmount) * 100 : 0;
  const expectedPct = 16.67; // 5/30 для квітня
  const deviation = factPct - expectedPct;

  const forecastTotal = forecasts.reduce((sum, f) => sum + f.forecastAmount, 0);
  const forecastFactTotal = forecasts.reduce((sum, f) => sum + f.factAmount, 0);
  const gapTotal = gapClosures.reduce((sum, g) => sum + g.potentialAmount, 0);
  const gapFactTotal = gapClosures.reduce((sum, g) => sum + g.factAmount, 0);
  const gap = planAmount - forecastTotal;

  // Категорії клієнтів
  const activeClients = MOCK_CLIENTS_PETARAN.filter(c => c.category === 'active');
  const sleepingClients = MOCK_CLIENTS_PETARAN.filter(c => c.category === 'sleeping' || c.category === 'lost');
  const activeSum = activeClients.reduce((s, c) => s + c.lastPurchaseAmount, 0);
  const sleepingSum = sleepingClients.reduce((s, c) => s + c.lastPurchaseAmount, 0);
  const categories: ClientCategorySummary[] = [
    { category: 'active', label: 'Активні клієнти', clientCount: activeClients.length, expectedAmount: activeSum, planCoveragePercent: planAmount > 0 ? (activeSum / planAmount) * 100 : 0 },
    { category: 'new', label: 'Нові клієнти по ТМ', clientCount: 0, expectedAmount: 0, planCoveragePercent: 0 },
    { category: 'sleeping_lost', label: 'Активація (Сплячі, Втрачені, БЗ)', clientCount: sleepingClients.length, expectedAmount: sleepingSum, planCoveragePercent: planAmount > 0 ? (sleepingSum / planAmount) * 100 : 0 },
  ];
  const totalCatClients = categories.reduce((s, c) => s + c.clientCount, 0);
  const totalCatAmount = categories.reduce((s, c) => s + c.expectedAmount, 0);
  const totalCatPct = planAmount > 0 ? (totalCatAmount / planAmount) * 100 : 0;

  const updateForecast = (i: number, field: keyof ForecastRow, value: string | number) => {
    setForecasts(prev => { const n = [...prev]; n[i] = { ...n[i], [field]: value }; return n; });
  };
  const updateGap = (i: number, field: keyof GapClosureRow, value: string | number) => {
    setGapClosures(prev => { const n = [...prev]; n[i] = { ...n[i], [field]: value }; return n; });
  };
  const addClient = (client: Client1C) => {
    setForecasts(prev => [...prev, { clientId1c: client.clientId, clientName: client.clientName, clientType: client.category, forecastAmount: client.lastPurchaseAmount || 0, dealStage: '', factAmount: 0 }]);
  };

  const existingIds = forecasts.map(f => f.clientId1c).filter(Boolean) as string[];
  const CAT_ICONS = { active: <Users className="h-4 w-4 text-[#066aab]" />, new: <UserPlus className="h-4 w-4 text-emerald-600" />, sleeping_lost: <RefreshCw className="h-4 w-4 text-amber-600" /> };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Дашборд
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-[15px] font-bold">{segment?.name}</span>
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#e8f4fc] text-[#066aab]">Квітень 2026</span>
      </div>

      {/* Metrics — з Прогноз місяця $ */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { label: 'План', value: formatUSD(planAmount), icon: <Target className="h-4.5 w-4.5" />, grad: 'from-[#066aab] to-[#0880cc]' },
          { label: 'Факт', value: formatUSD(factAmount), icon: <DollarSign className="h-4.5 w-4.5" />, grad: 'from-emerald-500 to-teal-600', badge: { text: `${factPct.toFixed(1)}%`, ok: factPct >= expectedPct } },
          { label: 'Відхилення', value: `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%`, icon: deviation >= 0 ? <TrendingUp className="h-4.5 w-4.5" /> : <TrendingDown className="h-4.5 w-4.5" />, grad: deviation >= 0 ? 'from-emerald-500 to-teal-600' : 'from-rose-500 to-red-600' },
          { label: 'Прогноз клієнтів', value: formatUSD(forecastTotal), icon: <TrendingUp className="h-4.5 w-4.5" />, grad: 'from-[#066aab] to-[#0880cc]' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] relative overflow-hidden">
            <div className="flex items-center gap-2.5 mb-2">
              <div className={`flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br ${m.grad} text-white`}>{m.icon}</div>
              {'badge' in m && m.badge && (
                <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold ${m.badge.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {m.badge.ok ? <ArrowUpRight className="inline h-2.5 w-2.5" /> : <ArrowDownRight className="inline h-2.5 w-2.5" />} {m.badge.text}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground font-medium">{m.label}</p>
            <p className="text-xl font-extrabold tracking-tight">{m.value}</p>
          </div>
        ))}
        {/* Прогноз місяця % */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
          <p className="text-[11px] text-muted-foreground font-medium mb-1">Прогноз місяця %</p>
          <div className="flex items-baseline gap-1">
            <Input type="number" value={monthForecastPct} onChange={(e) => setMonthForecastPct(e.target.value)}
              className="h-9 w-20 text-xl font-extrabold border-[#e8ebf4] bg-[#f6f8fc] rounded-xl" />
            <span className="text-lg font-bold text-muted-foreground">%</span>
          </div>
        </div>
        {/* Прогноз місяця $ */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
          <p className="text-[11px] text-muted-foreground font-medium mb-1">Прогноз місяця $</p>
          <div className="flex items-baseline gap-1">
            <span className="text-sm text-muted-foreground">$</span>
            <Input type="number" value={monthForecastUsd} onChange={(e) => setMonthForecastUsd(e.target.value)}
              placeholder={String(planAmount)}
              className="h-9 w-24 text-xl font-extrabold border-[#e8ebf4] bg-[#f6f8fc] rounded-xl" />
          </div>
        </div>
      </div>

      {/* Дані по клієнтах */}
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e2e7ef]">
          <h3 className="text-[14px] font-bold">Дані по клієнтах по ТМ</h3>
        </div>
        <div className="divide-y divide-[#f0f2f8]">
          {categories.map(cat => (
            <div key={cat.category} className="flex items-center gap-4 px-5 py-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f4f7fb]">{CAT_ICONS[cat.category]}</div>
              <p className="flex-1 text-[13px] font-medium">{cat.label}</p>
              <div className="text-right min-w-[70px]"><p className="text-[10px] text-muted-foreground">Кількість</p><p className="text-[14px] font-bold">{cat.clientCount}</p></div>
              <div className="text-right min-w-[90px]"><p className="text-[10px] text-muted-foreground">Очікувана сума</p><p className="text-[14px] font-bold font-mono">{formatUSD(cat.expectedAmount)}</p></div>
              <div className="text-right min-w-[80px]"><p className="text-[10px] text-muted-foreground">Закривають %</p><p className="text-[14px] font-bold text-[#066aab]">{cat.planCoveragePercent.toFixed(1)}%</p></div>
            </div>
          ))}
          <div className="flex items-center gap-4 px-5 py-3 bg-[#f4f7fb]">
            <div className="w-8" />
            <p className="flex-1 text-[13px] font-bold">Всього</p>
            <div className="text-right min-w-[70px]"><p className="text-[14px] font-bold">{totalCatClients}</p></div>
            <div className="text-right min-w-[90px]"><p className="text-[14px] font-bold font-mono">{formatUSD(totalCatAmount)}</p></div>
            <div className="text-right min-w-[80px]"><p className="text-[14px] font-bold text-[#066aab]">{totalCatPct.toFixed(1)}%</p></div>
          </div>
        </div>
      </div>

      {/* === ПРОГНОЗ ПО КЛІЄНТАХ (спрощений: Клієнт | Сума | Етап угоди | Факт) === */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-bold">Прогноз по клієнтах <span className="text-muted-foreground font-normal">({forecasts.length})</span></h3>
          <Button onClick={() => setSearchOpen(true)}
            className="gap-2 bg-gradient-to-r from-[#066aab] to-[#0880cc] hover:from-[#055a91] hover:to-[#0775bb] text-white shadow-lg shadow-[#066aab]/15 rounded-xl h-9 px-4 text-[13px]">
            <Search className="h-3.5 w-3.5" /> Додати клієнта
          </Button>
        </div>

        <div className="space-y-3">
          {forecasts.map((row, i) => {
            const hasFact = row.factAmount > 0;
            const factMatch = hasFact && row.factAmount >= row.forecastAmount;
            return (
              <div key={row.clientId1c ?? i} className={`bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-200 ${hasFact ? 'ring-1 ring-emerald-200' : ''}`}>
                <div className="flex items-center gap-4 px-5 py-3">
                  {/* Статус факту */}
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    factMatch ? 'bg-emerald-100' : hasFact ? 'bg-amber-100' : 'bg-[#f4f7fb]'
                  }`}>
                    {factMatch ? <Check className="h-4 w-4 text-emerald-600" /> :
                     hasFact ? <DollarSign className="h-4 w-4 text-amber-600" /> :
                     <span className="text-[12px] font-bold text-muted-foreground">{i + 1}</span>}
                  </div>

                  {/* Клієнт */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold truncate">{row.clientName}</p>
                  </div>

                  {/* Сума */}
                  <div className="shrink-0">
                    <p className="text-[10px] text-muted-foreground text-right">Сума</p>
                    <Input type="number" value={row.forecastAmount}
                      onChange={(e) => updateForecast(i, 'forecastAmount', parseFloat(e.target.value) || 0)}
                      className="h-8 w-[80px] text-right text-[14px] font-bold border-[#e8ebf4] bg-[#fafbfe] rounded-lg" />
                  </div>

                  {/* Етап угоди */}
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-[10px] text-muted-foreground">Етап угоди</p>
                    <Input value={row.dealStage} onChange={(e) => updateForecast(i, 'dealStage', e.target.value)}
                      className="h-8 text-[13px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg" placeholder="Опис етапу..." />
                  </div>

                  {/* Факт на дату звіту */}
                  <div className="shrink-0 min-w-[80px]">
                    <p className="text-[10px] text-muted-foreground text-right">Факт</p>
                    <p className={`text-[14px] font-bold text-right ${hasFact ? 'text-emerald-600' : 'text-muted-foreground/40'}`}>
                      {hasFact ? formatUSD(row.factAmount) : '—'}
                    </p>
                  </div>

                  {/* Видалити */}
                  <button onClick={() => setForecasts(prev => prev.filter((_, j) => j !== i))}
                    className="p-1.5 rounded-lg hover:bg-rose-50 text-muted-foreground/20 hover:text-rose-500 transition-colors cursor-pointer shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Підсумок прогнозу */}
        {forecasts.length > 0 && (
          <div className="mt-3 bg-[#f4f7fb] rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div><span className="text-[11px] text-muted-foreground">Всього план</span><p className="text-lg font-extrabold">{formatUSD(forecastTotal)}</p></div>
              <div className="w-px h-8 bg-[#e2e7ef]" />
              <div><span className="text-[11px] text-muted-foreground">Всього факт</span><p className="text-lg font-extrabold text-emerald-600">{formatUSD(forecastFactTotal)}</p></div>
              <div className="w-px h-8 bg-[#e2e7ef]" />
              <div><span className="text-[11px] text-muted-foreground">Клієнтів</span><p className="text-lg font-extrabold">{forecasts.length}</p></div>
            </div>
          </div>
        )}
      </div>

      {/* === ЗАКРИТТЯ РОЗРИВУ === */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-[15px] font-bold">Закриття розриву</h3>
            {gap > 0 ? (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-600">
                <AlertTriangle className="h-3 w-3" /> Розрив: {formatUSD(gap)}
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600">План покрито</span>
            )}
          </div>
          <Button onClick={() => setGapClosures(prev => [...prev, { clientName: '', clientId1c: null, potentialAmount: 0, action: '', deadline: '', factAmount: 0 }])}
            variant="outline" className="gap-1.5 text-[12px] h-8 rounded-xl border-[#c5e3f6] text-[#066aab] hover:bg-[#e8f4fc]">
            <Plus className="h-3.5 w-3.5" /> Додати
          </Button>
        </div>

        {gapClosures.length > 0 && (
          <div className="space-y-3">
            {gapClosures.map((row, i) => {
              const hasFact = row.factAmount > 0;
              return (
                <div key={i} className={`bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] overflow-hidden ${hasFact ? 'ring-1 ring-emerald-200' : ''}`}>
                  <div className="flex items-center gap-4 px-5 py-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${hasFact ? 'bg-emerald-100' : 'bg-amber-50'}`}>
                      {hasFact ? <Check className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Input value={row.clientName} onChange={(e) => updateGap(i, 'clientName', e.target.value)}
                        className="h-8 text-[14px] font-semibold border-0 shadow-none p-0 bg-transparent focus-visible:ring-0" placeholder="Ім'я клієнта..." />
                    </div>
                    <div className="shrink-0">
                      <p className="text-[10px] text-muted-foreground text-right">Потенціал</p>
                      <Input type="number" value={row.potentialAmount} onChange={(e) => updateGap(i, 'potentialAmount', parseFloat(e.target.value) || 0)}
                        className="h-8 w-[80px] text-right text-[14px] font-bold border-[#e8ebf4] bg-[#fafbfe] rounded-lg" />
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <p className="text-[10px] text-muted-foreground">Дія</p>
                      <Input value={row.action} onChange={(e) => updateGap(i, 'action', e.target.value)}
                        className="h-8 text-[13px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg" placeholder="Що зробити..." />
                    </div>
                    <div className="shrink-0">
                      <p className="text-[10px] text-muted-foreground">Термін</p>
                      <Input type="date" value={row.deadline} onChange={(e) => updateGap(i, 'deadline', e.target.value)}
                        className="h-8 w-[130px] text-[12px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg" />
                    </div>
                    <div className="shrink-0 min-w-[70px]">
                      <p className="text-[10px] text-muted-foreground text-right">Факт</p>
                      <p className={`text-[14px] font-bold text-right ${hasFact ? 'text-emerald-600' : 'text-muted-foreground/40'}`}>
                        {hasFact ? formatUSD(row.factAmount) : '—'}
                      </p>
                    </div>
                    <button onClick={() => setGapClosures(prev => prev.filter((_, j) => j !== i))}
                      className="p-1.5 rounded-lg hover:bg-rose-50 text-muted-foreground/20 hover:text-rose-500 transition-colors cursor-pointer shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Підсумок розриву */}
            <div className="bg-amber-50/50 rounded-2xl border border-amber-200/30 p-4 flex items-center gap-6">
              <div><span className="text-[11px] text-muted-foreground">Потенціал</span><p className="text-lg font-extrabold">{formatUSD(gapTotal)}</p></div>
              <div className="w-px h-8 bg-amber-200/40" />
              <div><span className="text-[11px] text-muted-foreground">Факт закриття</span><p className="text-lg font-extrabold text-emerald-600">{formatUSD(gapFactTotal)}</p></div>
              <div className="w-px h-8 bg-amber-200/40" />
              <div><span className="text-[11px] text-muted-foreground">Всього</span><p className="text-lg font-extrabold">{formatUSD(gapTotal + forecastTotal)}</p></div>
            </div>
          </div>
        )}
      </div>

      {/* === ДІЇ ДЛЯ ЗАКРИТТЯ РОЗРИВУ (текстовий блок) === */}
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e2e7ef]">
          <h3 className="text-[14px] font-bold">Дії, що буде застосовано для закриття розриву</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          {(['action1', 'action2', 'action3'] as const).map((key, i) => (
            <div key={key} className="flex items-center gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#f4f7fb] text-[12px] font-bold text-muted-foreground shrink-0">{i + 1}</span>
              <Input
                value={gapActions[key]}
                onChange={(e) => setGapActions(prev => ({ ...prev, [key]: e.target.value }))}
                className="h-9 text-[13px] rounded-xl border-[#e8ebf4] bg-[#fafbfe]"
                placeholder={`Дія ${i + 1}...`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Зберегти */}
      <div className="flex items-center justify-end pb-8">
        <Button className="gap-2 bg-gradient-to-r from-[#066aab] to-[#0880cc] hover:from-[#055a91] hover:to-[#0775bb] text-white shadow-lg shadow-[#066aab]/15 rounded-xl h-11 px-6 text-[14px] font-semibold">
          <Save className="h-4 w-4" /> Зберегти
        </Button>
      </div>

      <ClientSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={addClient} excludeIds={existingIds} />
    </div>
  );
}
