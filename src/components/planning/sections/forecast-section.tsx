import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, DollarSign, Phone, Calendar, MessageCircle, GraduationCap, Trash2, Check, Lock, AlertCircle } from 'lucide-react';
import { formatUSD, formatDate } from '@/lib/format';
import { isPassiveAmount } from '@/lib/passive-rows';
import { categoryLabel } from '@/lib/unplanned-buyers';
import type { ForecastRow, Client1C } from '@/lib/types';
import { STAGE_OPTIONS } from '../planning-helpers';
import { TrainingSelect } from '../controls/training-select';

type TrainingOption = { trainingId: string; date: string; trainingName: string; trainingType?: string };
type UnplannedItem = { clientId: string; clientName: string; factAmount: number; category: Client1C['category'] };

/**
 * Секція «Прогноз по активних клієнтах» — таблиця forecast-row-ів з:
 *  - bulk select + bulk delete bar (fixed bottom)
 *  - desktop grid 9-col / mobile vertical stack
 *  - inline edit полів (прогноз / етап / коментар / навчання)
 *  - read-only картки для completed (admin може edit)
 *  - блок «Незаплановані покупці» унизу (UnplannedRow)
 *  - підсумок (Прогноз / Факт / Незавершено / Клієнтів)
 *
 * Виокремлено з planning-form.tsx (Day 8 рефактору).
 */
