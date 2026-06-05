/**
 * Status badge primitive (ADR-6).
 *
 * Реусабельний бейдж для всіх CRM-доменів — зустрічі / замовлення / sync.
 * Кольори і анімації за v3 design (`public/design-meetings-dashboard-v3.html`).
 *
 * Використання:
 *   <StatusBadge kind="meeting" status="in_progress" />
 *   <StatusBadge kind="sync" status="failed" />
 *
 * Анти-патерн: НЕ передавати власні children — бейдж має канонічний label
 * для кожного status. Якщо потрібна довільна підпис — використовуй <Badge>.
 */

type MeetingStatus = 'planned' | 'in_progress' | 'done' | 'postponed' | 'cancelled';
type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

type Props =
  | { kind: 'meeting'; status: MeetingStatus }
  | { kind: 'sync'; status: SyncStatus };

const MEETING_LABEL: Record<MeetingStatus, string> = {
  planned: 'Заплановано',
  in_progress: 'У роботі',
  done: 'Завершено',
  postponed: 'Відкладено',
  cancelled: 'Скасовано',
};

const SYNC_LABEL: Record<SyncStatus, string> = {
  pending: 'Чекає синку',
  syncing: 'Синхр.',
  synced: 'Синхр.',
  failed: 'Не синхр.',
};

// Стилі — стрічково. EMET-blue для planned, амбер для in_progress, мінт для done,
// сірий для postponed/cancelled, рожевий для sync failed.
const STYLES: Record<string, string> = {
  // meeting statuses
  meeting_planned: 'bg-[rgba(6,106,171,0.10)] text-emet-blue border-[rgba(6,106,171,0.20)]',
  meeting_in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  meeting_done: 'bg-teal-50 text-teal-700 border-teal-100',
  meeting_postponed: 'bg-slate-100 text-slate-600 border-slate-200',
  meeting_cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  // sync statuses
  sync_pending: 'bg-amber-50 text-amber-700 border-amber-200',
  sync_syncing: 'bg-[rgba(6,106,171,0.08)] text-emet-blue border-[rgba(6,106,171,0.18)]',
  sync_synced: 'bg-teal-50 text-teal-700 border-teal-100',
  sync_failed: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function StatusBadge(props: Props) {
  const styleKey = `${props.kind}_${props.status}`;
  const cls = STYLES[styleKey] ?? STYLES.meeting_postponed;
  const label = props.kind === 'meeting' ? MEETING_LABEL[props.status] : SYNC_LABEL[props.status];
  const showPulse = props.status === 'in_progress' || props.status === 'syncing';

  // Failed sync — icon-led (alert-triangle), решта — крапка
  const isFailed = props.kind === 'sync' && props.status === 'failed';
  const isCheck = props.kind === 'meeting' && props.status === 'done';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold tracking-wide whitespace-nowrap leading-tight ${cls}`}
    >
      {isFailed ? (
        <svg
          viewBox="0 0 24 24"
          className="w-2.5 h-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      ) : isCheck ? (
        <svg
          viewBox="0 0 24 24"
          className="w-2.5 h-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <span
          className={`w-1.5 h-1.5 rounded-full bg-current shrink-0 ${showPulse ? 'animate-pulse' : ''}`}
          aria-hidden
        />
      )}
      {label}
    </span>
  );
}
