// T-1: батчинг useClientsTotals — чанкування clientIds по 400 + злиття факту
// з кількох getSalesFact-чанків. Логіка крихка (string-coerce сум, акумуляція
// між чанками, тихий cap понад 1200) — регресія тут спотворює $$ на /clients.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkClientIds,
  mergeFactBreakdown,
  sumSegmentFact,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — імпорт з .ts
} from '../src/lib/client-batching.ts';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — імпорт з .ts
import type { GetSalesFactResponse } from '../src/lib/onec-types.ts';

const ids = (n: number, prefix = 'c') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

// Хелпер фікстури getSalesFact. amount може бути string ("360.00") — як 1С
// інколи реально шле; тип каже number, тож кастимо для відтворення сценарію.
function fact(segs: Array<{ code: string; clients: Array<[string, number | string]> }>): GetSalesFactResponse {
  return {
    segments: segs.map(s => ({
      segmentCode: s.code,
      segmentName: s.code,
      totalFactUSD: 0,
      totalClientCount: s.clients.length,
      clients: s.clients.map(([clientId, amt]) => ({
        clientId,
        clientName: clientId,
        factAmountUSD: amt as number,
      })),
    })),
  };
}

// === chunkClientIds (size 400, 3 чанки = до 1200 клієнтів) ===

test('chunk400: 481 клієнт → [400, 81, 0]', () => {
  const [a, b, c] = chunkClientIds(ids(481), 400, 3);
  assert.equal(a.length, 400);
  assert.equal(b.length, 81);
  assert.equal(c.length, 0);
});

test('chunk400: 0 клієнтів → три порожні чанки (rules-of-hooks: завжди 3)', () => {
  const chunks = chunkClientIds([], 400, 3);
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks.map(c => c.length), [0, 0, 0]);
});

test('chunk400: рівно 400 → [400, 0, 0] без зайвого порожнього виклику даних', () => {
  assert.deepEqual(chunkClientIds(ids(400), 400, 3).map(c => c.length), [400, 0, 0]);
});

test('chunk400: 1200 → [400,400,400], усі влізли', () => {
  assert.deepEqual(chunkClientIds(ids(1200), 400, 3).map(c => c.length), [400, 400, 400]);
});

test('chunk400: 1250 → понад 1200 ТИХО відкидається (відомий cap)', () => {
  const chunks = chunkClientIds(ids(1250), 400, 3);
  const total = chunks.reduce((s, c) => s + c.length, 0);
  assert.equal(total, 1200);
  // id #1200..1249 не потрапили у жоден чанк
  const flat = new Set(chunks.flat());
  assert.equal(flat.has('c1199'), true);
  assert.equal(flat.has('c1200'), false);
  assert.equal(flat.has('c1249'), false);
});

// === mergeFactBreakdown ===

test('merge: два бренди одного клієнта в одному чанку → сума + per-brand', () => {
  const out = mergeFactBreakdown([fact([
    { code: 'VITARAN', clients: [['k1', 100]] },
    { code: 'ESSE', clients: [['k1', 40]] },
  ])]);
  assert.equal(out['k1'].factTotal, 140);
  assert.equal(out['k1'].brands.VITARAN, 100);
  assert.equal(out['k1'].brands.ESSE, 40);
});

test('merge: один клієнт у ДВОХ чанках → factTotal акумулюється', () => {
  const out = mergeFactBreakdown([
    fact([{ code: 'VITARAN', clients: [['k1', 100]] }]),
    fact([{ code: 'VITARAN', clients: [['k1', 25]] }]),
  ]);
  assert.equal(out['k1'].factTotal, 125);
  assert.equal(out['k1'].brands.VITARAN, 125);
});

test('merge: factAmountUSD як string "360.00" → coerce у число', () => {
  const out = mergeFactBreakdown([fact([{ code: 'ESSE', clients: [['k1', '360.00']] }])]);
  assert.equal(out['k1'].factTotal, 360);
});

test('merge: нульова сума і безідішні записи пропускаються', () => {
  const out = mergeFactBreakdown([fact([{ code: 'ESSE', clients: [['k1', 0], ['', 50]] }])]);
  assert.equal(out['k1'], undefined);
  assert.equal(out[''], undefined);
});

test('merge: null/undefined чанки не ламають (часткове завантаження)', () => {
  const out = mergeFactBreakdown([null, undefined, fact([{ code: 'ESSE', clients: [['k1', 10]] }])]);
  assert.equal(out['k1'].factTotal, 10);
});

test('merge: порожній вхід → {}', () => {
  assert.deepEqual(mergeFactBreakdown([]), {});
  assert.deepEqual(mergeFactBreakdown([null, undefined]), {});
});

// === sumSegmentFact (факт для картки «Виконання») ===
// totalFactUSD — факт сегменту по ВСІХ клієнтах менеджера (не по clientIds),
// тож у різних чанках значення того самого сегмента однакове. Регресія тут
// або занижує факт (як було: сумували clients[] → $896 замість $66,220),
// або, без dedupe, множить його на к-сть чанків.

// Фікстура з явними totalFactUSD по сегментах (детальні clients[] тут не важливі).
function segTotals(segs: Array<{ code: string; total: number | string }>): GetSalesFactResponse {
  return {
    segments: segs.map(s => ({
      segmentCode: s.code,
      segmentName: s.code,
      totalFactUSD: s.total as number,
      totalClientCount: 0,
      clients: [],
    })),
  };
}

test('sumSeg: сумує totalFactUSD по різних сегментах', () => {
  const r = sumSegmentFact([segTotals([
    { code: 'VITARAN', total: 30085 },
    { code: 'NEURONOX', total: 22027 },
  ])]);
  assert.equal(r, 52112);
});

test('sumSeg: той самий сегмент у 3 чанках НЕ множиться (dedupe по segmentCode)', () => {
  // 190 клієнтів влазять в 1 чанк, але для >400 було б 2-3 виклики з тим самим
  // totalFactUSD — не має утроїтись.
  const one = segTotals([{ code: 'VITARAN', total: 30085 }]);
  assert.equal(sumSegmentFact([one, one, one]), 30085);
});

test('sumSeg: string "77743.00" → coerce у число', () => {
  assert.equal(sumSegmentFact([segTotals([{ code: 'PETARAN', total: '77743.00' }])]), 77743);
});

test('sumSeg: null/undefined чанки не ламають', () => {
  assert.equal(sumSegmentFact([null, undefined, segTotals([{ code: 'ESSE', total: 100 }])]), 100);
});

test('sumSeg: порожній вхід → 0', () => {
  assert.equal(sumSegmentFact([]), 0);
  assert.equal(sumSegmentFact([null, undefined]), 0);
});

test('sumSeg: НЕ дорівнює сумі clients[] коли деталізація неповна (кейс headofsd)', () => {
  // Сегмент: реальний факт $66,220, але 1С деталізує у clients[] лише $896 —
  // саме тому картка мусить брати totalFactUSD, а не суму clients[].
  const resp: GetSalesFactResponse = {
    segments: [{
      segmentCode: 'VITARAN', segmentName: 'VITARAN',
      totalFactUSD: 66220, totalClientCount: 40,
      clients: [{ clientId: 'k1', clientName: 'k1', factAmountUSD: 896 } as never],
    }],
  };
  assert.equal(sumSegmentFact([resp]), 66220);
  assert.equal(mergeFactBreakdown([resp])['k1'].factTotal, 896);
});
