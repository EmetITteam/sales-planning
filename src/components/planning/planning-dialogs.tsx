import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ClientSearchModal } from './client-search-modal';
import { MeetingForm, type MeetingFormData } from '@/components/meetings/meeting-form';
import { formatUSD } from '@/lib/format';
import type { ForecastRow, GapClosureRow, Client1C } from '@/lib/types';

/**
 * Тип `pendingDelete` зі стану форми. Експортується щоб parent міг типізувати state.
 * - 'forecast' / 'gap'  — одиничне видалення (по clientId / по index).
 * - '*-bulk'            — multi-select видалення з чекбоксів.
 */
export type PendingDelete =
  | { type: 'forecast'; clientId: string; clientName: string }
  | { type: 'gap'; index: number; clientName: string }
  | { type: 'forecast-bulk'; ids: string[] }
  | { type: 'gap-bulk'; indices: number[] }
  | null;

export type MeetingPrompt = { clientId: string; clientName: string } | null;
export type MeetingFormState = { clientId: string } | null;

/**
 * <PlanningDialogs> — група всіх модалок форми планування:
 *   1. Підтвердження фіналізації (з warning якщо plan < propPlanAmount)
 *   2. ClientSearchModal × 2 (Прогноз / Закриття розриву)
 *   3. Підтвердження видалення (single + bulk)
 *   4. Пропозиція запланувати зустріч (після вибору stage='Зустріч')
 *   5. MeetingForm — діалог створення зустрічі
 *
 * Виокремлено з planning-form.tsx (Day 8 рефактору).
 */
export function PlanningDialogs({
  // Фіналізація
  showIncompleteConfirm,
  setShowIncompleteConfirm,
  forecasts,
  gapClosures,
  propPlanAmount,
  doFinalize,
  // Пошукові модали додавання клієнта
  searchOpen,
  setSearchOpen,
  gapSearchOpen,
  setGapSearchOpen,
  addClient,
  addGapClient,
  allManagerClients,
  clientsLoading,
  // Видалення
  pendingDelete,
  setPendingDelete,
  confirmDelete,
  // Пропозиція запланувати зустріч
  meetingPrompt,
  setMeetingPrompt,
  setMeetingFormState,
  // MeetingForm
  meetingFormState,
  planDateHint,
  handleMeetingSave,
}: {
  showIncompleteConfirm: boolean;
  setShowIncompleteConfirm: (v: boolean) => void;
  forecasts: ForecastRow[];
  gapClosures: GapClosureRow[];
  propPlanAmount: number;
  doFinalize: () => void | Promise<void>;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  gapSearchOpen: boolean;
  setGapSearchOpen: (v: boolean) => void;
  addClient: (c: Client1C) => void;
  addGapClient: (c: Client1C) => void;
  allManagerClients: Client1C[];
  clientsLoading: boolean;
  pendingDelete: PendingDelete;
  setPendingDelete: (v: PendingDelete) => void;
  confirmDelete: () => void;
  meetingPrompt: MeetingPrompt;
  setMeetingPrompt: (v: MeetingPrompt) => void;
  setMeetingFormState: (v: MeetingFormState) => void;
  meetingFormState: MeetingFormState;
  planDateHint?: string;
  handleMeetingSave: (data: MeetingFormData) => void | Promise<void>;
}) {
  return (
    <>
      <ConfirmDialog
        open={showIncompleteConfirm}
        title={(() => {
          const fSum = forecasts.reduce((s, f) => s + (Number(f.forecastAmount) || 0), 0);
          const gSum = gapClosures.reduce((s, g) => s + (Number(g.potentialAmount) || 0), 0);
          return fSum + gSum < propPlanAmount
            ? 'Увага — план неповний'
            : 'Підтвердження фіналізації';
        })()}
        description={(() => {
          const fSum = forecasts.reduce((s, f) => s + (Number(f.forecastAmount) || 0), 0);
          const gSum = gapClosures.reduce((s, g) => s + (Number(g.potentialAmount) || 0), 0);
          const planned = fSum + gSum;
          const pct = propPlanAmount > 0 ? (planned / propPlanAmount) * 100 : 0;
          if (planned < propPlanAmount) {
            const diff = Math.max(0, propPlanAmount - planned);
            return `Запланована сума менше за план на ${formatUSD(diff)}, відсоток планування — ${pct.toFixed(1)}%. Ви впевнені що хочете фіналізувати? Після цього неможливо додати клієнтів чи змінити суми.`;
          }
          const overshoot = planned - propPlanAmount;
          const overMsg = overshoot > 0 ? ` (на ${formatUSD(overshoot)} більше за план)` : '';
          return `Запланована сума: ${formatUSD(planned)}${overMsg}, відсоток планування — ${pct.toFixed(1)}%. Ви впевнені що хочете фіналізувати? Після цього неможливо додати клієнтів чи змінити суми (коментарі залишаються редагованими).`;
        })()}
        confirmLabel="Так, фіналізувати"
        cancelLabel="Назад"
        onConfirm={() => { setShowIncompleteConfirm(false); void doFinalize(); }}
        onCancel={() => setShowIncompleteConfirm(false)}
      />

      {/* Обидва пошукові модали показують ВСІХ клієнтів менеджера. Перевірка на
          дубль (forecast ∪ gap) робиться у addClient/addGapClient через alert. */}
      <ClientSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={addClient} excludeIds={[]} clients={allManagerClients} loading={clientsLoading} />
      <ClientSearchModal open={gapSearchOpen} onClose={() => setGapSearchOpen(false)} onSelect={addGapClient} excludeIds={[]} clients={allManagerClients} loading={clientsLoading} />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete?.type === 'forecast-bulk'
            ? `Видалити ${pendingDelete.ids.length} клієнтів з прогнозу?`
            : pendingDelete?.type === 'gap-bulk'
            ? `Видалити ${pendingDelete.indices.length} клієнтів з закриття розриву?`
            : pendingDelete?.type === 'forecast' || pendingDelete?.type === 'gap'
            ? `Видалити «${pendingDelete.clientName}»?`
            : ''
        }
        description={
          pendingDelete?.type === 'forecast' || pendingDelete?.type === 'forecast-bulk'
            ? 'Зникнуть з блоку «Прогноз по активних». Дія застосується після збереження.'
            : 'Зникнуть з блоку «Закриття розриву». Дія застосується після збереження.'
        }
        confirmLabel="Видалити"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* Етап «Зустріч» → пропозиція запланувати точну дату й час. */}
      <ConfirmDialog
        open={meetingPrompt !== null}
        title="Запланувати зустріч?"
        description={
          meetingPrompt
            ? `Хочете одразу запланувати точну дату й час зустрічі з «${meetingPrompt.clientName}»? Подія з'явиться у блоці «Зустрічі».`
            : ''
        }
        confirmLabel="Так, запланувати"
        cancelLabel="Пізніше"
        onConfirm={() => {
          if (meetingPrompt) setMeetingFormState({ clientId: meetingPrompt.clientId });
          setMeetingPrompt(null);
        }}
        onCancel={() => setMeetingPrompt(null)}
      />

      <MeetingForm
        open={meetingFormState !== null}
        mode="create"
        prefilledClientId={meetingFormState?.clientId}
        prefilledDate={planDateHint}
        onClose={() => setMeetingFormState(null)}
        onSave={handleMeetingSave}
      />
    </>
  );
}
