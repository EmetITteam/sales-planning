'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientSearchModal } from './client-search-modal';
import { formatUSD, getProbColor, formatDate } from '@/lib/format';
import { MOCK_SALES_PLAN, MOCK_SALES_FACT, MOCK_CLIENTS_PETARAN, MOCK_FORECASTS_PETARAN, MOCK_GAP_CLOSURES, SEGMENTS } from '@/lib/mock-data';
import type { ForecastRow, GapClosureRow, Client1C, ClientCategorySummary } from '@/lib/types';
import { ArrowLeft, Save, Search, Target, DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Trash2, Plus, Users, UserPlus, RefreshCw, AlertTriangle } from 'lucide-react';

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
  const [monthForecast, setMonthForecast] = useState('100');
  const [searchOpen, setSearchOpen] = useState(false);

  const planAmount = plan?.planAmount ?? 0;
  const factAmount = fact?.totalAmount ?? 0;
  const factPct = planAmount > 0 ? (factAmount / planAmount) * 100 : 0;
  const expectedPct = 22.73;
  const deviation = factPct - expectedPct;

  const weightedTotal = forecasts.reduce((sum, f) => sum + f.forecastAmount * (f.probability / 100), 0);
  const rawTotal = forecasts.reduce((sum, f) => sum + f.forecastAmount, 0);
  const gapTotal = gapClosures.reduce((sum, g) => sum + g.potentialAmount, 0);

  // Розрив = план - (факт + зважений pipeline)
  const gap = planAmount - (factAmount + weightedTotal);

  // Зведена по категоріях клієнтів (з 1С)
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

  const updateForecast = (index: number, field: keyof ForecastRow, value: string | number) => {
    setForecasts(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const updateGap = (index: number, field: keyof GapClosureRow, value: string | number) => {
    setGapClosures(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addClient = (client: Client1C) => {
    setForecasts(prev => [...prev, {
      clientId1c: client.clientId, clientName: client.clientName, clientType: client.category,
      forecastAmount: client.lastPurchaseAmount || 0, probability: 30, dealStage: '', nextStep: '', risk: '',
      managerName: 'Фещенко',
    }]);
  };

  const addGapRow = () => {
    setGapClosures(prev => [...prev, {
      clientName: '', clientId1c: null, potentialAmount: 0, action: '', deadline: '', comment: '',
    }]);
  };

  const existingIds = forecasts.map(f => f.clientId1c).filter(Boolean) as string[];

  const CAT_ICONS = {
    active: <Users className="h-4 w-4 text-[#066aab]" />,
    new: <UserPlus className="h-4 w-4 text-emerald-600" />,
    sleeping_lost: <RefreshCw className="h-4 w-4 text-amber-600" />,
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Дашборд
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-[15px] font-bold">{segment?.name}</span>
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#e8f4fc] text-[#066aab]">
          Березень 2026
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'План', value: formatUSD(planAmount), icon: <Target className="h-4.5 w-4.5" />, grad: 'from-[#066aab] to-[#0880cc]' },
          { label: 'Факт', value: formatUSD(factAmount), icon: <DollarSign className="h-4.5 w-4.5" />, grad: 'from-emerald-500 to-teal-600',
            badge: { text: `${factPct.toFixed(1)}%`, ok: factPct >= expectedPct } },
          { label: 'Відхилення', value: `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%`,
            icon: deviation >= 0 ? <TrendingUp className="h-4.5 w-4.5" /> : <TrendingDown className="h-4.5 w-4.5" />,
            grad: deviation >= 0 ? 'from-emerald-500 to-teal-600' : 'from-rose-500 to-red-600' },
          { label: 'Pipeline (зваж.)', value: formatUSD(weightedTotal), icon: <TrendingUp className="h-4.5 w-4.5" />, grad: 'from-[#066aab] to-[#0880cc]',
            sub: `Сирий: ${formatUSD(rawTotal)}` },
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
            {'sub' in m && m.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{m.sub}</p>}
          </div>
        ))}
        {/* Прогноз місяця */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)]">
          <p className="text-[11px] text-muted-foreground font-medium mb-2">Прогноз місяця</p>
          <div className="flex items-baseline gap-1">
            <Input type="number" value={monthForecast} onChange={(e) => setMonthForecast(e.target.value)}
              className="h-9 w-20 text-xl font-extrabold border-[#e8ebf4] bg-[#f6f8fc] rounded-xl" />
            <span className="text-lg font-bold text-muted-foreground">%</span>
          </div>
        </div>
      </div>

      {/* === БЛОК: Дані по клієнтах по ТМ === */}
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e2e7ef]">
          <h3 className="text-[14px] font-bold">Дані по клієнтах по ТМ</h3>
        </div>
        <div className="divide-y divide-[#f0f2f8]">
          {categories.map(cat => (
            <div key={cat.category} className="flex items-center gap-4 px-5 py-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f4f7fb]">
                {CAT_ICONS[cat.category]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium">{cat.label}</p>
              </div>
              <div className="text-right min-w-[80px]">
                <p className="text-[10px] text-muted-foreground">Кількість</p>
                <p className="text-[14px] font-bold">{cat.clientCount}</p>
              </div>
              <div className="text-right min-w-[100px]">
                <p className="text-[10px] text-muted-foreground">Очікувана сума</p>
                <p className="text-[14px] font-bold font-mono">{formatUSD(cat.expectedAmount)}</p>
              </div>
              <div className="text-right min-w-[80px]">
                <p className="text-[10px] text-muted-foreground">Закривають %</p>
                <p className="text-[14px] font-bold text-[#066aab]">{cat.planCoveragePercent.toFixed(1)}%</p>
              </div>
            </div>
          ))}
          {/* Всього */}
          <div className="flex items-center gap-4 px-5 py-3 bg-[#f4f7fb]">
            <div className="w-8" />
            <p className="flex-1 text-[13px] font-bold">Всього</p>
            <div className="text-right min-w-[80px]"><p className="text-[14px] font-bold">{totalCatClients}</p></div>
            <div className="text-right min-w-[100px]"><p className="text-[14px] font-bold font-mono">{formatUSD(totalCatAmount)}</p></div>
            <div className="text-right min-w-[80px]"><p className="text-[14px] font-bold text-[#066aab]">{totalCatPct.toFixed(1)}%</p></div>
          </div>
        </div>
      </div>

      {/* === ПРОГНОЗ ПО КЛІЄНТАХ === */}
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
            const pc = getProbColor(row.probability);
            const weighted = row.forecastAmount * row.probability / 100;
            return (
              <div key={row.clientId1c ?? i} className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-200 overflow-hidden">
                {/* Client header */}
                <div className="flex items-center gap-4 px-5 py-3 border-b border-[#f0f2f8]">
                  <div className={`w-2.5 h-2.5 rounded-full ${pc.dot}`} />
                  <span className="text-[14px] font-semibold flex-1">{row.clientName}</span>
                  {/* Менеджер */}
                  <span className="text-[11px] px-2.5 py-1 rounded-lg bg-[#f4f7fb] text-muted-foreground font-medium">{row.managerName}</span>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground block">Сума</span>
                      <span className="text-[15px] font-bold">${row.forecastAmount}</span>
                    </div>
                    <Select value={String(row.probability)} onValueChange={(v) => { if (v) updateForecast(i, 'probability', parseInt(v)); }}>
                      <SelectTrigger className={`h-8 w-[75px] text-[12px] font-bold rounded-xl border-2 ${pc.border} ${pc.bg} ${pc.text}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="100">100%</SelectItem>
                        <SelectItem value="70">70%</SelectItem>
                        <SelectItem value="30">30%</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-right min-w-[60px]">
                      <span className="text-[10px] text-muted-foreground block">Зважена</span>
                      <span className="text-[14px] font-bold text-[#066aab]">{formatUSD(weighted)}</span>
                    </div>
                    <button onClick={() => setForecasts(prev => prev.filter((_, j) => j !== i))}
                      className="ml-1 p-1.5 rounded-lg hover:bg-rose-50 text-muted-foreground/30 hover:text-rose-500 transition-colors cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {/* Editable fields */}
                <div className="grid grid-cols-3 gap-3 px-5 py-3">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Етап угоди</label>
                    <Input value={row.dealStage} onChange={(e) => updateForecast(i, 'dealStage', e.target.value)}
                      className="h-9 text-[13px] rounded-xl border-[#e8ebf4] bg-[#fafbfe] placeholder:text-muted-foreground/40" placeholder="Описання етапу..." />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Наступний крок</label>
                    <Input value={row.nextStep} onChange={(e) => updateForecast(i, 'nextStep', e.target.value)}
                      className="h-9 text-[13px] rounded-xl border-[#e8ebf4] bg-[#fafbfe] placeholder:text-muted-foreground/40" placeholder="Що зробити далі..." />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Ризик</label>
                    <Input value={row.risk} onChange={(e) => updateForecast(i, 'risk', e.target.value)}
                      className="h-9 text-[13px] rounded-xl border-[#e8ebf4] bg-[#fafbfe] placeholder:text-muted-foreground/40" placeholder="Можливі ризики..." />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pipeline summary */}
        {forecasts.length > 0 && (
          <div className="mt-4 bg-gradient-to-r from-[#066aab]/5 to-[#0880cc]/5 rounded-2xl border border-[#066aab]/10 p-5 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-[11px] text-muted-foreground font-medium">Сирий pipeline</span>
                <p className="text-xl font-extrabold">{formatUSD(rawTotal)}</p>
              </div>
              <div className="w-px h-10 bg-[#066aab]/10" />
              <div>
                <span className="text-[11px] text-muted-foreground font-medium">Зважений pipeline</span>
                <p className="text-xl font-extrabold text-[#066aab]">{formatUSD(weightedTotal)}</p>
              </div>
              <div className="w-px h-10 bg-[#066aab]/10" />
              <div>
                <span className="text-[11px] text-muted-foreground font-medium">Клієнтів</span>
                <p className="text-xl font-extrabold">{forecasts.length}</p>
              </div>
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
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600">
                План покрито
              </span>
            )}
          </div>
          <Button onClick={addGapRow} variant="outline"
            className="gap-1.5 text-[12px] h-8 rounded-xl border-[#c5e3f6] text-[#066aab] hover:bg-[#e8f4fc]">
            <Plus className="h-3.5 w-3.5" /> Додати
          </Button>
        </div>

        {gapClosures.length > 0 && (
          <div className="space-y-3">
            {gapClosures.map((row, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-3 border-b border-[#f0f2f8]">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <div className="flex-1">
                    <Input value={row.clientName} onChange={(e) => updateGap(i, 'clientName', e.target.value)}
                      className="h-8 text-[14px] font-semibold border-0 shadow-none p-0 bg-transparent focus-visible:ring-0" placeholder="Ім'я клієнта..." />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground block">Потенціал</span>
                      <div className="flex items-center gap-0.5">
                        <span className="text-[12px] text-muted-foreground">$</span>
                        <Input type="number" value={row.potentialAmount} onChange={(e) => updateGap(i, 'potentialAmount', parseFloat(e.target.value) || 0)}
                          className="h-7 w-[70px] text-right text-[14px] font-bold border-[#e8ebf4] bg-[#fafbfe] rounded-lg" />
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground block">Термін</span>
                      <Input type="date" value={row.deadline} onChange={(e) => updateGap(i, 'deadline', e.target.value)}
                        className="h-7 w-[130px] text-[12px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg" />
                    </div>
                    <button onClick={() => setGapClosures(prev => prev.filter((_, j) => j !== i))}
                      className="p-1.5 rounded-lg hover:bg-rose-50 text-muted-foreground/30 hover:text-rose-500 transition-colors cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 px-5 py-3">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Дія</label>
                    <Input value={row.action} onChange={(e) => updateGap(i, 'action', e.target.value)}
                      className="h-9 text-[13px] rounded-xl border-[#e8ebf4] bg-[#fafbfe]" placeholder="Що зробити..." />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Коментар</label>
                    <Input value={row.comment} onChange={(e) => updateGap(i, 'comment', e.target.value)}
                      className="h-9 text-[13px] rounded-xl border-[#e8ebf4] bg-[#fafbfe]" placeholder="Додаткова інформація..." />
                  </div>
                </div>
              </div>
            ))}

            {/* Gap summary */}
            <div className="bg-amber-50/50 rounded-2xl border border-amber-200/30 p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-[11px] text-muted-foreground font-medium">Потенціал закриття</span>
                  <p className="text-lg font-extrabold">{formatUSD(gapTotal)}</p>
                </div>
                <div className="w-px h-8 bg-amber-200/40" />
                <div>
                  <span className="text-[11px] text-muted-foreground font-medium">Розрив залишається</span>
                  <p className={`text-lg font-extrabold ${gap - gapTotal > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {gap - gapTotal > 0 ? formatUSD(gap - gapTotal) : 'Покрито'}
                  </p>
                </div>
                <div className="w-px h-8 bg-amber-200/40" />
                <div>
                  <span className="text-[11px] text-muted-foreground font-medium">Клієнтів</span>
                  <p className="text-lg font-extrabold">{gapClosures.length}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center justify-end pb-8">
        <Button className="gap-2 bg-gradient-to-r from-[#066aab] to-[#0880cc] hover:from-[#055a91] hover:to-[#0775bb] text-white shadow-lg shadow-[#066aab]/15 rounded-xl h-11 px-6 text-[14px] font-semibold">
          <Save className="h-4 w-4" /> Зберегти
        </Button>
      </div>

      <ClientSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={addClient} excludeIds={existingIds} />
    </div>
  );
}