export function ForecastSection({
  sortedForecasts,
  forecasts,
  forecastTotal,
  forecastFactTotal,
  pendingForecastTotal,
  activeForecastCount,
  unplannedForecast,
  selectedForecasts,
  setSelectedForecasts,
  toggleForecast,
  bulkDeleteForecasts,
  updateForecast,
  removeForecast,
  setSearchOpen,
  trainings,
  lockEdit,
  lockStage,
  readOnly,
  isAdmin,
  clientsLoading,
}: {
  sortedForecasts: ForecastRow[];
  forecasts: ForecastRow[];
  forecastTotal: number;
  forecastFactTotal: number;
  pendingForecastTotal: number;
  activeForecastCount: number;
  unplannedForecast: UnplannedItem[];
  selectedForecasts: Set<string>;
  setSelectedForecasts: (s: Set<string>) => void;
  toggleForecast: (clientId: string) => void;
  bulkDeleteForecasts: () => void;
  updateForecast: (clientId: string, field: keyof ForecastRow, value: string | number | boolean | null | undefined) => void;
  removeForecast: (clientId: string) => void;
  setSearchOpen: (v: boolean) => void;
  trainings: TrainingOption[];
  lockEdit: boolean;
  lockStage: boolean;
  readOnly: boolean;
  isAdmin: boolean;
  clientsLoading: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-bold">Прогноз по активних клієнтах</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Клієнти які купували цей сегмент за останні 3 місяці</p>
        </div>
        {!lockEdit && (
          <Button onClick={() => setSearchOpen(true)}
            className="gap-2 bg-gradient-to-r from-emet-blue to-emet-blue-light hover:from-emet-blue-dark hover:to-[#0775bb] text-white shadow-lg shadow-emet-blue/15 rounded-xl h-9 px-4 text-[13px]">
            <Search className="h-3.5 w-3.5" /> Додати клієнта
          </Button>
        )}
      </div>

      {/* Bulk action bar — fixed щоб не треба було скролити нагору. */}
      {!lockEdit && selectedForecasts.size > 0 && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[80px] z-30 max-w-3xl w-[calc(100%-32px)] flex items-center justify-between px-5 py-2.5 rounded-xl bg-rose-50/85 backdrop-blur-xl border-2 border-rose-300/80 shadow-[0_10px_40px_rgba(159,18,57,0.18)]">
          <span className="text-[13px] font-semibold text-rose-700">Обрано: {selectedForecasts.size}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedForecasts(new Set())}
              className="text-[12px] font-semibold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-white/60 transition-colors">
              Скасувати
            </button>
            <button onClick={bulkDeleteForecasts}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-rose-600 hover:bg-rose-700 px-4 py-1.5 rounded-lg transition-colors">
              <Trash2 className="h-3.5 w-3.5" /> Видалити обраних
            </button>
          </div>
        </div>
      )}

      {/* Заголовок колонок (md+ only) */}
      <div className="hidden md:grid md:grid-cols-[24px_36px_minmax(160px,1fr)_80px_120px_90px_minmax(140px,1fr)_70px_32px] gap-2 px-5 mb-1">
        {!lockEdit && sortedForecasts.length > 0 ? (
          <input
            type="checkbox"
            aria-label="Обрати всіх"
            className="h-4 w-4 cursor-pointer accent-rose-600"
            checked={selectedForecasts.size === sortedForecasts.filter(r => !r.completed).length && sortedForecasts.filter(r => !r.completed).length > 0}
            onChange={(e) => {
              if (e.target.checked) setSelectedForecasts(new Set(sortedForecasts.filter(r => !r.completed).map(r => r.clientId1c)));
              else setSelectedForecasts(new Set());
            }}
          />
        ) : <div />}
        <div />
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Клієнт</p>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Прогноз</p>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Етап</p>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Статус</p>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Коментар</p>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Факт</p>
        <div />
      </div>

      {clientsLoading && sortedForecasts.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground glass-card border border-[#e8ebf4]/50">
          <svg className="h-5 w-5 animate-spin text-emet-blue" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-[12px] font-medium">Завантажуємо клієнтів…</p>
        </div>
      )}

      <div className="space-y-2">
        {unplannedForecast.length > 0 && sortedForecasts.length > 0 && (
          <div className="px-5 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Запланованих: {sortedForecasts.length}
          </div>
        )}
        {sortedForecasts.map((row) => {
          const StageIcon = row.stage === 'Зустріч' ? Calendar : row.stage === 'Навчання' ? GraduationCap : row.stage === 'Мессенджер' ? MessageCircle : Phone;
          return (
            <div key={row.clientId1c} className={`glass-card overflow-hidden transition-all duration-200 ${(row.completed && !isAdmin) ? 'ring-1 ring-emerald-200 opacity-60' : ''}`}>
              {/* === DESKTOP === */}
              <div className="hidden md:grid md:grid-cols-[24px_36px_minmax(160px,1fr)_80px_120px_90px_minmax(140px,1fr)_70px_32px] gap-2 items-center px-5 py-3">
                {!lockEdit && !(row.completed && !isAdmin) ? (
                  <input
                    type="checkbox"
                    aria-label={`Обрати ${row.clientName}`}
                    className="h-4 w-4 cursor-pointer accent-rose-600"
                    checked={selectedForecasts.has(row.clientId1c)}
                    onChange={() => toggleForecast(row.clientId1c)}
                  />
                ) : <div />}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${(row.completed && !isAdmin) ? 'bg-emerald-100' : 'bg-[#f4f7fb]'}`}>
                  {(row.completed && !isAdmin) ? <Check className="h-4 w-4 text-emerald-600" /> : <DollarSign className="h-4 w-4 text-muted-foreground" />}
                </div>

                <div className="min-w-0">
                  <p className="text-[13px] font-semibold truncate">
                    {row.clientName}
                    {isPassiveAmount(row.forecastAmount) && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-zinc-100 text-zinc-500 align-middle">без плану</span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    Ост: {row.lastPurchaseDate ? formatDate(row.lastPurchaseDate) : '—'} · <span className="amount">{formatUSD(row.lastPurchaseAmount)}</span>
                  </p>
                </div>

                {(row.completed && !isAdmin) ? (
                  <div className="flex items-center justify-end gap-1">
                    <Lock className="h-3 w-3 text-muted-foreground/40" />
                    <span className="text-[14px] font-bold text-muted-foreground amount">{formatUSD(row.forecastAmount)}</span>
                  </div>
                ) : (
                  <Input type="number" value={row.forecastAmount}
                    onChange={(e) => updateForecast(row.clientId1c, 'forecastAmount', parseFloat(e.target.value) || 0)}
                    disabled={lockEdit}
                    className="amount h-8 w-full text-right text-[14px] font-bold border-[#e8ebf4] bg-[#fafbfe] rounded-lg" />
                )}

                <Select
                  value={row.stage || undefined}
                  onValueChange={(v) => updateForecast(row.clientId1c, 'stage', v)}
                  disabled={lockStage}
                >
                  <SelectTrigger className="h-8 w-full text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe]" disabled={lockStage}>
                    <SelectValue placeholder="Обрати" />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {row.stage ? (
                  <div className={`flex items-center justify-center gap-1 h-8 rounded-lg text-[11px] font-semibold ${
                    row.stageDone ? 'bg-emerald-500/12 border border-emerald-300/40 text-emerald-700 backdrop-blur-sm' : 'bg-amber-500/12 border border-amber-300/40 text-amber-700 backdrop-blur-sm'
                  }`}>
                    <StageIcon className="h-3 w-3" />
                    {row.stageDone ? 'Виконано' : 'Очікується'}
                  </div>
                ) : (
                  <div className="h-8 flex items-center justify-center text-[11px] text-muted-foreground/40">—</div>
                )}

                {row.stage === 'Навчання' ? (
                  <div className="flex flex-col gap-1">
                    <TrainingSelect
                      value={row.trainingId}
                      trainings={trainings}
                      disabled={lockEdit}
                      maxNameLen={50}
                      size="desktop"
                      onSelect={(t) => {
                        updateForecast(row.clientId1c, 'trainingId', t?.trainingId ?? '');
                        if (t) {
                          updateForecast(row.clientId1c, 'trainingName', t.trainingName);
                          updateForecast(row.clientId1c, 'trainingDate', t.date);
                        }
                      }}
                    />
                    <Input value={row.stageComment} onChange={(e) => updateForecast(row.clientId1c, 'stageComment', e.target.value)}
                      disabled={readOnly}
                      className="h-7 text-[11px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg" placeholder="Коментар (необов'язково)..." />
                  </div>
                ) : (
                  <Input value={row.stageComment} onChange={(e) => updateForecast(row.clientId1c, 'stageComment', e.target.value)}
                    disabled={readOnly}
                    className="h-8 text-[12px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg" placeholder="Ціль..." />
                )}

                <p className={`text-[14px] font-bold text-right ${row.factAmount > 0 ? 'text-emerald-600' : 'text-muted-foreground/30'}`}>
                  {row.factAmount > 0 ? <span className="amount">{formatUSD(row.factAmount)}</span> : '—'}
                </p>

                {!lockEdit && !(row.completed && !isAdmin) ? (
                  <button onClick={() => removeForecast(row.clientId1c)} aria-label="Видалити клієнта"
                    className="p-2 rounded-lg hover:bg-rose-50 text-muted-foreground/20 hover:text-rose-500 transition-colors cursor-pointer">
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : <div />}
              </div>

              {/* === MOBILE === */}
              <div className="md:hidden p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {!lockEdit && !(row.completed && !isAdmin) && (
                    <input
                      type="checkbox"
                      aria-label={`Обрати ${row.clientName}`}
                      className="h-5 w-5 mt-2 cursor-pointer accent-rose-600 shrink-0"
                      checked={selectedForecasts.has(row.clientId1c)}
                      onChange={() => toggleForecast(row.clientId1c)}
                    />
                  )}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${(row.completed && !isAdmin) ? 'bg-emerald-100' : 'bg-[#f4f7fb]'}`}>
                    {(row.completed && !isAdmin) ? <Check className="h-4 w-4 text-emerald-600" /> : <DollarSign className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold leading-tight">
                      {row.clientName}
                      {isPassiveAmount(row.forecastAmount) && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-zinc-100 text-zinc-500 align-middle">без плану</span>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Ост: {row.lastPurchaseDate ? formatDate(row.lastPurchaseDate) : '—'} · <span className="amount">{formatUSD(row.lastPurchaseAmount)}</span>
                    </p>
                  </div>
                  {!lockEdit && !(row.completed && !isAdmin) && (
                    <button onClick={() => removeForecast(row.clientId1c)} aria-label="Видалити клієнта"
                      className="p-2.5 rounded-lg hover:bg-rose-50 text-muted-foreground/40 hover:text-rose-500 transition-colors shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Прогноз</label>
                    {(row.completed && !isAdmin) ? (
                      <p className="text-[14px] font-bold text-muted-foreground amount mt-1">{formatUSD(row.forecastAmount)}</p>
                    ) : (
                      <Input type="number" value={row.forecastAmount}
                        onChange={(e) => updateForecast(row.clientId1c, 'forecastAmount', parseFloat(e.target.value) || 0)}
                        disabled={lockEdit}
                        className="amount h-9 w-full text-[14px] font-bold border-[#e8ebf4] bg-[#fafbfe] rounded-lg mt-1" />
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Факт</label>
                    <p className={`text-[14px] font-bold mt-1.5 ${row.factAmount > 0 ? 'text-emerald-600' : 'text-muted-foreground/40'}`}>
                      {row.factAmount > 0 ? <span className="amount">{formatUSD(row.factAmount)}</span> : '—'}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Етап</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Select
                      value={row.stage || undefined}
                      onValueChange={(v) => updateForecast(row.clientId1c, 'stage', v)}
                      disabled={lockStage}
                    >
                      <SelectTrigger className="h-9 flex-1 text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe]" disabled={lockStage}>
                        <SelectValue placeholder="Обрати" />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGE_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {row.stage && (
                      <div className={`flex items-center justify-center gap-1 h-9 px-3 rounded-lg text-[11px] font-semibold whitespace-nowrap ${
                        row.stageDone ? 'bg-emerald-500/12 border border-emerald-300/40 text-emerald-700 backdrop-blur-sm' : 'bg-amber-500/12 border border-amber-300/40 text-amber-700 backdrop-blur-sm'
                      }`}>
                        <StageIcon className="h-3 w-3" />
                        {row.stageDone ? 'Викон.' : 'Очік.'}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Коментар</label>
                  {row.stage === 'Навчання' && (
                    <div className="mt-1">
                      <TrainingSelect
                        value={row.trainingId}
                        trainings={trainings}
                        disabled={lockEdit}
                        maxNameLen={40}
                        size="mobile"
                        onSelect={(t) => {
                          updateForecast(row.clientId1c, 'trainingId', t?.trainingId ?? '');
                          if (t) {
                            updateForecast(row.clientId1c, 'trainingName', t.trainingName);
                            updateForecast(row.clientId1c, 'trainingDate', t.date);
                          }
                        }}
                      />
                    </div>
                  )}
                  <Input value={row.stageComment} onChange={(e) => updateForecast(row.clientId1c, 'stageComment', e.target.value)}
                    disabled={readOnly}
                    className="h-9 text-[12px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg mt-1"
                    placeholder={row.stage === 'Навчання' ? "Коментар (необов'язково)..." : 'Ціль...'} />
                </div>
              </div>
            </div>
          );
        })}

        {/* Незаплановані покупці (категорія `active`) — read-only внизу. */}
        {unplannedForecast.length > 0 && (
          <>
            <div className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-700">
              Незапланованих: {unplannedForecast.length}
            </div>
            {unplannedForecast.map(b => (
              <UnplannedRow key={`fc-unp-${b.clientId}`}
                clientId={b.clientId} clientName={b.clientName}
                factAmount={b.factAmount} category={b.category} />
            ))}
          </>
        )}
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
          <div><span className="text-[11px] text-muted-foreground">Клієнтів</span><p className="text-lg font-extrabold">{activeForecastCount} <span className="text-emerald-600 text-sm">({forecasts.filter(f => f.completed && !isPassiveAmount(f.forecastAmount)).length} ✓)</span></p></div>
        </div>
      )}
    </div>
  );
}

/**
 * Read-only картка незапланованого покупця (без впливу на план).
 * Експортована — використовується теж у gap-closure section.
 */
export function UnplannedRow({
  clientId,
  clientName,
  factAmount,
  category,
}: {
  clientId: string;
  clientName: string;
  factAmount: number;
  category: Client1C['category'];
}) {
  return (
    <div key={`unplanned-${clientId}`}
         className="bg-white/60 rounded-2xl border border-dashed border-fuchsia-300/60 px-5 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-fuchsia-50 shrink-0">
        <AlertCircle className="h-4 w-4 text-fuchsia-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-semibold truncate">{clientName}</p>
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-fuchsia-50 text-fuchsia-700 font-bold whitespace-nowrap">
            не було в плані
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f4f7fb] text-muted-foreground font-semibold whitespace-nowrap">
            {categoryLabel(category)}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">Запланувати можна на наступний місяць</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[10px] text-muted-foreground">Факт</p>
        <p className="text-[14px] font-bold text-emerald-600 amount">{formatUSD(factAmount)}</p>
      </div>
    </div>
  );
}
