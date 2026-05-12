// Тести логіки Action 7 (checkActivities) sync → stageDone у формі.
//
// Action 7 повертає {clientId, hasCall, hasMeeting, ...} per клієнт.
// Frontend ставить stageDone=true коли:
//   - row.stage='Дзвінок' AND activity.hasCall=true
//   - row.stage='Зустріч' AND activity.hasMeeting=true
// One-way sync: stageDone=true ніколи не скидається на false з 1С.

import test from 'node:test';
import assert from 'node:assert/strict';

interface FormRow {
  clientId1c: string;
  stage: string;
  stageDone: boolean;
}
interface Activity {
  clientId: string;
  hasCall: boolean;
  hasMeeting: boolean;
}

function buildMap(activities: Activity[]): Map<string, { hasCall: boolean; hasMeeting: boolean }> {
  const map = new Map();
  for (const a of activities) map.set(a.clientId, { hasCall: a.hasCall, hasMeeting: a.hasMeeting });
  return map;
}

function matches(row: FormRow, activitiesByClient: ReturnType<typeof buildMap>): boolean {
  if (row.stageDone) return false;
  const act = activitiesByClient.get(row.clientId1c);
  if (!act) return false;
  if (row.stage === 'Дзвінок' && act.hasCall) return true;
  if (row.stage === 'Зустріч' && act.hasMeeting) return true;
  return false;
}

function syncRows(rows: FormRow[], activitiesByClient: ReturnType<typeof buildMap>): FormRow[] {
  return rows.map(r => matches(r, activitiesByClient) ? { ...r, stageDone: true } : r);
}

// ═══ Тести ═══

test('checkActivities: Дзвінок + hasCall=true → stageDone=true', () => {
  const rows: FormRow[] = [{ clientId1c: 'c1', stage: 'Дзвінок', stageDone: false }];
  const map = buildMap([{ clientId: 'c1', hasCall: true, hasMeeting: false }]);
  const result = syncRows(rows, map);
  assert.equal(result[0].stageDone, true);
});

test('checkActivities: Зустріч + hasMeeting=true → stageDone=true', () => {
  const rows: FormRow[] = [{ clientId1c: 'c1', stage: 'Зустріч', stageDone: false }];
  const map = buildMap([{ clientId: 'c1', hasCall: false, hasMeeting: true }]);
  const result = syncRows(rows, map);
  assert.equal(result[0].stageDone, true);
});

test('checkActivities: Дзвінок + hasCall=false → stageDone лишається false', () => {
  const rows: FormRow[] = [{ clientId1c: 'c1', stage: 'Дзвінок', stageDone: false }];
  const map = buildMap([{ clientId: 'c1', hasCall: false, hasMeeting: false }]);
  const result = syncRows(rows, map);
  assert.equal(result[0].stageDone, false);
});

test('checkActivities: stage НЕ Дзвінок/Зустріч (Навчання) → НЕ зачипаємо', () => {
  const rows: FormRow[] = [
    { clientId1c: 'c1', stage: 'Навчання', stageDone: false },
    { clientId1c: 'c2', stage: 'Мессенджер', stageDone: false },
  ];
  // 1С повертає hasCall/hasMeeting=true АЛЕ stage не той — не реагуємо
  const map = buildMap([
    { clientId: 'c1', hasCall: true, hasMeeting: true },
    { clientId: 'c2', hasCall: true, hasMeeting: true },
  ]);
  const result = syncRows(rows, map);
  assert.equal(result[0].stageDone, false, 'Навчання не залежить від 1С');
  assert.equal(result[1].stageDone, false, 'Мессенджер теж');
});

test('checkActivities: Зустріч + hasMeeting=false але hasCall=true → НЕ підтверджуємо', () => {
  // У рядку stage=Зустріч, а 1С знайшов тільки дзвінок (не зустріч)
  const rows: FormRow[] = [{ clientId1c: 'c1', stage: 'Зустріч', stageDone: false }];
  const map = buildMap([{ clientId: 'c1', hasCall: true, hasMeeting: false }]);
  const result = syncRows(rows, map);
  assert.equal(result[0].stageDone, false, 'дзвінок не = зустріч');
});

