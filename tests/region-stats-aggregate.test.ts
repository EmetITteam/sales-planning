// Run: node --import tsx --test tests/region-stats-aggregate.test.mjs
//
// Тести для pure-функції aggregateRegionStats з src/lib/region-stats-aggregate.ts.
// Перевіряє ключові інваріанти класифікації + unplanned-логіку без HTTP/1С.

import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRegionStats } from '../src/lib/region-stats-aggregate.ts';

// 2026-05-11 — фіксована "сьогодні" для детермінованих тестів.
// Cutoff = today − 90д = 2026-02-10
const TODAY_MS = new Date(2026, 4, 11).getTime();

// === Сценарій 1: НЕ ПЕРЕДАНО plannedClientIds → unplanned лишається 0 ===
test('не передано plannedClientIds (undefined) → unplanned=0', () => {
  const result = aggregateRegionStats(
    [{
      clients: [
        { clientId: 'c1', category: 'Активный', purchases: [{ segmentCode: 'PETARAN', lastPurchaseDate: '2026-04-15' }] },
      ],
      segments: [
        { segmentCode: 'PETARAN', clients: [{ clientId: 'c1', factAmountUSD: 1000 }] },
      ],
    }],
    undefined,
    TODAY_MS,
  );
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 1000, 'active має суму');
  assert.equal(result.bySegment.PETARAN.unplanned.factSum, 0, 'unplanned=0 коли НЕ передано');
});

// === Сценарій 2: ПЕРЕДАНО ПОРОЖНІЙ масив → ВСІ buyers стають unplanned (баг user-а) ===
test('передано пустий [] → ВСІ buyers потрапляють в unplanned', () => {
  const result = aggregateRegionStats(
    [{
      clients: [
        { clientId: 'c1', category: 'Активный', purchases: [{ segmentCode: 'PETARAN', lastPurchaseDate: '2026-04-15' }] },
        { clientId: 'c2', category: 'Спящий', purchases: [{ segmentCode: 'PETARAN', lastPurchaseDate: '2025-09-01' }] },
      ],
      segments: [
        { segmentCode: 'PETARAN', clients: [
          { clientId: 'c1', factAmountUSD: 1000 },
          { clientId: 'c2', factAmountUSD: 500 },
        ]},
      ],
    }],
    [], // план реально порожній
    TODAY_MS,
  );
  assert.equal(result.bySegment.PETARAN.unplanned.factCount, 2, 'обидва клієнти unplanned');
  assert.equal(result.bySegment.PETARAN.unplanned.factSum, 1500);
  // Категорії ТАКОЖ заповнюються (unplanned — підмножина, не виключення):
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 1000, 'c1 також у active');
  assert.equal(result.bySegment.PETARAN.byCategory.sleeping.factSum, 500, 'c2 також у sleeping');
});

// === Сценарій 3: 3-місячне правило — НЕ використовуємо 1С-категорію клієнта ===
test('класифікація по lastPurchaseDate бренду, ігнорує 1С-категорію клієнта', () => {
  const result = aggregateRegionStats(
    [{
      clients: [
        // 1С каже 'Активный' (вцілому), але цей бренд купував 6 місяців тому
        { clientId: 'c1', category: 'Активный', purchases: [
          { segmentCode: 'VITARAN', lastPurchaseDate: '2025-11-01' }, // 6+ міс тому → sleeping
        ]},
        // 1С каже 'Спящий' (вцілому), але саме цей бренд купував щойно
        { clientId: 'c2', category: 'Спящий', purchases: [
          { segmentCode: 'VITARAN', lastPurchaseDate: '2026-04-20' }, // <90д → active
        ]},
      ],
      segments: [
        { segmentCode: 'VITARAN', clients: [
          { clientId: 'c1', factAmountUSD: 100 },
          { clientId: 'c2', factAmountUSD: 200 },
        ]},
      ],
    }],
    null,
    TODAY_MS,
  );
  // c1 — 1С 'Активный' але по бренду давно → SLEEPING
  assert.equal(result.bySegment.VITARAN.byCategory.sleeping.factSum, 100, 'c1 → sleeping (бренд давно)');
  // c2 — 1С 'Спящий' але по бренду свіжо → ACTIVE
  assert.equal(result.bySegment.VITARAN.byCategory.active.factSum, 200, 'c2 → active (бренд свіжо)');
});

// === Сценарій 4: Нові — за 1С-категорією, не за датою ===
test('1С-категорія Новий → завжди в new (навіть якщо є lastPurchaseDate)', () => {
  const result = aggregateRegionStats(
    [{
      clients: [
        { clientId: 'newc', category: 'Новый', purchases: [
          { segmentCode: 'PETARAN', lastPurchaseDate: '2026-04-25' }, // свіжо, але new важливіше
        ]},
      ],
      segments: [
        { segmentCode: 'PETARAN', clients: [{ clientId: 'newc', factAmountUSD: 333 }] },
      ],
    }],
    null,
    TODAY_MS,
  );
  assert.equal(result.bySegment.PETARAN.byCategory.new.factSum, 333);
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 0, 'не active');
});

