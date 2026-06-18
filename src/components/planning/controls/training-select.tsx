import { formatTrainingOption } from '../planning-helpers';

type TrainingOption = { trainingId: string; date: string; trainingName: string; trainingType?: string };

/**
 * Нативний `<select>` для тренінгів планування.
 *
 * Чому НЕ base-ui Select:
 *   v1.3.0 Positioner з великим списком items + value=undefined дає
 *   data-side="none" + height=0 — popup невидимий. Спроба override через
 *   alignItemWithTrigger={false} не допомогла (fix у commit 0f28958 reverted).
 *
 *   Нативний `<select>` гарантовано працює на всіх платформах:
 *     - desktop → стандартний dropdown
 *     - mobile → системний picker (краща UX)
 *
 *   Втрачаємо тільки stylized chevron і custom hover-стани — це прийнятно
 *   для рідко-використовуваного контролу.
 *
 * Створено 2026-06-18 для fix невидимого тренінг-popup.
 */
export function TrainingSelect({
  value,
  onSelect,
  trainings,
  disabled,
  maxNameLen = 50,
  size = 'desktop',
}: {
  value: string | null | undefined;
  onSelect: (training: TrainingOption | null) => void;
  trainings: TrainingOption[];
  disabled?: boolean;
  /** Скільки символів обрізати у name (50 для desktop, 40 для mobile). */
  maxNameLen?: number;
  /** Висота: 'desktop' (h-8) або 'mobile' (h-9). */
  size?: 'desktop' | 'mobile';
}) {
  const height = size === 'mobile' ? 'h-9' : 'h-8';
  return (
    <select
      value={value || ''}
      onChange={(e) => {
        const trainingId = e.target.value;
        if (!trainingId) {
          onSelect(null);
          return;
        }
        const t = trainings.find(x => x.trainingId === trainingId) ?? null;
        onSelect(t);
      }}
      disabled={disabled}
      className={`${height} w-full text-[12px] rounded-lg border border-[#e8ebf4] bg-[#fafbfe] px-2.5 outline-none focus:border-emet-blue/50 disabled:opacity-50 disabled:cursor-not-allowed appearance-none`}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.5rem center',
        paddingRight: '1.75rem',
      }}
    >
      <option value="">Обрати навчання з 1С...</option>
      {trainings.map(t => (
        <option key={t.trainingId} value={t.trainingId}>
          {formatTrainingOption(t, maxNameLen)}
        </option>
      ))}
    </select>
  );
}
