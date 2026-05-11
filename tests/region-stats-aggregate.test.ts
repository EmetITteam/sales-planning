// Run: npm test
//
// Тести pure-функції aggregateRegionStats — класифікація buyers ПО ПЛАНУ
// менеджера (forecasts/gap_closures), не по 1С-категорії і не по
// lastPurchaseDate. Кожен buyer у рівно одному bucket: active / activation
// / new / unplanned. Σ = totalFact (без переcікань).

import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRegionStats } from '../src/lib/region-stats-aggregate.ts';

// === 1. Порожній план → ВСІ buyers потрапляють у unplanned ===
test('порожній план → всі buyers у unplanned (категорії = 0)', () => {
  const result = aggregateRegionStats(
    [{
      clients: [],
      segments: [{
        segmentCode: 'PETARAN',
        clients: [
          { clientId: 'c1', factAmountUSD: 1000 },
          { clientId: 'c2', factAmountUSD: 500 },
        ],
      }],
    }],
    { forecastClientIds: [], gapNewClientIds: [], gapActivationClientIds: [] },
  );
  assert.equal(result.bySegment.PETARAN.unplanned.factCount, 2);
  assert.equal(result.bySegment.PETARAN.unplanned.factSum, 1500);
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 0);
  assert.equal(result.bySegment.PETARAN.byCategory.sleeping.factSum, 0);
  assert.equal(result.bySegment.PETARAN.byCategory.new.factSum, 0);
});

// === 2. Plan з forecast → buyer в active (НЕ unplanned, без дублювання) ===
test('buyer у forecastClientIds → active, НЕ unplanned (без дублю)', () => {
  const result = aggregateRegionStats(
    [{
      clients: [],
      segments: [{
        segmentCode: 'PETARAN',
        clients: [
          { clientId: 'c1', factAmountUSD: 1000 },
          { clientId: 'c2', factAmountUSD: 500 },
        ],
      }],
    }],
    { forecastClientIds: ['c1'], gapNewClientIds: [], gapActivationClientIds: [] },
  );
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 1000);
  assert.equal(result.bySegment.PETARAN.byCategory.active.factCount, 1);
  assert.equal(result.bySegment.PETARAN.unplanned.factSum, 500, 'c2 не у плані');
  assert.equal(result.bySegment.PETARAN.unplanned.factCount, 1);
  const total = result.bySegment.PETARAN.byCategory.active.factSum
    + result.bySegment.PETARAN.byCategory.sleeping.factSum
    + result.bySegment.PETARAN.byCategory.new.factSum
    + result.bySegment.PETARAN.unplanned.factSum;
  assert.equal(total, 1500);
});

// === 3. gapNew → new ===
test('buyer у gapNewClientIds → new', () => {
  const result = aggregateRegionStats(
    [{
      clients: [],
      segments: [{ segmentCode: 'PETARAN', clients: [{ clientId: 'newc', factAmountUSD: 333 }] }],
    }],
    { forecastClientIds: [], gapNewClientIds: ['newc'], gapActivationClientIds: [] },
  );
  assert.equal(result.bySegment.PETARAN.byCategory.new.factSum, 333);
  assert.equal(result.bySegment.PETARAN.unplanned.factSum, 0);
});

// === 4. gapActivation → sleeping (frontend колапсує у Активізація) ===
test('buyer у gapActivationClientIds → sleeping bucket', () => {
  const result = aggregateRegionStats(
    [{
      clients: [],
      segments: [{ segmentCode: 'PETARAN', clients: [{ clientId: 'sleep1', factAmountUSD: 222 }] }],
    }],
    { forecastClientIds: [], gapNewClientIds: [], gapActivationClientIds: ['sleep1'] },
  );
  assert.equal(result.bySegment.PETARAN.byCategory.sleeping.factSum, 222);
  assert.equal(result.bySegment.PETARAN.unplanned.factSum, 0);
});

