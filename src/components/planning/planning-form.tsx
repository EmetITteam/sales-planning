'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientSearchModal } from './client-search-modal';
import { formatUSD, formatDate } from '@/lib/format';
import { savePlanning, loadPlanning, unpackGapAction } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { getDaysInPeriod, getMonthName } from '@/lib/periods';
import { MOCK_SALES_PLAN, MOCK_SALES_FACT, MOCK_CLIENTS_PETARAN, MOCK_FORECASTS_PETARAN, MOCK_GAP_CLOSURES, MOCK_TRAININGS, SEGMENTS } from '@/lib/mock-data';
import type { ForecastRow, GapClosureRow, Client1C, ClientCategorySummary, GapActions } from '@/lib/types';
import {
  ArrowLeft, Save, Search, Target, DollarSign, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, Trash2, Plus, Check, Phone, Calendar,
  AlertTriangle, Clock, Lock, Users, UserPlus, RefreshCw, Eye, GraduationCap,
} from 'lucide-react';

interface PlanningFormProps {
  segmentCode: string;
  onBack: () => void;
  readOnly?: boolean;
}

// Етапи доступні і в "Прогноз по активних", і в "Закриття розриву".
// Опція "Навчання" розкриває селектор обучень з 1С (плюс поле коментаря).
const STAGE_OPTIONS = [
  { value: 'Дзвінок', icon: Phone },
  { value: 'Зустріч', icon: Calendar },
  { value: 'Навчання', icon: GraduationCap },
];

