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

// ═══ Тести #4: повний save flow (UPSERT + DELETE notIn з archived фільтром) ═══

interface StoredRow extends Row {
  segment_code: string;
  user_id: string;
}

function simulateSaveFlow(
  existing: StoredRow[],
  upsertRows: StoredRow[],
  ctx: { userId: string; segment: string },
  clearAll: boolean,
): StoredRow[] {
  // Step 1: UPSERT — UPDATE existing or INSERT new (archived_at: null від ре-save)
  let result = [...existing];
  const keepIds = new Set(upsertRows.map(r => r.client_id_1c));
  for (const u of upsertRows) {
    const idx = result.findIndex(r =>
      r.client_id_1c === u.client_id_1c &&
      r.segment_code === ctx.segment &&
      r.user_id === ctx.userId
    );
    if (idx >= 0) result[idx] = { ...result[idx], ...u };
    else result.push(u);
  }
  // Step 2: DELETE WHERE archived_at IS NULL AND client_id NOT IN keep (для цього (user, segment))
  // SAFETY: empty keep list без clearAll → skip DELETE
  if (keepIds.size === 0 && !clearAll) return result;
  result = result.filter(r => {
    const inScope = r.segment_code === ctx.segment && r.user_id === ctx.userId;
    if (!inScope) return true; // різний (user, segment) — не чіпаємо
    if (r.archived_at !== null) return true; // archived — НЕ чіпаємо (M8 audit)
    return keepIds.has(r.client_id_1c); // active — keep тільки якщо у списку
  });
  return result;
}

test('save flow: UPSERT нового + DELETE прибраних — archived НЕ чіпається', () => {
  const initial: StoredRow[] = [
    { client_id_1c: 'a', forecast_amount: 100, archived_at: null,    segment_code: 'PETARAN', user_id: 'boyko' }, // активний
    { client_id_1c: 'b', forecast_amount: 200, archived_at: null,    segment_code: 'PETARAN', user_id: 'boyko' }, // активний
    { client_id_1c: 'c', forecast_amount: 50,  archived_at: '2026-05-12T15:43Z', segment_code: 'PETARAN', user_id: 'boyko' }, // M8 archived
    { client_id_1c: 'd', forecast_amount: 75,  archived_at: '2026-05-12T15:43Z', segment_code: 'PETARAN', user_id: 'boyko' }, // M8 archived
  ];
  // Менеджер змінила «a», прибрала «b», додала «e»
  const newSave: StoredRow[] = [
    { client_id_1c: 'a', forecast_amount: 150, archived_at: null, segment_code: 'PETARAN', user_id: 'boyko' },
    { client_id_1c: 'e', forecast_amount: 300, archived_at: null, segment_code: 'PETARAN', user_id: 'boyko' },
  ];
  const result = simulateSaveFlow(initial, newSave, { userId: 'boyko', segment: 'PETARAN' }, true);
  // a: оновлено $150
  // b: ВИДАЛЕНО (active, не у keep)
  // c, d: ЛИШИЛИСЯ (archived)
  // e: INSERTED
  assert.equal(result.length, 4, '4 рядки: a, c, d, e');
  assert.equal(result.find(r => r.client_id_1c === 'a')?.forecast_amount, 150, 'a updated');
  assert.equal(result.find(r => r.client_id_1c === 'b'), undefined, 'b deleted (active не у keep)');
  assert.ok(result.find(r => r.client_id_1c === 'c'), 'c kept (archived)');
  assert.ok(result.find(r => r.client_id_1c === 'd'), 'd kept (archived)');
  assert.equal(result.find(r => r.client_id_1c === 'e')?.forecast_amount, 300, 'e inserted');
});

test('save flow: re-save archived client → revive (archived_at: null)', () => {
  const initial: StoredRow[] = [
    { client_id_1c: 'c', forecast_amount: 50, archived_at: '2026-05-12T15:43Z', segment_code: 'PETARAN', user_id: 'boyko' },
  ];
  // Менеджер через пошук додала клієнта «c» (раніше archived) → форма ре-save
  const newSave: StoredRow[] = [
    { client_id_1c: 'c', forecast_amount: 80, archived_at: null, segment_code: 'PETARAN', user_id: 'boyko' },
  ];
  const result = simulateSaveFlow(initial, newSave, { userId: 'boyko', segment: 'PETARAN' }, true);
  assert.equal(result.length, 1);
  assert.equal(result[0].archived_at, null, 'archived_at скинуто на null');
  assert.equal(result[0].forecast_amount, 80, 'нова сума');
});