// === Сценарій 5: Той самий клієнт у двох сегментах — різні lastPurchaseDate, різна категорія ===
test('per-(client,segment) дата — клієнт active у одному бренді, sleeping в іншому', () => {
  const result = aggregateRegionStats(
    [{
      clients: [
        { clientId: 'c1', category: 'Активный', purchases: [
          { segmentCode: 'PETARAN', lastPurchaseDate: '2026-04-20' }, // свіжо
          { segmentCode: 'VITARAN', lastPurchaseDate: '2025-08-01' }, // давно
        ]},
      ],
      segments: [
        { segmentCode: 'PETARAN', clients: [{ clientId: 'c1', factAmountUSD: 100 }] },
        { segmentCode: 'VITARAN', clients: [{ clientId: 'c1', factAmountUSD: 200 }] },
      ],
    }],
    null,
    TODAY_MS,
  );
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 100, 'PETARAN — active');
  assert.equal(result.bySegment.VITARAN.byCategory.sleeping.factSum, 200, 'VITARAN — sleeping');
});

// === Сценарій 6: unplanned як підмножина, не виключення ===
test('unplanned — підмножина: c1 у плані → НЕ unplanned; c2 не в плані → unplanned + active', () => {
  const result = aggregateRegionStats(
    [{
      clients: [
        { clientId: 'c1', category: 'Активный', purchases: [{ segmentCode: 'PETARAN', lastPurchaseDate: '2026-04-15' }] },
        { clientId: 'c2', category: 'Активный', purchases: [{ segmentCode: 'PETARAN', lastPurchaseDate: '2026-04-15' }] },
      ],
      segments: [
        { segmentCode: 'PETARAN', clients: [
          { clientId: 'c1', factAmountUSD: 1000 },
          { clientId: 'c2', factAmountUSD: 500 },
        ]},
      ],
    }],
    ['c1'], // тільки c1 у плані
    TODAY_MS,
  );
  // Обидва йдуть у active (categoria по lastPurchaseDate)
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 1500, 'обидва в active');
  // Тільки c2 — unplanned (бо не у плані)
  assert.equal(result.bySegment.PETARAN.unplanned.factCount, 1);
  assert.equal(result.bySegment.PETARAN.unplanned.factSum, 500);
});

// === Сценарій 7: ДРУГИЕТМ → OTHER mapping ===
test('segmentCode ДРУГИЕТМ мапиться у OTHER', () => {
  const result = aggregateRegionStats(
    [{
      clients: [
        { clientId: 'c1', category: 'Активный', purchases: [{ segmentCode: 'ДРУГИЕТМ', lastPurchaseDate: '2026-04-20' }] },
      ],
      segments: [
        { segmentCode: 'ДРУГИЕТМ', clients: [{ clientId: 'c1', factAmountUSD: 50 }] },
      ],
    }],
    null,
    TODAY_MS,
  );
  assert.ok(result.bySegment.OTHER, 'segment перейменований у OTHER');
  assert.equal(result.bySegment.OTHER.byCategory.active.factSum, 50);
  assert.equal(result.bySegment.ДРУГИЕТМ, undefined, 'старого ключа немає');
});

// === Сценарій 8: factAmountUSD як рядок (1С іноді так віддає) ===
test('factAmountUSD рядок "123.45" парситься у число', () => {
  const result = aggregateRegionStats(
    [{
      clients: [
        { clientId: 'c1', category: 'Активный', purchases: [{ segmentCode: 'PETARAN', lastPurchaseDate: '2026-04-15' }] },
      ],
      segments: [
        { segmentCode: 'PETARAN', clients: [{ clientId: 'c1', factAmountUSD: '123.45' }] },
      ],
    }],
    null,
    TODAY_MS,
  );
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 123.45);
});

// === Сценарій 9: Buyer без lastPurchaseDate (Action 2 не повернула purchase) → sleeping ===
test('buyer без lastPurchaseDate → sleeping (бо НЕ active)', () => {
  const result = aggregateRegionStats(
    [{
      clients: [
        { clientId: 'c1', category: 'Активный', purchases: [] }, // нема purchases в Action 2
      ],
      segments: [
        { segmentCode: 'PETARAN', clients: [{ clientId: 'c1', factAmountUSD: 100 }] },
      ],
    }],
    null,
    TODAY_MS,
  );
  // Без lastPurchaseDate isRecentBrandPurchase=false → sleeping
  assert.equal(result.bySegment.PETARAN.byCategory.sleeping.factSum, 100);
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 0);
});

// === Сценарій 10: Кілька менеджерів → суми складаються ===
test('агрегат по кількох менеджерах — суми складаються', () => {
  const mgrA = {
    clients: [{ clientId: 'a1', category: 'Активный', purchases: [{ segmentCode: 'PETARAN', lastPurchaseDate: '2026-04-20' }] }],
    segments: [{ segmentCode: 'PETARAN', clients: [{ clientId: 'a1', factAmountUSD: 100 }] }],
  };
  const mgrB = {
    clients: [{ clientId: 'b1', category: 'Активный', purchases: [{ segmentCode: 'PETARAN', lastPurchaseDate: '2026-04-22' }] }],
    segments: [{ segmentCode: 'PETARAN', clients: [{ clientId: 'b1', factAmountUSD: 200 }] }],
  };
  const result = aggregateRegionStats([mgrA, mgrB], null, TODAY_MS);
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 300);
  assert.equal(result.bySegment.PETARAN.byCategory.active.factCount, 2);
});