export function PlanningForm({ segmentCode, onBack, readOnly = false }: PlanningFormProps) {
  const segment = SEGMENTS.find(s => s.code === segmentCode);
  const plan = MOCK_SALES_PLAN.plans.find(p => p.segmentCode === segmentCode);
  const fact = MOCK_SALES_FACT.facts.find(f => f.segmentCode === segmentCode);
  const { currentPeriod } = useAppStore();

  const [forecasts, setForecasts] = useState<ForecastRow[]>(
    segmentCode === 'PETARAN' ? MOCK_FORECASTS_PETARAN : []
  );
  const [gapClosures, setGapClosures] = useState<GapClosureRow[]>(
    segmentCode === 'PETARAN' ? MOCK_GAP_CLOSURES : []
  );
  const [gapActions, setGapActions] = useState<GapActions>({ action1: '', action2: '', action3: '' });
  const [searchOpen, setSearchOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // FEATURE: завантаження збережених даних з Supabase
  useEffect(() => {
    // TODO: отримати реальний userId з useAppStore(s => s.user) замість hardcoded 1
    const userId = 1;
    loadPlanning(userId, segmentCode, currentPeriod.id).then(data => {
      if (!data) return; // fallback на mock дані
      if (data.forecasts.length > 0) {
        setForecasts(data.forecasts.map(f => ({
          clientId1c: f.client_id_1c,
          clientName: f.client_name,
          forecastAmount: f.forecast_amount,
          stage: (f.stage || '') as ForecastRow['stage'],
          stageComment: f.stage_comment || '',
          stageDone: false,
          factAmount: 0,
          lastPurchaseDate: null,
          lastPurchaseAmount: 0,
          completed: f.completed,
          manuallyAdded: f.manually_added,
        })));
      }
      if (data.gapClosures.length > 0) {
        setGapClosures(data.gapClosures.map(g => {
          const unpacked = unpackGapAction(g.action);
          return {
            clientId1c: g.client_id_1c,
            clientName: g.client_name,
            category: g.category || '',
            potentialAmount: g.potential_amount,
            stage: unpacked.stage,
            stageComment: unpacked.stageComment,
            stageDone: unpacked.stageDone,
            completed: unpacked.completed,
            trainingId: unpacked.trainingId,
            trainingName: unpacked.trainingName,
            trainingDate: unpacked.trainingDate,
            deadline: g.deadline || '',
            factAmount: 0,
            lastPurchaseDate: null,
            lastPurchaseAmount: 0,
            manuallyAdded: g.manually_added,
          };
        }));
      }
      if (data.summary) {
        setGapActions({
          action1: data.summary.gap_action_1 || '',
          action2: data.summary.gap_action_2 || '',
          action3: data.summary.gap_action_3 || '',
        });
      }
    });
  }, [segmentCode, currentPeriod.id]);

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    const result = await savePlanning({
      userId: 1, // TODO: реальний userId з авторизації
      segmentCode,
      periodId: currentPeriod.id,
      forecasts,
      gapClosures,
      monthForecastPct: '',
      monthForecastUsd: '',
      gapActions,
    });
    setSaving(false);
    setSaveResult(result.success
      ? { ok: true, msg: 'Збережено!' }
      : { ok: false, msg: result.error || 'Помилка збереження' }
    );
    setTimeout(() => setSaveResult(null), 3000);
  };

  const planAmount = plan?.planAmount ?? 0;
  const factAmount = fact?.totalAmount ?? 0;

  // Розрахунок очікуваного по наростаючому періоду
  const daysInPeriod = getDaysInPeriod(currentPeriod.weekEnd);
  const periodMonth = new Date(currentPeriod.month);
  const daysInMonth = new Date(periodMonth.getFullYear(), periodMonth.getMonth() + 1, 0).getDate();
  const periodLabel = getMonthName(periodMonth.getFullYear(), periodMonth.getMonth());
  const expectedAmount = (planAmount / daysInMonth) * daysInPeriod;
  const expectedPct = (expectedAmount / planAmount) * 100;
  const factPct = planAmount > 0 ? (factAmount / planAmount) * 100 : 0;
  const deviation = factPct - expectedPct;

  // Сортовані прогнози: невиконані зверху, виконані знизу
  const sortedForecasts = useMemo(() => {
    return [...forecasts].sort((a, b) => {
      if (a.completed === b.completed) return 0;
      return a.completed ? 1 : -1;
    });
  }, [forecasts]);

  const forecastTotal = forecasts.reduce((s, f) => s + f.forecastAmount, 0);
  const forecastFactTotal = forecasts.reduce((s, f) => s + f.factAmount, 0);
  const pendingForecastTotal = forecasts.filter(f => !f.completed).reduce((s, f) => s + f.forecastAmount, 0);

  const gapTotal = gapClosures.reduce((s, g) => s + g.potentialAmount, 0);
  const gapFactTotal = gapClosures.reduce((s, g) => s + g.factAmount, 0);

  // Розрив = очікуване на період − факт
  const gapFromExpected = Math.max(0, expectedAmount - factAmount);
  // Розрив після прогнозу = розрив − прогноз незавершених − факт закриття розриву
  const gapAfterForecast = Math.max(0, gapFromExpected - pendingForecastTotal - gapFactTotal);

  // Категорії клієнтів (з 1С)
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

  const CAT_ICONS: Record<string, React.ReactNode> = {
    active: <Users className="h-4 w-4 text-[#066aab]" />,
    new: <UserPlus className="h-4 w-4 text-emerald-600" />,
    sleeping_lost: <RefreshCw className="h-4 w-4 text-amber-600" />,
  };

  const updateForecast = (clientId: string, field: keyof ForecastRow, value: string | number | boolean | null | undefined) => {
    setForecasts(prev => prev.map(f => {
      if (f.clientId1c !== clientId) return f;
      const updated = { ...f, [field]: value };
      // Автовиконання: факт >= прогноз
      if (field === 'factAmount' && typeof value === 'number') {
        updated.completed = value >= updated.forecastAmount;
      }
      return updated;
    }));
  };

  const updateGap = (i: number, field: keyof GapClosureRow, value: string | number | boolean | null | undefined) => {
    setGapClosures(prev => { const n = [...prev]; n[i] = { ...n[i], [field]: value }; return n; });
  };

  const removeForecast = (clientId: string) => {
    setForecasts(prev => prev.filter(f => f.clientId1c !== clientId));
  };

  const addClient = (client: Client1C) => {
    setForecasts(prev => [...prev, {
      clientId1c: client.clientId, clientName: client.clientName,
      forecastAmount: client.lastPurchaseAmount || 0,
      stage: '', stageComment: '', stageDone: false,
      factAmount: 0, lastPurchaseDate: client.lastPurchaseDate,
      lastPurchaseAmount: client.lastPurchaseAmount,
      completed: false, manuallyAdded: true,
    }]);
  };

  const existingIds = forecasts.map(f => f.clientId1c);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Дашборд
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-[15px] font-bold">{segment?.name}</span>
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#e8f4fc] text-[#066aab]">{periodLabel}</span>
        {readOnly && (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 flex items-center gap-1">
            <Eye className="h-3 w-3" /> Перегляд
          </span>
        )}
      </div>

      {/* Метрики */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'План місяця', value: formatUSD(planAmount), icon: <Target className="h-4.5 w-4.5" />, grad: 'from-[#066aab] to-[#0880cc]', isAmount: true },
          { label: `Очікуване (${daysInPeriod}д)`, value: formatUSD(Math.round(expectedAmount)), icon: <Clock className="h-4.5 w-4.5" />, grad: 'from-[#066aab] to-[#0880cc]', isAmount: true },
          { label: 'Факт', value: formatUSD(factAmount), icon: <DollarSign className="h-4.5 w-4.5" />, grad: 'from-emerald-500 to-teal-600', badge: { text: `${factPct.toFixed(1)}%`, ok: factPct >= expectedPct }, isAmount: true },
          { label: 'Відхилення', value: `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%`, icon: deviation >= 0 ? <TrendingUp className="h-4.5 w-4.5" /> : <TrendingDown className="h-4.5 w-4.5" />, grad: deviation >= 0 ? 'from-emerald-500 to-teal-600' : 'from-rose-500 to-red-600', isAmount: false },
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
            <p className={`text-xl font-extrabold tracking-tight ${m.isAmount ? 'amount' : ''}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* === ДАНІ ПО КЛІЄНТАХ ПО ТМ === */}
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e2e7ef]">
          <h3 className="text-[14px] font-bold">Дані по клієнтах по ТМ</h3>
        </div>
        <div className="divide-y divide-[#f0f2f8]">
          {categories.map(cat => (
            <div key={cat.category} className="grid grid-cols-[32px_1fr_80px_100px_80px] gap-3 items-center px-5 py-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f4f7fb]">{CAT_ICONS[cat.category]}</div>
              <p className="text-[13px] font-medium">{cat.label}</p>
              <div className="text-right"><p className="text-[10px] text-muted-foreground">Кількість</p><p className="text-[14px] font-bold">{cat.clientCount}</p></div>
              <div className="text-right"><p className="text-[10px] text-muted-foreground">Очікувана сума</p><p className="text-[14px] font-bold font-mono amount">{formatUSD(cat.expectedAmount)}</p></div>
              <div className="text-right"><p className="text-[10px] text-muted-foreground">Закрив. %</p><p className="text-[14px] font-bold text-[#066aab]">{cat.planCoveragePercent.toFixed(1)}%</p></div>
            </div>
          ))}
          <div className="grid grid-cols-[32px_1fr_80px_100px_80px] gap-3 items-center px-5 py-3 bg-[#f4f7fb]">
            <div />
            <p className="text-[13px] font-bold">Всього</p>
            <p className="text-[14px] font-bold text-right">{totalCatClients}</p>
            <p className="text-[14px] font-bold font-mono text-right amount">{formatUSD(totalCatAmount)}</p>
            <p className="text-[14px] font-bold text-[#066aab] text-right">{totalCatPct.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* === ПРОГНОЗ ПО АКТИВНИХ КЛІЄНТАХ === */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[15px] font-bold">Прогноз по активних клієнтах</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Клієнти які купували цей сегмент за останні 3 місяці</p>
          </div>
          {!readOnly && (
            <Button onClick={() => setSearchOpen(true)}
              className="gap-2 bg-gradient-to-r from-[#066aab] to-[#0880cc] hover:from-[#055a91] hover:to-[#0775bb] text-white shadow-lg shadow-[#066aab]/15 rounded-xl h-9 px-4 text-[13px]">
              <Search className="h-3.5 w-3.5" /> Додати клієнта
            </Button>
          )}
        </div>

        {/* Заголовок колонок */}
        <div className="grid grid-cols-[36px_1fr_80px_120px_90px_1fr_70px_32px] gap-2 px-5 mb-1">
          <div />
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Клієнт</p>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Прогноз</p>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Етап</p>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Статус</p>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Коментар</p>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Факт</p>
          <div />
        </div>

        <div className="space-y-2">
          {sortedForecasts.map((row) => {
            const StageIcon = row.stage === 'Зустріч' ? Calendar : row.stage === 'Навчання' ? GraduationCap : Phone;
            return (
              <div key={row.clientId1c} className={`bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-200 ${row.completed ? 'ring-1 ring-emerald-200 opacity-60' : ''}`}>
                <div className="grid grid-cols-[36px_1fr_80px_120px_90px_1fr_70px_32px] gap-2 items-center px-5 py-3">
                  {/* Іконка статусу */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${row.completed ? 'bg-emerald-100' : 'bg-[#f4f7fb]'}`}>
                    {row.completed ? <Check className="h-4 w-4 text-emerald-600" /> : <DollarSign className="h-4 w-4 text-muted-foreground" />}
                  </div>

                  {/* Клієнт */}
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate">{row.clientName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      Ост: {row.lastPurchaseDate ? formatDate(row.lastPurchaseDate) : '—'} · <span className="amount">{formatUSD(row.lastPurchaseAmount)}</span>
                    </p>
                  </div>

                  {/* Прогноз */}
                  {row.completed ? (
                    <div className="flex items-center justify-end gap-1">
                      <Lock className="h-3 w-3 text-muted-foreground/40" />
                      <span className="text-[14px] font-bold text-muted-foreground amount">{formatUSD(row.forecastAmount)}</span>
                    </div>
                  ) : (
                    <Input type="number" value={row.forecastAmount}
                      onChange={(e) => updateForecast(row.clientId1c, 'forecastAmount', parseFloat(e.target.value) || 0)}
                      disabled={readOnly}
                      className="h-8 w-full text-right text-[14px] font-bold border-[#e8ebf4] bg-[#fafbfe] rounded-lg" />
                  )}

                  {/* Етап */}
                  <Select value={row.stage || undefined} onValueChange={(v) => { if (v) updateForecast(row.clientId1c, 'stage', v); }} disabled={readOnly}>
                    <SelectTrigger className="h-8 w-full text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe]" disabled={readOnly}>
                      <SelectValue placeholder="Оберіть..." />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Статус */}
                  {row.stage ? (
                    <div className={`flex items-center justify-center gap-1 h-8 rounded-lg text-[11px] font-semibold ${
                      row.stageDone ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      <StageIcon className="h-3 w-3" />
                      {row.stageDone ? 'Виконано' : 'Очікується'}
                    </div>
                  ) : (
                    <div className="h-8 flex items-center justify-center text-[11px] text-muted-foreground/40">—</div>
                  )}

                  {/* Коментар або Навчання + коментар */}
                  {row.stage === 'Навчання' ? (
                    <div className="flex flex-col gap-1">
                      <Select
                        value={row.trainingId || undefined}
                        onValueChange={(trainingId) => {
                          const t = MOCK_TRAININGS.find(x => x.trainingId === trainingId);
                          updateForecast(row.clientId1c, 'trainingId', trainingId);
                          if (t) {
                            updateForecast(row.clientId1c, 'trainingName', t.trainingName);
                            updateForecast(row.clientId1c, 'trainingDate', t.date);
                          }
                        }}
                        disabled={readOnly}
                      >
                        <SelectTrigger className="h-8 w-full text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe]" disabled={readOnly}>
                          <SelectValue placeholder="Обрати навчання з 1С..." />
                        </SelectTrigger>
                        <SelectContent>
                          {MOCK_TRAININGS.map(t => (
                            <SelectItem key={t.trainingId} value={t.trainingId}>
                              <span className="text-[12px]">
                                {formatDate(t.date)} — {t.trainingName.length > 50 ? t.trainingName.slice(0, 50) + '…' : t.trainingName}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input value={row.stageComment} onChange={(e) => updateForecast(row.clientId1c, 'stageComment', e.target.value)}
                        disabled={readOnly}
                        className="h-7 text-[11px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg" placeholder="Коментар (необов'язково)..." />
                    </div>
                  ) : (
                    <Input value={row.stageComment} onChange={(e) => updateForecast(row.clientId1c, 'stageComment', e.target.value)}
                      disabled={readOnly}
                      className="h-8 text-[12px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg" placeholder="Ціль..." />
                  )}

                  {/* Факт */}
                  <p className={`text-[14px] font-bold text-right ${row.factAmount > 0 ? 'text-emerald-600' : 'text-muted-foreground/30'}`}>
                    {row.factAmount > 0 ? <span className="amount">{formatUSD(row.factAmount)}</span> : '—'}
                  </p>

                  {/* Видалити */}
                  {!readOnly && !row.completed ? (
                    <button onClick={() => removeForecast(row.clientId1c)} aria-label="Видалити клієнта"
                      className="p-1.5 rounded-lg hover:bg-rose-50 text-muted-foreground/20 hover:text-rose-500 transition-colors cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : <div />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Підсумок прогнозу */}
        {forecasts.length > 0 && (
          <div className="mt-3 bg-[#f4f7fb] rounded-2xl p-4 flex items-center gap-6 flex-wrap">
            <div><span className="text-[11px] text-muted-foreground">Прогноз</span><p className="text-lg font-extrabold amount">{formatUSD(forecastTotal)}</p></div>
            <div className="w-px h-8 bg-[#e2e7ef]" />
            <div><span className="text-[11px] text-muted-foreground">Факт</span><p className="text-lg font-extrabold text-emerald-600 amount">{formatUSD(forecastFactTotal)}</p></div>
            <div className="w-px h-8 bg-[#e2e7ef]" />
            <div><span className="text-[11px] text-muted-foreground">Незавершено</span><p className="text-lg font-extrabold amount">{formatUSD(pendingForecastTotal)}</p></div>
            <div className="w-px h-8 bg-[#e2e7ef]" />
            <div><span className="text-[11px] text-muted-foreground">Клієнтів</span><p className="text-lg font-extrabold">{forecasts.length} <span className="text-emerald-600 text-sm">({forecasts.filter(f => f.completed).length} ✓)</span></p></div>
          </div>
        )}
      </div>

      {/* === ЗАКРИТТЯ РОЗРИВУ === */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-[15px] font-bold">Закриття розриву</h3>
              {gapAfterForecast > 0 ? (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-600">
                  <AlertTriangle className="h-3 w-3" /> <span className="amount">{formatUSD(Math.round(gapAfterForecast))}</span>
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600">Покрито</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Очікуване <span className="amount">{formatUSD(Math.round(expectedAmount))}</span> − факт <span className="amount">{formatUSD(factAmount)}</span> − прогноз <span className="amount">{formatUSD(pendingForecastTotal)}</span> = розрив <span className="amount">{formatUSD(Math.round(gapAfterForecast))}</span>
            </p>
          </div>
          {!readOnly && (
            <Button onClick={() => setGapClosures(prev => [...prev, { clientId1c: '', clientName: '', category: '', potentialAmount: 0, stage: '', stageComment: '', stageDone: false, completed: false, deadline: '', factAmount: 0, lastPurchaseDate: null, lastPurchaseAmount: 0, manuallyAdded: true }])}
              variant="outline" className="gap-1.5 text-[12px] h-8 rounded-xl border-[#c5e3f6] text-[#066aab] hover:bg-[#e8f4fc]">
              <Plus className="h-3.5 w-3.5" /> Додати
            </Button>
          )}
        </div>

        {gapClosures.length > 0 && (
          <div>
            {/* Заголовки колонок — уніфіковано з блоком "Прогноз по активних" */}
            <div className="grid grid-cols-[36px_1fr_80px_120px_90px_1fr_70px_32px] gap-2 px-5 mb-1">
              <div />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Клієнт</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Потенціал</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Етап</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Статус</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Дія / Навчання</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Факт</p>
              <div />
            </div>

            <div className="space-y-2">
            {gapClosures.map((row, i) => {
              const hasFact = row.factAmount > 0;
              const StageIcon = row.stage === 'Зустріч' ? Calendar : row.stage === 'Навчання' ? GraduationCap : Phone;
              return (
                <div key={i} className={`bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] overflow-hidden ${row.completed ? 'ring-1 ring-emerald-200 opacity-60' : hasFact ? 'ring-1 ring-emerald-200' : ''}`}>
                  <div className="grid grid-cols-[36px_1fr_80px_120px_90px_1fr_70px_32px] gap-2 items-center px-5 py-3">
                    {/* Іконка */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${row.completed || hasFact ? 'bg-emerald-100' : 'bg-amber-50'}`}>
                      {row.completed || hasFact ? <Check className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                    </div>

                    {/* Клієнт */}
                    <div className="min-w-0">
                      {row.manuallyAdded ? (
                        <Input value={row.clientName} onChange={(e) => updateGap(i, 'clientName', e.target.value)}
                          disabled={readOnly}
                          className="h-7 text-[13px] font-semibold border-0 shadow-none p-0 bg-transparent focus-visible:ring-0" placeholder="Ім'я клієнта..." />
                      ) : (
                        <p className="text-[13px] font-semibold truncate">{row.clientName}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        {row.category && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">{row.category}</span>}
                        <span className="text-[10px] text-muted-foreground truncate">
                          {row.lastPurchaseDate ? <>{formatDate(row.lastPurchaseDate)} · <span className="amount">{formatUSD(row.lastPurchaseAmount)}</span></> : ''}
                        </span>
                      </div>
                    </div>

                    {/* Потенціал */}
                    {row.completed ? (
                      <div className="flex items-center justify-end gap-1">
                        <Lock className="h-3 w-3 text-muted-foreground/40" />
                        <span className="text-[14px] font-bold text-muted-foreground amount">{formatUSD(row.potentialAmount)}</span>
                      </div>
                    ) : (
                      <Input type="number" value={row.potentialAmount} onChange={(e) => updateGap(i, 'potentialAmount', parseFloat(e.target.value) || 0)}
                        disabled={readOnly}
                        className="h-8 w-full text-right text-[14px] font-bold border-[#e8ebf4] bg-[#fafbfe] rounded-lg" />
                    )}

                    {/* Етап */}
                    <Select value={row.stage || undefined} onValueChange={(v) => { if (v) updateGap(i, 'stage', v); }} disabled={readOnly}>
                      <SelectTrigger className="h-8 w-full text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe]" disabled={readOnly}>
                        <SelectValue placeholder="Оберіть..." />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGE_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Статус */}
                    {row.stage ? (
                      <div className={`flex items-center justify-center gap-1 h-8 rounded-lg text-[11px] font-semibold ${
                        row.stageDone ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        <StageIcon className="h-3 w-3" />
                        {row.stageDone ? 'Виконано' : 'Очікується'}
                      </div>
                    ) : (
                      <div className="h-8 flex items-center justify-center text-[11px] text-muted-foreground/40">—</div>
                    )}

                    {/* Дія / Навчання — Навчання показує селектор + комментар, інакше тільки коментар */}
                    {row.stage === 'Навчання' ? (
                      <div className="flex flex-col gap-1">
                        <Select
                          value={row.trainingId || undefined}
                          onValueChange={(trainingId) => {
                            const t = MOCK_TRAININGS.find(x => x.trainingId === trainingId);
                            updateGap(i, 'trainingId', trainingId);
                            if (t) {
                              updateGap(i, 'trainingName', t.trainingName);
                              updateGap(i, 'trainingDate', t.date);
                              updateGap(i, 'deadline', t.date);
                            }
                          }}
                          disabled={readOnly}
                        >
                          <SelectTrigger className="h-8 w-full text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe]" disabled={readOnly}>
                            <SelectValue placeholder="Обрати навчання з 1С..." />
                          </SelectTrigger>
                          <SelectContent>
                            {MOCK_TRAININGS.map(t => (
                              <SelectItem key={t.trainingId} value={t.trainingId}>
                                <span className="text-[12px]">
                                  {formatDate(t.date)} — {t.trainingName.length > 50 ? t.trainingName.slice(0, 50) + '…' : t.trainingName}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input value={row.stageComment} onChange={(e) => updateGap(i, 'stageComment', e.target.value)}
                          disabled={readOnly}
                          className="h-7 text-[11px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg" placeholder="Коментар (необов'язково)..." />
                      </div>
                    ) : (
                      <Input value={row.stageComment} onChange={(e) => updateGap(i, 'stageComment', e.target.value)}
                        disabled={readOnly}
                        className="h-8 text-[12px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg" placeholder="Коментар (необов'язково)..." />
                    )}

                    {/* Факт */}
                    <p className={`text-[14px] font-bold text-right ${hasFact ? 'text-emerald-600' : 'text-muted-foreground/30'}`}>
                      {hasFact ? <span className="amount">{formatUSD(row.factAmount)}</span> : '—'}
                    </p>

                    {/* Видалити */}
                    {!readOnly ? (
                      <button onClick={() => setGapClosures(prev => prev.filter((_, j) => j !== i))} aria-label="Видалити клієнта"
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-muted-foreground/20 hover:text-rose-500 transition-colors cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : <div />}
                  </div>
                </div>
              );
            })}
            </div>

            <div className="mt-3 bg-amber-50/50 rounded-2xl border border-amber-200/30 p-4 flex items-center gap-6 flex-wrap">
              <div><span className="text-[11px] text-muted-foreground">Потенціал</span><p className="text-lg font-extrabold amount">{formatUSD(gapTotal)}</p></div>
              <div className="w-px h-8 bg-amber-200/40" />
              <div><span className="text-[11px] text-muted-foreground">Факт</span><p className="text-lg font-extrabold text-emerald-600 amount">{formatUSD(gapFactTotal)}</p></div>
              <div className="w-px h-8 bg-amber-200/40" />
              <div><span className="text-[11px] text-muted-foreground">Клієнтів</span><p className="text-lg font-extrabold">{gapClosures.length}</p></div>
            </div>
          </div>
        )}
      </div>

      {/* Дії для закриття */}
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e2e7ef]">
          <h3 className="text-[14px] font-bold">Дії для закриття розриву</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          {(['action1', 'action2', 'action3'] as const).map((key, i) => (
            <div key={key} className="flex items-center gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#f4f7fb] text-[12px] font-bold text-muted-foreground shrink-0">{i + 1}</span>
              <Input value={gapActions[key]} onChange={(e) => setGapActions(prev => ({ ...prev, [key]: e.target.value }))}
                disabled={readOnly}
                className="h-9 text-[13px] rounded-xl border-[#e8ebf4] bg-[#fafbfe]" placeholder={`Дія ${i + 1}...`} />
            </div>
          ))}
        </div>
      </div>

      {/* Зберегти */}
      <div className="flex items-center justify-end gap-3 pb-8">
        {saveResult && (
          <span className={`text-[13px] font-medium px-3 py-1.5 rounded-lg ${
            saveResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}>
            {saveResult.msg}
          </span>
        )}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2 bg-gradient-to-r from-[#066aab] to-[#0880cc] hover:from-[#055a91] hover:to-[#0775bb] text-white shadow-lg shadow-[#066aab]/15 rounded-xl h-11 px-6 text-[14px] font-semibold disabled:opacity-50"
        >
          {saving ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Зберігаю...
            </>
          ) : (
            <><Save className="h-4 w-4" /> Зберегти</>
          )}
        </Button>
      </div>

      <ClientSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={addClient} excludeIds={existingIds} segmentCode={segmentCode} />
    </div>
  );
}
