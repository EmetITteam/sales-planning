// Тести логіки M8 (Variant C) — soft-delete з захистом ETAP-рядків.
//
// 3 групи тестів:
//   1. hasEditMarker — pure-функція визначення «свідома правка»
//   2. aggregate filter — `archived_at IS NULL` коректно відфільтровує
//   3. revive on UPSERT — payload з archived_at:null повертає рядок у активні

import test from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────────────────
// helper hasEditMarker — копія логіки з scripts/m8-refined-dry-run.mjs
// (надалі винесемо у src/lib/m8-soft-delete.ts і будемо імпортувати з обох)
// ─────────────────────────────────────────────────────────────────────────

interface ForecastLike {
  stage?: string | null;
  stage_comment?: string | null;
  manually_added?: boolean | null;
  completed?: boolean | null;
  stage_done?: boolean | null;
  training_id?: string | null;
}
interface GapLike extends ForecastLike {
  closure_completed?: boolean | null;
  deadline?: string | null;
}

const isStr = (v: string | null | undefined): boolean =>
  typeof v === 'string' && v.trim().length > 0;

function hasEditMarker(row: ForecastLike | GapLike, isForecast: boolean): boolean {
  if (isStr(row.stage)) return true;
  if (isStr(row.stage_comment)) return true;
  if (row.manually_added === true) return true;
  if (row.stage_done === true) return true;
  if (row.training_id) return true;
  if (isForecast) {
    if (row.completed === true) return true;
  } else {
    const gap = row as GapLike;
    if (gap.closure_completed === true) return true;
    if (isStr(gap.deadline)) return true;
  }
  return false;
}

// ═══ Тести #1: hasEditMarker ═══

test('hasEditMarker: всі поля порожні → false (буде архівовано)', () => {
  assert.equal(hasEditMarker({}, true), false);
  assert.equal(hasEditMarker({ stage: null, stage_comment: null, manually_added: false, completed: false, stage_done: false, training_id: null }, true), false);
});

test('hasEditMarker: stage=Дзвінок → true (preserve)', () => {
  assert.equal(hasEditMarker({ stage: 'Дзвінок' }, true), true);
  assert.equal(hasEditMarker({ stage: 'Мессенджер' }, false), true);
});

test('hasEditMarker: stage порожній рядок або пробіли → false', () => {
  assert.equal(hasEditMarker({ stage: '' }, true), false);
  assert.equal(hasEditMarker({ stage: '   ' }, true), false);
});

test('hasEditMarker: stage_comment з текстом → true (preserve)', () => {
  assert.equal(hasEditMarker({ stage_comment: 'Зателефонувати завтра 16:00' }, true), true);
});

test('hasEditMarker: manually_added=true → true (preserve)', () => {
  assert.equal(hasEditMarker({ manually_added: true }, true), true);
  assert.equal(hasEditMarker({ manually_added: true }, false), true);
});

test('hasEditMarker: forecast completed=true → true', () => {
  assert.equal(hasEditMarker({ completed: true }, true), true);
});

test('hasEditMarker: gap closure_completed=true → true', () => {
  assert.equal(hasEditMarker({ closure_completed: true } as GapLike, false), true);
});

test('hasEditMarker: gap completed=true (НЕ closure_completed) → false', () => {
  // forecast.completed не значуще для gap-row
  assert.equal(hasEditMarker({ completed: true } as ForecastLike, false), false);
});

test('hasEditMarker: stage_done=true → true', () => {
  assert.equal(hasEditMarker({ stage_done: true }, true), true);
  assert.equal(hasEditMarker({ stage_done: true }, false), true);
});

test('hasEditMarker: training_id filled → true', () => {
  assert.equal(hasEditMarker({ training_id: 'tr-uuid-123' }, true), true);
});

test('hasEditMarker: gap deadline=2026-05-31 → true', () => {
  assert.equal(hasEditMarker({ deadline: '2026-05-31' } as GapLike, false), true);
});

test('hasEditMarker: gap deadline=null → false', () => {
  assert.equal(hasEditMarker({ deadline: null } as GapLike, false), false);
  assert.equal(hasEditMarker({ deadline: '' } as GapLike, false), false);
});

// ═══ Тести #2: aggregate filter `archived_at IS NULL` ═══