test('save flow: empty state + clearAll=false → SKIP DELETE (safety)', () => {
  const initial: StoredRow[] = [
    { client_id_1c: 'a', forecast_amount: 100, archived_at: null, segment_code: 'PETARAN', user_id: 'boyko' },
  ];
  const result = simulateSaveFlow(initial, [], { userId: 'boyko', segment: 'PETARAN' }, false);
  // SAFETY: без clearAll=true і empty state — нічого НЕ видаляємо
  assert.equal(result.length, 1, 'safety: active рядок лишився');
});

test('save flow: empty state + clearAll=true → DELETE усіх АКТИВНИХ (але archived лишається)', () => {
  const initial: StoredRow[] = [
    { client_id_1c: 'a', forecast_amount: 100, archived_at: null, segment_code: 'PETARAN', user_id: 'boyko' },
    { client_id_1c: 'c', forecast_amount: 50,  archived_at: '2026-05-12T15:43Z', segment_code: 'PETARAN', user_id: 'boyko' },
  ];
  const result = simulateSaveFlow(initial, [], { userId: 'boyko', segment: 'PETARAN' }, true);
  // Активний 'a' видалено. Archived 'c' лишився.
  assert.equal(result.length, 1);
  assert.equal(result[0].client_id_1c, 'c');
  assert.equal(result[0].archived_at, '2026-05-12T15:43Z');
});

test('save flow: НЕ чіпає рядки з іншого segment або іншого user', () => {
  const initial: StoredRow[] = [
    { client_id_1c: 'a', forecast_amount: 100, archived_at: null, segment_code: 'PETARAN', user_id: 'boyko' },
    { client_id_1c: 'a', forecast_amount: 200, archived_at: null, segment_code: 'NEURAMIS', user_id: 'boyko' }, // інший segment
    { client_id_1c: 'a', forecast_amount: 300, archived_at: null, segment_code: 'PETARAN', user_id: 'other' },  // інший user
  ];
  // Save Бойко PETARAN з порожнім state + clearAll → видалити лише активний 'a' у її PETARAN
  const result = simulateSaveFlow(initial, [], { userId: 'boyko', segment: 'PETARAN' }, true);
  assert.equal(result.length, 2);
  assert.ok(result.find(r => r.segment_code === 'NEURAMIS'), 'NEURAMIS rows untouched');
  assert.ok(result.find(r => r.user_id === 'other'), 'інший user untouched');
});

test('🎯 E2E Бойко sценарій: 17 active + 38 archived → save 18 → archived лишається', () => {
  // Поточний стан після M8: 17 active + 38 archived
  const initial: StoredRow[] = [];
  for (let i = 0; i < 17; i++) initial.push({
    client_id_1c: `active_${i}`, forecast_amount: 400, archived_at: null,
    segment_code: 'PETARAN', user_id: 'boyko',
  });
  for (let i = 0; i < 38; i++) initial.push({
    client_id_1c: `arch_${i}`, forecast_amount: 300, archived_at: '2026-05-12T15:43Z',
    segment_code: 'PETARAN', user_id: 'boyko',
  });
  // Бойко додала 1 нового клієнта → save 18 active
  const newSave: StoredRow[] = [];
  for (let i = 0; i < 17; i++) newSave.push({
    client_id_1c: `active_${i}`, forecast_amount: 400, archived_at: null,
    segment_code: 'PETARAN', user_id: 'boyko',
  });
  newSave.push({
    client_id_1c: 'newly_added', forecast_amount: 500, archived_at: null,
    segment_code: 'PETARAN', user_id: 'boyko',
  });
  const result = simulateSaveFlow(initial, newSave, { userId: 'boyko', segment: 'PETARAN' }, true);
  const active = result.filter(r => r.archived_at === null);
  const archived = result.filter(r => r.archived_at !== null);
  assert.equal(active.length, 18, '17 + 1 newly_added');
  assert.equal(archived.length, 38, '38 archived M8 лишаються');
  assert.equal(result.length, 56);
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
