// T-2: батчинг useClientFocuses — чанкування clientIds по 200 (до 600) +
// злиття focuses[] з кількох getClientFocus-чанків у map по clientId.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkClientIds,
  mergeFocuses,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — імпорт з .ts
} from '../src/lib/client-batching.ts';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — імпорт з .ts
import type { GetClientFocusResponse } from '../src/lib/onec-types.ts';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);

function focusRes(rows: Array<{ id: string; names: string[] }>): GetClientFocusResponse {
  return {
    focuses: rows.map(r => ({
      clientId: r.id,
      items: r.names.map(focusName => ({ focusName })),
    })),
  };
}

// === chunkClientIds (size 200, 3 чанки = до 600 клієнтів) ===

test('chunk200: 481 клієнт → [200, 200, 81]', () => {
  assert.deepEqual(chunkClientIds(ids(481), 200, 3).map(c => c.length), [200, 200, 81]);
});

test('chunk200: 0 клієнтів → три порожні чанки', () => {
  assert.deepEqual(chunkClientIds([], 200, 3).map(c => c.length), [0, 0, 0]);
});

test('chunk200: 600 → [200,200,200], усі влізли', () => {
  assert.deepEqual(chunkClientIds(ids(600), 200, 3).map(c => c.length), [200, 200, 200]);
});

test('chunk200: 650 → понад 600 ТИХО відкидається (відомий cap)', () => {
  const chunks = chunkClientIds(ids(650), 200, 3);
  assert.equal(chunks.reduce((s, c) => s + c.length, 0), 600);
  const flat = new Set(chunks.flat());
  assert.equal(flat.has('c599'), true);
  assert.equal(flat.has('c600'), false);
});

// === mergeFocuses ===

test('merge: фокуси з різних чанків зливаються по clientId', () => {
  const out = mergeFocuses([
    focusRes([{ id: 'k1', names: ['Активація'] }]),
    focusRes([{ id: 'k2', names: ['Бонус', 'Промо'] }]),
  ]);
  assert.equal(out['k1'].length, 1);
  assert.equal(out['k1'][0].focusName, 'Активація');
  assert.equal(out['k2'].length, 2);
});

test('merge: клієнт може мати кілька активних фокусів', () => {
  const out = mergeFocuses([focusRes([{ id: 'k1', names: ['A', 'B', 'C'] }])]);
  assert.deepEqual(out['k1'].map(f => f.focusName), ['A', 'B', 'C']);
});

test('merge: безідішні записи пропускаються', () => {
  const out = mergeFocuses([focusRes([{ id: '', names: ['X'] }])]);
  assert.equal(out[''], undefined);
});

test('merge: items не масив → нормалізується у []', () => {
  // 1С теоретично може віддати items=null — guard має дати [].
  const malformed = { focuses: [{ clientId: 'k1', items: null }] } as unknown as GetClientFocusResponse;
  const out = mergeFocuses([malformed]);
  assert.deepEqual(out['k1'], []);
});

test('merge: null/undefined чанки не ламають', () => {
  const out = mergeFocuses([null, undefined, focusRes([{ id: 'k1', names: ['A'] }])]);
  assert.equal(out['k1'].length, 1);
});

test('merge: порожній вхід → {}', () => {
  assert.deepEqual(mergeFocuses([]), {});
  assert.deepEqual(mergeFocuses([null, undefined]), {});
});