test('🔒 ONE-WAY sync: stageDone=true НЕ скидається на false якщо 1С не підтвердив', () => {
  // Менеджер ВРУЧНУ позначила stageDone=true. 1С повертає hasCall=false.
  // Ми НЕ маємо скидати ручну позначку.
  const rows: FormRow[] = [{ clientId1c: 'c1', stage: 'Дзвінок', stageDone: true }];
  const map = buildMap([{ clientId: 'c1', hasCall: false, hasMeeting: false }]);
  const result = syncRows(rows, map);
  assert.equal(result[0].stageDone, true, 'ручна позначка не скидається');
});

test('checkActivities: клієнт відсутній у відповіді 1С → НЕ чіпаємо', () => {
  const rows: FormRow[] = [{ clientId1c: 'c1', stage: 'Дзвінок', stageDone: false }];
  const map = buildMap([]); // 1С не повернув цього клієнта
  const result = syncRows(rows, map);
  assert.equal(result[0].stageDone, false);
});

test('checkActivities: batch — декілька рядків з різними стейтами', () => {
  const rows: FormRow[] = [
    { clientId1c: 'a', stage: 'Дзвінок', stageDone: false }, // буде true
    { clientId1c: 'b', stage: 'Зустріч', stageDone: false }, // буде true
    { clientId1c: 'c', stage: 'Дзвінок', stageDone: true },  // вже true, не чіпаємо
    { clientId1c: 'd', stage: 'Навчання', stageDone: false }, // не той stage
    { clientId1c: 'e', stage: 'Дзвінок', stageDone: false }, // нема у відповіді
  ];
  const map = buildMap([
    { clientId: 'a', hasCall: true, hasMeeting: false },
    { clientId: 'b', hasCall: false, hasMeeting: true },
    { clientId: 'c', hasCall: true, hasMeeting: false }, // вже stageDone=true
    { clientId: 'd', hasCall: true, hasMeeting: true },  // не вплине
  ]);
  const result = syncRows(rows, map);
  assert.equal(result[0].stageDone, true, 'a: Дзвінок + hasCall');
  assert.equal(result[1].stageDone, true, 'b: Зустріч + hasMeeting');
  assert.equal(result[2].stageDone, true, 'c: вже було true');
  assert.equal(result[3].stageDone, false, 'd: Навчання не автоматизується');
  assert.equal(result[4].stageDone, false, 'e: нема у 1С відповіді');
});

test('checkActivities: stage=Дзвінок, hasMeeting=true (інший канал) → НЕ підтверджуємо', () => {
  // Менеджер запланувала Дзвінок. 1С знайшов Зустріч (інший канал).
  // НЕ підтверджуємо — це різні активності.
  const rows: FormRow[] = [{ clientId1c: 'c1', stage: 'Дзвінок', stageDone: false }];
  const map = buildMap([{ clientId: 'c1', hasCall: false, hasMeeting: true }]);
  const result = syncRows(rows, map);
  assert.equal(result[0].stageDone, false);
});

test('checkActivities: stage="" (порожній) → НЕ зачипаємо', () => {
  const rows: FormRow[] = [{ clientId1c: 'c1', stage: '', stageDone: false }];
  const map = buildMap([{ clientId: 'c1', hasCall: true, hasMeeting: true }]);
  const result = syncRows(rows, map);
  assert.equal(result[0].stageDone, false);
});

test('checkActivities: фільтр clientIds — тільки Дзвінок/Зустріч', () => {
  const rows: FormRow[] = [
    { clientId1c: 'a', stage: 'Дзвінок', stageDone: false },
    { clientId1c: 'b', stage: 'Зустріч', stageDone: false },
    { clientId1c: 'c', stage: 'Навчання', stageDone: false },
    { clientId1c: 'd', stage: 'Мессенджер', stageDone: false },
    { clientId1c: 'e', stage: '', stageDone: false },
  ];
  // Симулюємо фільтр який робить frontend перед викликом 1С
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.stage === 'Дзвінок' || r.stage === 'Зустріч') ids.add(r.clientId1c);
  }
  const arr = Array.from(ids).sort();
  assert.deepEqual(arr, ['a', 'b'], 'тільки Дзвінок + Зустріч у запиті до 1С');
});
