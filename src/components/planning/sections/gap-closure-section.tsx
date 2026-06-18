import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, AlertTriangle, Check, Phone, Calendar, MessageCircle, GraduationCap, Trash2, Lock } from 'lucide-react';
import { formatUSD, formatDate } from '@/lib/format';
import { isPassiveAmount } from '@/lib/passive-rows';
import type { GapClosureRow, Client1C } from '@/lib/types';
import { STAGE_OPTIONS, formatTrainingOption } from '../planning-helpers';
import { UnplannedRow } from './forecast-section';

type TrainingOption = { trainingId: string; date: string; trainingName: string; trainingType?: string };
type UnplannedItem = { clientId: string; clientName: string; factAmount: number; category: Client1C['category'] };

/**
 * Секція «Закриття розриву» — список потенційних дій для закриття розриву
 * між очікуваним обсягом і фактом. Симетрична до ForecastSection.
 *
 * Шапка містить:
 *  - tag з розривом (rose якщо є, emerald «Покрито» якщо ні)
 *  - формулу: Очікуване − факт − прогноз = розрив
 *
 * Виокремлено з planning-form.tsx (Day 8 рефактору).
 */
export function GapClosureSection({
  sortedGapClosures,
  gapClosures,
  gapTotal,
  gapFactTotal,
  gapAfterForecast,
  expectedAmount,
  factAmount,
  pendingForecastTotal,
  unplannedGap,
  selectedGaps,
  setSelectedGaps,
  toggleGap,
  bulkDeleteGaps,
  updateGap,
  removeGapClosure,
  setGapSearchOpen,
  trainings,
  lockEdit,
  lockStage,
  readOnly,
  isAdmin,
  clientsLoading,
}: {
  sortedGapClosures: { row: GapClosureRow; originalIndex: number }[];
  gapClosures: GapClosureRow[];
  gapTotal: number;
  gapFactTotal: number;
  gapAfterForecast: number;
  expectedAmount: number;
  factAmount: number;
  pendingForecastTotal: number;
  unplannedGap: UnplannedItem[];
  selectedGaps: Set<number>;
  setSelectedGaps: (s: Set<number>) => void;
  toggleGap: (i: number) => void;
  bulkDeleteGaps: () => void;
  updateGap: (i: number, field: keyof GapClosureRow, value: string | number | boolean | null | undefined) => void;
  removeGapClosure: (i: number) => void;
  setGapSearchOpen: (v: boolean) => void;
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
          <div className="flex items-center gap-3">
            <h3 className="text-[15px] font-bold">Закриття розриву</h3>
            {gapAfterForecast > 0 ? (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/12 border border-rose-300/40 text-rose-600 backdrop-blur-sm">
                <AlertTriangle className="h-3 w-3" /> <span className="amount">{formatUSD(Math.round(gapAfterForecast))}</span>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/12 border border-emerald-300/40 text-emerald-600 backdrop-blur-sm">Покрито</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Очікуване <span className="amount">{formatUSD(Math.round(expectedAmount))}</span> − факт <span className="amount">{formatUSD(factAmount)}</span> − прогноз <span className="amount">{formatUSD(pendingForecastTotal)}</span> = розрив <span className="amount">{formatUSD(Math.round(gapAfterForecast))}</span>
          </p>
        </div>
        {!lockEdit && (
          <Button onClick={() => setGapSearchOpen(true)}
            className="gap-2 bg-gradient-to-r from-emet-blue to-emet-blue-light hover:from-emet-blue-dark hover:to-[#0775bb] text-white shadow-lg shadow-emet-blue/15 rounded-xl h-9 px-4 text-[13px]">
            <Search className="h-3.5 w-3.5" /> Додати клієнта
          </Button>
        )}
      </div>

      {clientsLoading && gapClosures.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground glass-card border border-[#e8ebf4]/50">
          <svg className="h-5 w-5 animate-spin text-emet-blue" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-[12px] font-medium">Завантажуємо клієнтів…</p>
        </div>
      )}

      {/* Bulk action bar — fixed над save bar */}
      {!lockEdit && selectedGaps.size > 0 && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[80px] z-30 max-w-3xl w-[calc(100%-32px)] flex items-center justify-between px-5 py-2.5 rounded-xl bg-rose-50/85 backdrop-blur-xl border-2 border-rose-300/80 shadow-[0_10px_40px_rgba(159,18,57,0.18)]">
          <span className="text-[13px] font-semibold text-rose-700">Обрано: {selectedGaps.size}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedGaps(new Set())}
              className="text-[12px] font-semibold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-white/60 transition-colors">
              Скасувати
            </button>
            <button onClick={bulkDeleteGaps}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-rose-600 hover:bg-rose-700 px-4 py-1.5 rounded-lg transition-colors">
              <Trash2 className="h-3.5 w-3.5" /> Видалити обраних
            </button>
          </div>
        </div>
      )}

      {(gapClosures.length > 0 || unplannedGap.length > 0) && (
        <div>
          {/* Заголовки колонок (md+ only) */}
          {gapClosures.length > 0 && (
            <div className="hidden md:grid md:grid-cols-[24px_36px_minmax(160px,1fr)_80px_120px_90px_minmax(140px,1fr)_70px_32px] gap-2 px-5 mb-1">
              {!lockEdit ? (
                <input
                  type="checkbox"
                  aria-label="Обрати всіх"
                  className="h-4 w-4 cursor-pointer accent-rose-600"
                  checked={selectedGaps.size === gapClosures.filter(r => !r.completed).length && gapClosures.filter(r => !r.completed).length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const next = new Set<number>();
                      gapClosures.forEach((r, i) => { if (!r.completed) next.add(i); });
                      setSelectedGaps(next);
                    } else setSelectedGaps(new Set());
                  }}
                />
              ) : <div />}
              <div />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Клієнт</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Потенціал</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Етап</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Статус</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Дія / Навчання</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Факт</p>
              <div />
            </div>
          )}

          <div className="space-y-2">
            {sortedGapClosures.map(({ row, originalIndex: i }) => {
              const hasFact = row.factAmount > 0;
              const StageIcon = row.stage === 'Зустріч' ? Calendar : row.stage === 'Навчання' ? GraduationCap : row.stage === 'Мессенджер' ? MessageCircle : Phone;
              return (
                <div key={row.clientId1c || `idx-${i}`} className={`glass-card overflow-hidden ${(row.completed && !isAdmin) ? 'ring-1 ring-emerald-200 opacity-60' : hasFact ? 'ring-1 ring-emerald-200' : ''}`}>
                  {/* === DESKTOP === */}
                  <div className="hidden md:grid md:grid-cols-[24px_36px_minmax(160px,1fr)_80px_120px_90px_minmax(140px,1fr)_70px_32px] gap-2 items-center px-5 py-3">
                    {!lockEdit && !(row.completed && !isAdmin) ? (
                      <input
                        type="checkbox"
                        aria-label={`Обрати ${row.clientName}`}
                        className="h-4 w-4 cursor-pointer accent-rose-600"
                        checked={selectedGaps.has(i)}
                        onChange={() => toggleGap(i)}
                      />
                    ) : <div />}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${(row.completed && !isAdmin) || hasFact ? 'bg-emerald-100' : 'bg-amber-50'}`}>
                      {(row.completed && !isAdmin) || hasFact ? <Check className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                    </div>

                    <div className="min-w-0">
                      {row.manuallyAdded ? (
                        <Input value={row.clientName} onChange={(e) => updateGap(i, 'clientName', e.target.value)}
                          disabled={lockEdit}
                          className="h-7 text-[13px] font-semibold border-0 shadow-none p-0 bg-transparent focus-visible:ring-0" placeholder="Ім'я клієнта..." />
                      ) : (
                        <p className="text-[13px] font-semibold truncate">
                          {row.clientName}
                          {isPassiveAmount(row.potentialAmount) && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-zinc-100 text-zinc-500 align-middle">без плану</span>
                          )}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        {row.category && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/12 border border-amber-300/40 text-amber-700 backdrop-blur-sm font-semibold">{row.category}</span>}
                        <span className="text-[10px] text-muted-foreground truncate">
                          {row.lastPurchaseDate ? <>{formatDate(row.lastPurchaseDate)} · <span className="amount">{formatUSD(row.lastPurchaseAmount)}</span></> : ''}
                        </span>
                      </div>
                    </div>

                    {(row.completed && !isAdmin) ? (
                      <div className="flex items-center justify-end gap-1">
                        <Lock className="h-3 w-3 text-muted-foreground/40" />
                        <span className="text-[14px] font-bold text-muted-foreground amount">{formatUSD(row.potentialAmount)}</span>
                      </div>
                    ) : (
                      <Input type="number" value={row.potentialAmount} onChange={(e) => updateGap(i, 'potentialAmount', parseFloat(e.target.value) || 0)}
                        disabled={lockEdit}
                        className="amount h-8 w-full text-right text-[14px] font-bold border-[#e8ebf4] bg-[#fafbfe] rounded-lg" />
                    )}

                    <Select
                      value={row.stage || undefined}
                      onValueChange={(v) => updateGap(i, 'stage', v)}
                      disabled={lockStage}
                    >
                      <SelectTrigger className="h-8 w-full text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe]" disabled={lockStage}>
                        <SelectValue placeholder="Обрати" />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGE_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.value}</SelectItem>
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
                        <Select
                          value={row.trainingId || undefined}
                          onValueChange={(trainingId) => {
                            const t = trainings.find(x => x.trainingId === trainingId);
                            updateGap(i, 'trainingId', trainingId);
                            if (t) {
                              updateGap(i, 'trainingName', t.trainingName);
                              updateGap(i, 'trainingDate', t.date);
                              updateGap(i, 'deadline', t.date);
                            }
                          }}
                          disabled={lockEdit}
                        >
                          <SelectTrigger className="h-8 w-full text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe]" disabled={lockEdit}>
                            <SelectValue placeholder="Обрати навчання з 1С...">
                              {row.trainingId ? (row.trainingName || row.trainingId) : null}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            {trainings.map(t => (
                              <SelectItem key={t.trainingId} value={t.trainingId}>
                                <span className="text-[12px]">{formatTrainingOption(t, 50)}</span>
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

                    <p className={`text-[14px] font-bold text-right ${hasFact ? 'text-emerald-600' : 'text-muted-foreground/30'}`}>
                      {hasFact ? <span className="amount">{formatUSD(row.factAmount)}</span> : '—'}
                    </p>

                    {!lockEdit ? (
                      <button onClick={() => removeGapClosure(i)} aria-label="Видалити клієнта"
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
                          checked={selectedGaps.has(i)}
                          onChange={() => toggleGap(i)}
                        />
                      )}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${(row.completed && !isAdmin) || hasFact ? 'bg-emerald-100' : 'bg-amber-50'}`}>
                        {(row.completed && !isAdmin) || hasFact ? <Check className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        {row.manuallyAdded ? (
                          <Input value={row.clientName} onChange={(e) => updateGap(i, 'clientName', e.target.value)} disabled={lockEdit}
                            className="h-7 text-[13px] font-semibold border-0 shadow-none p-0 bg-transparent focus-visible:ring-0" placeholder="Ім'я клієнта..." />
                        ) : (
                          <p className="text-[13px] font-semibold leading-tight">
                            {row.clientName}
                            {isPassiveAmount(row.potentialAmount) && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-zinc-100 text-zinc-500 align-middle">без плану</span>
                            )}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          {row.category && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/12 border border-amber-300/40 text-amber-700 backdrop-blur-sm font-semibold">{row.category}</span>}
                          {row.lastPurchaseDate && (
                            <span className="text-[10px] text-muted-foreground">{formatDate(row.lastPurchaseDate)} · <span className="amount">{formatUSD(row.lastPurchaseAmount)}</span></span>
                          )}
                        </div>
                      </div>
                      {!lockEdit && !(row.completed && !isAdmin) && (
                        <button onClick={() => removeGapClosure(i)} aria-label="Видалити клієнта"
                          className="p-2.5 rounded-lg hover:bg-rose-50 text-muted-foreground/40 hover:text-rose-500 transition-colors shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Потенціал</label>
                        {(row.completed && !isAdmin) ? (
                          <p className="text-[14px] font-bold text-muted-foreground amount mt-1">{formatUSD(row.potentialAmount)}</p>
                        ) : (
                          <Input type="number" value={row.potentialAmount} onChange={(e) => updateGap(i, 'potentialAmount', parseFloat(e.target.value) || 0)} disabled={lockEdit}
                            className="amount h-9 w-full text-[14px] font-bold border-[#e8ebf4] bg-[#fafbfe] rounded-lg mt-1" />
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Факт</label>
                        <p className={`text-[14px] font-bold mt-1.5 ${hasFact ? 'text-emerald-600' : 'text-muted-foreground/40'}`}>
                          {hasFact ? <span className="amount">{formatUSD(row.factAmount)}</span> : '—'}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Етап</label>
                      <div className="flex items-center gap-2 mt-1">
                        <Select value={row.stage || undefined}
                          onValueChange={(v) => updateGap(i, 'stage', v)}
                          disabled={lockStage}>
                          <SelectTrigger className="h-9 flex-1 text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe]" disabled={lockStage}>
                            <SelectValue placeholder="Обрати" />
                          </SelectTrigger>
                          <SelectContent>
                            {STAGE_OPTIONS.map(opt => (<SelectItem key={opt.value} value={opt.value}>{opt.value}</SelectItem>))}
                          </SelectContent>
                        </Select>
                        {row.stage && (
                          <div className={`flex items-center justify-center gap-1 h-9 px-3 rounded-lg text-[11px] font-semibold whitespace-nowrap ${row.stageDone ? 'bg-emerald-500/12 border border-emerald-300/40 text-emerald-700 backdrop-blur-sm' : 'bg-amber-500/12 border border-amber-300/40 text-amber-700 backdrop-blur-sm'}`}>
                            <StageIcon className="h-3 w-3" />
                            {row.stageDone ? 'Викон.' : 'Очік.'}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Дія</label>
                      {row.stage === 'Навчання' && (
                        <Select value={row.trainingId || undefined}
                          onValueChange={(trainingId) => {
                            const t = trainings.find(x => x.trainingId === trainingId);
                            updateGap(i, 'trainingId', trainingId);
                            if (t) { updateGap(i, 'trainingName', t.trainingName); updateGap(i, 'trainingDate', t.date); }
                          }}
                          disabled={lockEdit}>
                          <SelectTrigger className="h-9 w-full text-[12px] rounded-lg border-[#e8ebf4] bg-[#fafbfe] mt-1" disabled={lockEdit}>
                            <SelectValue placeholder="Обрати навчання...">
                              {row.trainingId ? (row.trainingName || row.trainingId) : null}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            {trainings.map(t => (
                              <SelectItem key={t.trainingId} value={t.trainingId}>
                                <span className="text-[12px]">{formatTrainingOption(t, 40)}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Input value={row.stageComment} onChange={(e) => updateGap(i, 'stageComment', e.target.value)} disabled={readOnly}
                        className="h-9 text-[12px] border-[#e8ebf4] bg-[#fafbfe] rounded-lg mt-1"
                        placeholder={row.stage === 'Навчання' ? "Коментар (необов'язково)..." : 'Дія...'} />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Незаплановані з категорій Сплячий / Втрачений / Новий / БЗ —
                read-only внизу. Менеджер планує їх на наступний місяць. */}
            {unplannedGap.length > 0 && (
              <>
                <div className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-700">
                  Незапланованих: {unplannedGap.length}
                </div>
                {unplannedGap.map(b => (
                  <UnplannedRow key={`gap-unp-${b.clientId}`}
                    clientId={b.clientId} clientName={b.clientName}
                    factAmount={b.factAmount} category={b.category} />
                ))}
              </>
            )}
          </div>

          {gapClosures.length > 0 && (
            <div className="mt-3 bg-amber-50/50 rounded-2xl border border-amber-200/30 p-4 flex items-center gap-6 flex-wrap">
              <div><span className="text-[11px] text-muted-foreground">Потенціал</span><p className="text-lg font-extrabold amount">{formatUSD(gapTotal)}</p></div>
              <div className="w-px h-8 bg-amber-200/40" />
              <div><span className="text-[11px] text-muted-foreground">Факт</span><p className="text-lg font-extrabold text-emerald-600 amount">{formatUSD(gapFactTotal)}</p></div>
              <div className="w-px h-8 bg-amber-200/40" />
              <div><span className="text-[11px] text-muted-foreground">Клієнтів</span><p className="text-lg font-extrabold">{gapClosures.filter(g => !isPassiveAmount(g.potentialAmount)).length}</p></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