// === 5. Пріоритет forecast > gapNew > gapAct ===
test('пріоритет forecast > gapNew > gapAct (без подвійного підрахунку)', () => {
  const result = aggregateRegionStats(
    [{
      clients: [],
      segments: [{ segmentCode: 'PETARAN', clients: [
        { clientId: 'a', factAmountUSD: 100 },
        { clientId: 'b', factAmountUSD: 200 },
      ]}],
    }],
    {
      forecastClientIds: ['a'],
      gapNewClientIds: ['a', 'b'],
      gapActivationClientIds: ['b'],
    },
  );
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 100);
  assert.equal(result.bySegment.PETARAN.byCategory.new.factSum, 200);
  assert.equal(result.bySegment.PETARAN.byCategory.sleeping.factSum, 0);
});

// === 6. Σ всіх 4 buckets = totalFact ===
test('сума всіх 4 buckets = totalFact (інваріант)', () => {
  const result = aggregateRegionStats(
    [{
      clients: [],
      segments: [{ segmentCode: 'PETARAN', clients: [
        { clientId: 'a', factAmountUSD: 1000 },
        { clientId: 'b', factAmountUSD: 2000 },
        { clientId: 'c', factAmountUSD: 3000 },
        { clientId: 'd', factAmountUSD: 4000 },
      ]}],
    }],
    {
      forecastClientIds: ['a'],
      gapNewClientIds: ['b'],
      gapActivationClientIds: ['c'],
    },
  );
  const s = result.bySegment.PETARAN;
  const total = s.byCategory.active.factSum + s.byCategory.new.factSum
    + s.byCategory.sleeping.factSum + s.unplanned.factSum;
  assert.equal(total, 10000);
  assert.equal(s.byCategory.active.factSum, 1000);
  assert.equal(s.byCategory.new.factSum, 2000);
  assert.equal(s.byCategory.sleeping.factSum, 3000);
  assert.equal(s.unplanned.factSum, 4000);
});

// === 7. ДРУГИЕТМ → OTHER mapping ===
test('segmentCode ДРУГИЕТМ мапиться у OTHER', () => {
  const result = aggregateRegionStats(
    [{
      clients: [],
      segments: [{ segmentCode: 'ДРУГИЕТМ', clients: [{ clientId: 'c1', factAmountUSD: 50 }] }],
    }],
    { forecastClientIds: [], gapNewClientIds: [], gapActivationClientIds: [] },
  );
  assert.ok(result.bySegment.OTHER);
  assert.equal(result.bySegment.OTHER.unplanned.factSum, 50);
  assert.equal(result.bySegment.ДРУГИЕТМ, undefined);
});

// === 8. factAmountUSD рядок парситься ===
test('factAmountUSD рядок парситься', () => {
  const result = aggregateRegionStats(
    [{
      clients: [],
      segments: [{ segmentCode: 'PETARAN', clients: [{ clientId: 'c1', factAmountUSD: '123.45' }] }],
    }],
    { forecastClientIds: ['c1'], gapNewClientIds: [], gapActivationClientIds: [] },
  );
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 123.45);
});

// === 9. Кілька менеджерів — суми складаються ===
test('агрегат по кількох менеджерах', () => {
  const result = aggregateRegionStats(
    [
      { clients: [], segments: [{ segmentCode: 'PETARAN', clients: [{ clientId: 'a1', factAmountUSD: 100 }] }] },
      { clients: [], segments: [{ segmentCode: 'PETARAN', clients: [{ clientId: 'b1', factAmountUSD: 200 }] }] },
    ],
    { forecastClientIds: ['a1', 'b1'], gapNewClientIds: [], gapActivationClientIds: [] },
  );
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 300);
  assert.equal(result.bySegment.PETARAN.byCategory.active.factCount, 2);
});

// === 10. Buyer з amount=0 пропускається ===
test('buyer з factAmountUSD=0 не рахується', () => {
  const result = aggregateRegionStats(
    [{
      clients: [],
      segments: [{ segmentCode: 'PETARAN', clients: [
        { clientId: 'c1', factAmountUSD: 0 },
        { clientId: 'c2', factAmountUSD: 100 },
      ]}],
    }],
    { forecastClientIds: ['c1', 'c2'], gapNewClientIds: [], gapActivationClientIds: [] },
  );
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 100);
  assert.equal(result.bySegment.PETARAN.byCategory.active.factCount, 1);
});

