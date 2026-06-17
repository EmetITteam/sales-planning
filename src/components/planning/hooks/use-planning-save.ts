import { useState } from 'react';
import { mutate as swrMutate } from 'swr';
import { savePlanning } from '@/lib/api';
import type { ForecastRow, GapClosureRow, GapActions } from '@/lib/types';

interface PeriodLike {
  id: number;
  weekStart: string;
  weekEnd: string;
  month: string;
}

interface SaveArgs {
  supabaseLoaded: boolean;
  forecasts: ForecastRow[];
  gapClosures: GapClosureRow[];
  gapActions: GapActions;
  formEverEdited: boolean;
  persistedClientIds: Set<string>;
  setFormEverEdited: (v: boolean) => void;
  setPersistedClientIds: (ids: Set<string>) => void;
}

/**
 * Hook що володіє save-related state (saving / saveResult / lastSavedAt)
 * і реалізує `handleSave`. Парна частина (load з Supabase) — у usePlanningLoad.
 *
 * Окремий хук бо handleSave — найскладніша частина форми:
 *  - 2 safety guards (supabaseLoaded + race-проти-load)
 *  - clearAll flag logic (delete-notIn semantics на бекенді)
 *  - SWR cache invalidation для dashboard після save
 *  - drill-down support (targetUserLogin + userMeta)
 *
 * Інші частини state (forecasts/gaps/persistedClientIds/formEverEdited)
 * передаються через аргумент handleSave щоб уникнути stale-closure
 * проблем. Setters теж — щоб після save оновити marker формEverEdited.
 *
 * Виокремлено з planning-form.tsx (Day 7 рефактору).
 */
export function usePlanningSave({
  segmentCode,
  currentPeriod,
  targetUserLogin,
  targetUserName,
  targetUserRegion,
  targetUserRegionCode,
}: {
  segmentCode: string;
  currentPeriod: PeriodLike;
  targetUserLogin?: string;
  targetUserName?: string;
  targetUserRegion?: string;
  targetUserRegionCode?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // Останнє успішне збереження (із summary.updated_at при load + з POST response).
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const handleSave = async (args: SaveArgs) => {
    const {
      supabaseLoaded,
      forecasts,
      gapClosures,
      gapActions,
      formEverEdited,
      persistedClientIds,
      setFormEverEdited,
      setPersistedClientIds,
    } = args;

    // SAFETY: не дозволяємо save доки не дочекались load з Supabase. Інакше
    // можливий race: натиснули зберегти → POST порожнього стану → у БД
    // зникають попередньо збережені рядки. На сервері є симетричний захист
    // (clearAll flag), цей — додатковий.
    if (!supabaseLoaded) {
      setSaveResult({ ok: false, msg: 'Зачекайте — дані ще завантажуються' });
      setTimeout(() => setSaveResult(null), 3000);
      return;
    }
    // Захист від «тихого порожнього save»: коли state ще не догнав load з БД,
    // forecasts може бути [], persistedClientIds має старі id-и. Backend
    // skip-ає DELETE+UPSERT у такому стані (clearAll=false safety) → UI показав
    // би «Збережено!» без реальних змін у БД.
    // ⚠️ Day 14 fix: блокуємо ТІЛЬКИ якщо менеджер ще не редагував (formEverEdited=false).
    if (!formEverEdited && forecasts.length === 0 && gapClosures.length === 0 && persistedClientIds.size > 0) {
      setSaveResult({ ok: false, msg: 'Дані ще завантажуються — спробуйте за секунду' });
      setTimeout(() => setSaveResult(null), 3000);
      return;
    }
    setSaving(true);
    setSaveResult(null);
    // ⚠️ clearAll flag — гарантує що backend виконає DELETE notIn() навіть
    // коли один з блоків (forecast або gap) пустий. Передаємо коли форма
    // реально редагувалась (formEverEdited) АБО коли є persistedClient
    // (були дані з минулого save).
    const isExplicitClearAll = formEverEdited || persistedClientIds.size > 0;
    const result = await savePlanning({
      segmentCode,
      periodId: currentPeriod.id,
      period: {
        weekStart: currentPeriod.weekStart,
        weekEnd: currentPeriod.weekEnd,
        month: currentPeriod.month,
      },
      // Drill-down: РМ зберігає за свого менеджера. Сервер перевірить що цей
      // логін у session.managedUsers; якщо ні — 403.
      targetLogin: targetUserLogin || undefined,
      // Профіль потрібен серверу лише при drill-down. Для свого збереження
      // сервер бере з сесії.
      userMeta: targetUserLogin ? {
        fullName: targetUserName || targetUserLogin,
        region: targetUserRegion || undefined,
        regionCode: targetUserRegionCode || undefined,
      } : undefined,
      forecasts,
      gapClosures,
      gapActions,
      clearAll: isExplicitClearAll,
    });
    setSaving(false);
    if (result.success) {
      // Маркер що форма редагувалась — після цього auto-populate не запуститься.
      setFormEverEdited(true);
      // persistedClientIds оновлюємо з поточного state (save їх записав у БД).
      const justSaved = new Set<string>();
      for (const f of forecasts) if (f.clientId1c) justSaved.add(f.clientId1c);
      for (const g of gapClosures) if (g.clientId1c) justSaved.add(g.clientId1c);
      setPersistedClientIds(justSaved);
      // ⚠️ Invalidate SWR cache для planAgg + regionStats — без цього dashboard
      // 60 сек тримає старі цифри (SWR dedupingInterval).
      swrMutate(
        (key) => typeof key === 'string' && (key.startsWith('agg|') || key.startsWith('region-stats|')),
        undefined,
        { revalidate: true },
      );
      if (result.savedAt) setLastSavedAt(result.savedAt);
      const c = result.counts;
      const msg = c
        ? `Збережено: прогноз ${c.forecasts}, розрив ${c.gaps}`
        : 'Збережено';
      setSaveResult({ ok: true, msg });
    } else {
      setSaveResult({ ok: false, msg: result.error || 'Помилка збереження' });
    }
    setTimeout(() => setSaveResult(null), 4000);
  };

  return {
    saving,
    saveResult,
    lastSavedAt,
    setSaving,
    setSaveResult,
    setLastSavedAt,
    handleSave,
  };
}
