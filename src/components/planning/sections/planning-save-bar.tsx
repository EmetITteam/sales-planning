import { Button } from '@/components/ui/button';
import { Save, Lock, RefreshCw } from 'lucide-react';

/**
 * Sticky save bar — приліплений під AppHeader (top-[56px]).
 *
 * Чому sticky-top: у довгій формі (25+ клієнтів × 3 категорії) кнопки
 * «Фіналізувати» / «Розфіналізувати» мають бути доступні без скролу.
 *
 * Day 14 #2: bar показуємо навіть коли план фіналізований (lockEdit=true для
 * non-admin), щоб менеджер міг зберегти оновлені stage_comment. Backend
 * filtered-mode (Етап 2) пропустить лише ці поля.
 *
 * Save bar ховаємо коли window закритий не-адміну. Admin завжди бачить
 * кнопки (bypass усіх обмежень).
 *
 * Виокремлено з planning-form.tsx (Day 8 рефактору).
 */
export function PlanningSaveBar({
  readOnly,
  isAdmin,
  isWindowLocked,
  isFinalized,
  stageUnlockedAfterFinalize,
  canUnfinalize,
  lastSavedAt,
  saveResult,
  saving,
  finalizing,
  handleSave,
  handleFinalize,
  handleUnfinalize,
}: {
  readOnly: boolean;
  isAdmin: boolean;
  isWindowLocked: boolean;
  isFinalized: boolean;
  stageUnlockedAfterFinalize: boolean;
  canUnfinalize: boolean;
  lastSavedAt: string | null;
  saveResult: { ok: boolean; msg: string } | null;
  saving: boolean;
  finalizing: boolean;
  handleSave: () => void;
  handleFinalize: () => void;
  handleUnfinalize: () => void;
}) {
  if (readOnly || (!isAdmin && isWindowLocked)) return null;

  return (
    <div className="sticky top-[56px] -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-white/85 backdrop-blur-md border-b border-[#e2e7ef] flex flex-wrap items-center justify-end gap-2 md:gap-3 z-30">
      {lastSavedAt && !saveResult && (
        <span className="text-[11px] text-muted-foreground mr-auto">
          Остання чернетка: {new Date(lastSavedAt).toLocaleString('uk-UA', {
            day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
          })}
        </span>
      )}
      {saveResult && (
        <span className={`text-[13px] font-medium px-3 py-1.5 rounded-lg backdrop-blur-sm border ${
          saveResult.ok ? 'bg-emerald-500/12 border-emerald-300/40 text-emerald-700' : 'bg-rose-500/12 border-rose-300/40 text-rose-700'
        }`} role="status">
          {saveResult.msg}
        </span>
      )}
      <Button
        onClick={handleSave}
        disabled={saving || finalizing}
        className="flex-1 md:flex-initial gap-2 bg-gradient-to-r from-emet-blue to-emet-blue-light hover:from-emet-blue-dark hover:to-[#0775bb] text-white shadow-lg shadow-emet-blue/15 rounded-xl h-11 px-4 md:px-6 text-[13px] md:text-[14px] font-semibold disabled:opacity-50"
      >
        {saving ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-label="Збереження...">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Зберігаю...
          </>
        ) : (
          <><Save className="h-4 w-4" /> {isFinalized && !isAdmin ? (stageUnlockedAfterFinalize ? 'Зберегти етапи + коментарі' : 'Зберегти коментарі') : 'Зберегти чернетку'}</>
        )}
      </Button>
      {!isFinalized && (
        <Button
          onClick={handleFinalize}
          disabled={saving || finalizing}
          className="flex-1 md:flex-initial gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/15 rounded-xl h-11 px-4 md:px-6 text-[13px] md:text-[14px] font-semibold disabled:opacity-50"
          title="Заблокувати план від подальших змін сум і списку клієнтів"
        >
          <Lock className="h-4 w-4" />
          <span className="md:hidden">{finalizing ? 'Зберігаю…' : 'Фіналізувати'}</span>
          <span className="hidden md:inline">{finalizing ? 'Зберігаю…' : 'Фінальне збереження'}</span>
        </Button>
      )}
      {isFinalized && canUnfinalize && (
        <Button
          onClick={handleUnfinalize}
          disabled={saving || finalizing}
          className="flex-1 md:flex-initial gap-2 bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-500/15 rounded-xl h-11 px-4 md:px-6 text-[13px] md:text-[14px] font-semibold disabled:opacity-50"
          title="Зняти фіналізацію — дозволити менеджеру редагувати"
        >
          <RefreshCw className="h-4 w-4" />
          <span className="md:hidden">{finalizing ? 'Розфін…' : 'Розфіналіз.'}</span>
          <span className="hidden md:inline">{finalizing ? 'Розфіналізую…' : 'Розфіналізувати'}</span>
        </Button>
      )}
    </div>
  );
}