// === Dedup: один клієнт у двох менеджерів того ж сегмента → рахується ОДИН раз ===
test('dedup: один client у двох менеджерах одного segment → рахується раз', () => {
  // Сценарій: клієнт переходив між менеджерами — Action 3 повертає
  // його продажі для обох. Має бути 1 раз, не дубль.
  const result = aggregateRegionStats(
    [
      { clients: [], segments: [{ segmentCode: 'PETARAN', clients: [{ clientId: 'shared', factAmountUSD: 1000 }] }] },
      { clients: [], segments: [{ segmentCode: 'PETARAN', clients: [{ clientId: 'shared', factAmountUSD: 1000 }] }] },
    ],
    { forecastClientIds: [], gapNewClientIds: [], gapActivationClientIds: [] },
  );
  assert.equal(result.bySegment.PETARAN.unplanned.factSum, 1000, 'НЕ $2000');
  assert.equal(result.bySegment.PETARAN.unplanned.factCount, 1);
  // Діагностика: показує що було пропущено
  assert.equal(result.dedup.skippedCount, 1, '1 повтор пропущено');
  assert.equal(result.dedup.skippedSum, 1000, '$1000 пропущено');
  assert.equal(result.dedup.uniquePairs, 1, 'унікальна пара 1');
});

// === Dedup-діагностика: ідеальний сценарій (немає повторів) ===
test('dedup stat: 1 клієнт = 1 менеджер → skippedCount=0', () => {
  const result = aggregateRegionStats(
    [
      { clients: [], segments: [{ segmentCode: 'PETARAN', clients: [{ clientId: 'a', factAmountUSD: 100 }] }] },
      { clients: [], segments: [{ segmentCode: 'PETARAN', clients: [{ clientId: 'b', factAmountUSD: 200 }] }] },
      { clients: [], segments: [{ segmentCode: 'VITARAN', clients: [{ clientId: 'a', factAmountUSD: 50 }] }] }, // 'a' у іншому бренді — НЕ дубль
    ],
    { forecastClientIds: [], gapNewClientIds: [], gapActivationClientIds: [] },
  );
  assert.equal(result.dedup.skippedCount, 0, 'нема дублів');
  assert.equal(result.dedup.skippedSum, 0);
  assert.equal(result.dedup.uniquePairs, 3, '(PETARAN|a)+(PETARAN|b)+(VITARAN|a)');
});

// === Dedup: той самий клієнт у РІЗНИХ сегментах → рахується В КОЖНОМУ ===
test('dedup: один client у різних брендах → рахується у кожному', () => {
  const result = aggregateRegionStats(
    [{
      clients: [],
      segments: [
        { segmentCode: 'PETARAN', clients: [{ clientId: 'multi', factAmountUSD: 100 }] },
        { segmentCode: 'VITARAN', clients: [{ clientId: 'multi', factAmountUSD: 200 }] },
      ],
    }],
    { forecastClientIds: [], gapNewClientIds: [], gapActivationClientIds: [] },
  );
  assert.equal(result.bySegment.PETARAN.unplanned.factSum, 100);
  assert.equal(result.bySegment.VITARAN.unplanned.factSum, 200);
});

// === 11. Сценарій Вінниця: 78 buyers, план пустий → ВСІ unplanned ===
test('Вінниця: план пустий, 78 buyers → unplanned 78 / ≈$34,279', () => {
  const buyers = Array.from({ length: 78 }, (_, i) => ({
    clientId: `vc${i}`,
    factAmountUSD: 34279 / 78,
  }));
  const result = aggregateRegionStats(
    [{ clients: [], segments: [{ segmentCode: 'PETARAN', clients: buyers }] }],
    { forecastClientIds: [], gapNewClientIds: [], gapActivationClientIds: [] },
  );
  assert.equal(result.bySegment.PETARAN.unplanned.factCount, 78);
  assert.ok(Math.abs(result.bySegment.PETARAN.unplanned.factSum - 34279) < 1);
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 0);
});
