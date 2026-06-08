-- Migration 018: started_at + finished_at у meetings
--
-- Раніше LiveTimer на дашборді тримав start moment у localStorage
-- (meetingStartedAt:<id>). Це не виживало switch device / clear cookies.
-- Тепер пишемо у БД — server-side і UI читають з одного джерела.
--
-- started_at заповнюється у repo.startMeeting; finished_at — у finishMeeting.

alter table meetings
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz;

comment on column meetings.started_at is
  'Реальний момент кліку «Розпочати» (НЕ плановий time). Для LiveTimer
   обчислення тривалості зустрічі. NULL для planned/cancelled.';

comment on column meetings.finished_at is
  'Реальний момент кліку «Завершити». duration_min обчислюється з
   finished_at - started_at для done зустрічей.';