interface Row {
  client_id_1c: string;
  forecast_amount?: number;
  potential_amount?: number;
  archived_at: string | null;
}

function aggregateActive(rows: Row[], isForecast: boolean): { count: number; sum: number } {
  // Симулює Supabase запит з `.is('archived_at', null)`
  const active = rows.filter(r => r.archived_at === null);
  const sum = active.reduce((s, r) => s + ((isForecast ? r.forecast_amount : r.potential_amount) || 0), 0);
  return { count: active.length, sum };
}

test('aggregate: archived_at IS NULL → рахує тільки активні (не архівні)', () => {
  const rows: Row[] = [
    { client_id_1c: 'c1', forecast_amount: 100, archived_at: null },
    { client_id_1c: 'c2', forecast_amount: 200, archived_at: null },
    { client_id_1c: 'c3', forecast_amount: 50,  archived_at: '2026-05-12T19:00:00Z' },
    { client_id_1c: 'c4', forecast_amount: 75,  archived_at: '2026-05-12T19:00:00Z' },
  ];
  const result = aggregateActive(rows, true);
  assert.equal(result.count, 2);
  assert.equal(result.sum, 300, 'не включає $50+$75 архівних');
});

test('aggregate: усі archived → 0/0', () => {
  const rows: Row[] = [
    { client_id_1c: 'c1', forecast_amount: 100, archived_at: '2026-05-12T19:00:00Z' },
    { client_id_1c: 'c2', forecast_amount: 200, archived_at: '2026-05-12T19:00:00Z' },
  ];
  const result = aggregateActive(rows, true);
  assert.equal(result.count, 0);
  assert.equal(result.sum, 0);
});

test('aggregate: усі активні → повна сума', () => {
  const rows: Row[] = [
    { client_id_1c: 'c1', forecast_amount: 100, archived_at: null },
    { client_id_1c: 'c2', forecast_amount: 200, archived_at: null },
  ];
  const result = aggregateActive(rows, true);
  assert.equal(result.count, 2);
  assert.equal(result.sum, 300);
});

// ═══ Тести #3: revive on UPSERT ═══

function simulateUpsert(existing: Row[], payload: Row & { archived_at: string | null }): Row[] {
  // Симулює Supabase UPSERT (onConflict=client_id_1c):
  // — якщо рядок з тим client_id існує → UPDATE з payload
  // — інакше INSERT
  // Спред (...) рознощить ВСІ поля payload, ВКЛЮЧНО з archived_at.
  const next = [...existing];
  const idx = next.findIndex(r => r.client_id_1c === payload.client_id_1c);
  if (idx >= 0) next[idx] = { ...next[idx], ...payload };
  else next.push(payload);
  return next;
}

test('revive: UPSERT з archived_at:null оживляє archived рядок', () => {
  const archived: Row[] = [
    { client_id_1c: 'c1', forecast_amount: 100, archived_at: '2026-05-12T19:00:00Z' },
  ];
  const result = simulateUpsert(archived, { client_id_1c: 'c1', forecast_amount: 150, archived_at: null });
  assert.equal(result.length, 1, 'кількість не змінилась');
  assert.equal(result[0].archived_at, null, 'archived_at скинуто на null');
  assert.equal(result[0].forecast_amount, 150, 'нова сума записана');
});

test('revive: UPSERT нового клієнта → новий active рядок (archived_at:null)', () => {
  const existing: Row[] = [
    { client_id_1c: 'c1', forecast_amount: 100, archived_at: null },
  ];
  const result = simulateUpsert(existing, { client_id_1c: 'c2', forecast_amount: 200, archived_at: null });
  assert.equal(result.length, 2);
  assert.equal(result[1].archived_at, null);
});

test('🐛 ANTI-test: UPSERT БЕЗ archived_at у payload → рядок ЗАЛИШАЄТЬСЯ archived', () => {
  // Документує вимогу: save flow ПОВИНЕН явно передавати archived_at: null
  const archived: Row[] = [
    { client_id_1c: 'c1', forecast_amount: 100, archived_at: '2026-05-12T19:00:00Z' },
  ];
  // Payload БЕЗ archived_at (форма забула передати — це баг)
  const buggyPayload = { client_id_1c: 'c1', forecast_amount: 150 } as Row & { archived_at: string | null };
  // @ts-expect-error — навмисно без поля archived_at
  delete buggyPayload.archived_at;
  const result = simulateUpsert(archived, buggyPayload as Row & { archived_at: string | null });
  // Без явного archived_at:null рядок ЛИШАЄТЬСЯ архівним.
  // Це означає: planning route MUST включати `archived_at: null` у UPSERT payload.
  assert.equal(result[0].archived_at, '2026-05-12T19:00:00Z', 'без явного null — archived_at не скидається');
  assert.equal(result[0].forecast_amount, 150, 'сума оновлюється, але archived_at — ні');
});

