import { useAppStore } from '@/lib/store';
import { isPlanningWritesAllowed, FEATURES } from '@/lib/feature-flags';
import { useFinalizationStatus } from '@/lib/use-finalization';
import { useWindowStatus } from '@/lib/use-window-status';

/**
 * Hook що обчислює всі lock-стани форми планування.
 *
 * Залежності:
 *  - kill-switch FEATURES.PLANNING_DISABLED (admin обходить через isPlanningWritesAllowed)
 *  - readOnly prop (РМ дивиться чужий план у режимі read-only)
 *  - finalization status (Supabase, по period+segment+login)
 *  - window-lock (admin завжди allowed; менеджер — за window_days + locks)
 *  - per-manager M9 дозвіл редагувати ETAP після фіналу
 *  - per-manager M10 дозвіл «Розфіналізувати»
 *
 * Виокремлено з planning-form.tsx (Day 6 рефактору god-component).
 */
export function usePlanningLocks({
  segmentCode,
  targetUserLogin,
  readOnlyProp,
}: {
  segmentCode: string;
  targetUserLogin?: string;
  readOnlyProp: boolean;
}) {
  const { currentPeriod, user } = useAppStore();

  // ⚠️ Пакет А Етап 0: kill-switch під час оновлення системи.
  // Адмін (itd@emet.in.ua) обходить через isPlanningWritesAllowed.
  const isMaintenanceLocked = FEATURES.PLANNING_DISABLED && !isPlanningWritesAllowed(user?.login);
  const readOnly = readOnlyProp || isMaintenanceLocked;
  const isAdmin = user?.role === 'admin';

  // Дані вантажимо/зберігаємо для targetUserLogin (РМ → чужий план)
  // або для поточного увійшовшого user.login.
  const effectiveLogin = targetUserLogin || user?.login || 'anonymous';

  // ⚠️ Пакет А Етап 2: finalization status. periodId для finalize endpoint —
  // з currentPeriod.id (тижневий). Backend сам ремапить на monthly через period.month.
  const { finalizedAt, finalizedBy, refetch: refetchFinalize } = useFinalizationStatus(
    currentPeriod?.id ?? null,
    segmentCode,
    effectiveLogin,
    currentPeriod?.month ?? null,
  );
  const isFinalized = !!finalizedAt;

  // Window-lock (Етап 3).
  const { status: windowStatus } = useWindowStatus(
    currentPeriod?.month ?? null,
    effectiveLogin && effectiveLogin !== 'anonymous' ? effectiveLogin : null,
  );
  const isWindowLocked = !!windowStatus && !windowStatus.allowed;

  // Lock редагування сум, списку клієнтів, етапів, тренінгу, кнопок Add/Remove
  // коли план фіналізований (не для admin) АБО window-lock блокує менеджера.
  const lockEdit = readOnly || (isFinalized && !isAdmin) || (isWindowLocked && !isAdmin);

  // 🆕 M9 (2026-05-19): per-manager дозвіл редагувати ETAP після фіналізації.
  // stage select лишається активним навіть коли lockEdit=true. Інші поля
  // (amounts, clients, training) лишаються заблокованими.
  const canEditStagesAfterFinalize = !!user?.canEditStagesAfterFinalize;
  const stageUnlockedAfterFinalize = isFinalized && !isAdmin && canEditStagesAfterFinalize;

  // M10: дозвіл «Розфіналізувати» — admin завжди має, плюс юзери з
  // can_unfinalize_plans (asistент директора, керівник).
  const canUnfinalize = isAdmin || !!user?.canUnfinalizePlans;

  // Дозвіл редагувати etap після фіналу BYPASS window-lock — інакше після
  // 5-го числа місяця менеджер не зможе нічого поміняти. Use case
  // «поміняти Дзвінок на Зустріч» актуальний весь місяць.
  const lockStage = stageUnlockedAfterFinalize
    ? readOnly
    : lockEdit;

  return {
    user,
    currentPeriod,
    effectiveLogin,
    readOnly,
    isAdmin,
    windowStatus,
    isFinalized,
    finalizedAt,
    finalizedBy,
    refetchFinalize,
    isWindowLocked,
    lockEdit,
    lockStage,
    canEditStagesAfterFinalize,
    stageUnlockedAfterFinalize,
    canUnfinalize,
  };
}