// ═══ E2E: сценарій Бойко PETARAN ═══

test('🎯 E2E Бойко: 9 forecasts → 1 preserved (ETAP=Дзвінок), 8 archived', () => {
  const day1Rows = [
    { stage: 'Дзвінок', client_id_1c: 'zhylenkova',  forecast_amount: 140 },  // ETAP-marked
    { stage: null,      client_id_1c: 'kunchenko',   forecast_amount: 140 },
    { stage: null,      client_id_1c: 'prichodko',   forecast_amount: 630 },
    { stage: null,      client_id_1c: 'artushenko',  forecast_amount: 378 },
    { stage: null,      client_id_1c: 'shcherban',   forecast_amount: 714 },
    { stage: null,      client_id_1c: 'garna',       forecast_amount: 140 },
    { stage: null,      client_id_1c: 'ponikar',     forecast_amount: 140 },
    { stage: null,      client_id_1c: 'shkurchenko', forecast_amount: 99 },
    { stage: null,      client_id_1c: 'vishn',       forecast_amount: 595 },
  ];

  const archived: typeof day1Rows = [];
  const preserved: typeof day1Rows = [];
  for (const r of day1Rows) {
    if (hasEditMarker(r as ForecastLike, true)) preserved.push(r);
    else archived.push(r);
  }
  assert.equal(preserved.length, 1, 'Жиленкова з ETAP → preserved');
  assert.equal(preserved[0].client_id_1c, 'zhylenkova');
  assert.equal(archived.length, 8, '8 без markers → archived');

  const sumArch = archived.reduce((s, r) => s + r.forecast_amount, 0);
  const sumPres = preserved.reduce((s, r) => s + r.forecast_amount, 0);
  assert.equal(sumArch, 2836, 'архівуємо $2836');
  assert.equal(sumPres, 140, 'preserve Жиленкова $140');
});

test('🎯 E2E Селіванова NEURAMIS: всі 15+5=20 рядків з ETAP → 0 archived', () => {
  // На основі реальних даних (з dry-run): усі 20 older рядків мають [Мессенджер]/[Дзвінок]/[Зустріч]
  const olderRows = Array.from({ length: 20 }, (_, i) => ({
    stage: i % 3 === 0 ? 'Мессенджер' : (i % 3 === 1 ? 'Дзвінок' : 'Зустріч'),
    client_id_1c: `client_${i}`,
    forecast_amount: 70 + i * 10,
  }));
  const archived = olderRows.filter(r => !hasEditMarker(r as ForecastLike, true));
  const preserved = olderRows.filter(r => hasEditMarker(r as ForecastLike, true));
  assert.equal(archived.length, 0, '0 archived — всі мають ETAP');
  assert.equal(preserved.length, 20, '20 preserved');
});

test('🎯 E2E Лопушанська IUSE: 4 manually_added + 2 з ETAP → 0 archived', () => {
  const olderRows = [
    { stage: 'Зустріч',  manually_added: true,  client_id_1c: 'minska',   forecast_amount: 220 },
    { stage: 'Зустріч',  manually_added: false, client_id_1c: 'mikevich', forecast_amount: 206 },
    { stage: 'Дзвінок',  manually_added: true,  client_id_1c: 'yarmchuk', forecast_amount: 206 },
    { stage: 'Дзвінок',  manually_added: false, client_id_1c: 'gobzh',    forecast_amount: 116 },
    { stage: 'Дзвінок',  manually_added: true,  client_id_1c: 'balakina', forecast_amount: 90 },
    { stage: 'Зустріч',  manually_added: true,  client_id_1c: 'zotova',   forecast_amount: 90 },
  ];
  const archived = olderRows.filter(r => !hasEditMarker(r as ForecastLike, true));
  assert.equal(archived.length, 0, 'усі 6 збережено (ETAP + manually_added)');
});
