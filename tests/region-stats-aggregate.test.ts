// Run: npm test
//
// Тести pure-функції aggregateRegionStats — класифікація buyers ПО ПЛАНУ
// менеджера (forecasts/gap_closures), не по 1С-категорії і не по
// lastPurchaseDate. Кожен buyer у рівно одному bucket: active / activation
// / new / unplanned. Σ = totalFact (без переcікань).

import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRegionStats } from '../src/lib/region-stats-aggregate.ts';

// Helper для тестів: формуємо ключ як це робить /api/planning/aggregate
const k = (seg: string, id: string) => `${seg}|${id}`;

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
    { forecastClientIds: [k('PETARAN', 'c1')], gapNewClientIds: [], gapActivationClientIds: [] },
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
    { forecastClientIds: [], gapNewClientIds: [k('PETARAN', 'newc')], gapActivationClientIds: [] },
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
    { forecastClientIds: [], gapNewClientIds: [], gapActivationClientIds: [k('PETARAN', 'sleep1')] },
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
      forecastClientIds: [k('PETARAN', 'a')],
      gapNewClientIds: [k('PETARAN', 'a'), k('PETARAN', 'b')],
      gapActivationClientIds: [k('PETARAN', 'b')],
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
      forecastClientIds: [k('PETARAN', 'a')],
      gapNewClientIds: [k('PETARAN', 'b')],
      gapActivationClientIds: [k('PETARAN', 'c')],
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
    { forecastClientIds: [k('PETARAN', 'c1')], gapNewClientIds: [], gapActivationClientIds: [] },
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
    { forecastClientIds: [k('PETARAN', 'a1'), k('PETARAN', 'b1')], gapNewClientIds: [], gapActivationClientIds: [] },
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
    { forecastClientIds: [k('PETARAN', 'c1'), k('PETARAN', 'c2')], gapNewClientIds: [], gapActivationClientIds: [] },
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

// === 🐛 РЕГРЕСІЯ 2026-05-12: per-segment класифікація ===
// Запоріжжя: менеджер запланувала клієнта по Vitaran. Той самий клієнт
// купив IUSE (де плану на нього не було) — повинно піти в «Незаплановані»
// для IUSE, а НЕ в «Активні» бо clientId є у forecast по Vitaran.
test('🐛 client planned in brand A, buys brand B → unplanned для B (не active)', () => {
  const result = aggregateRegionStats(
    [{
      clients: [],
      segments: [
        // Купив у Vitaran (запланований) — $500
        { segmentCode: 'VITARAN', clients: [{ clientId: 'pugach', factAmountUSD: 500 }] },
        // Купив у IUSE (НЕ запланований) — $90. Має бути unplanned.
        { segmentCode: 'IUSE',    clients: [{ clientId: 'pugach', factAmountUSD: 90 }] },
      ],
    }],
    {
      forecastClientIds: [k('VITARAN', 'pugach')], // у плані лише по Vitaran
      gapNewClientIds: [],
      gapActivationClientIds: [],
    },
  );
  // Vitaran — active (правильно)
  assert.equal(result.bySegment.VITARAN.byCategory.active.factSum, 500);
  assert.equal(result.bySegment.VITARAN.unplanned.factSum, 0);
  // IUSE — unplanned (БУЛО $90 неправомірно у active до фіксу)
  assert.equal(result.bySegment.IUSE.byCategory.active.factSum, 0, 'IUSE НЕ active бо немає плану');
  assert.equal(result.bySegment.IUSE.unplanned.factSum, 90, 'IUSE → unplanned');
  assert.equal(result.bySegment.IUSE.unplanned.factCount, 1);
});

test('🐛 Запоріжжя case: 8 IUSE-buyers без плану → ВСІ у unplanned IUSE', () => {
  // Сценарій з реального скріншоту 12.05.2026: Андрющенко запланувала
  // клієнтів по Vitaran/Neuramis, але не по IUSE. 8 з них купили IUSE.
  // Очікуємо: 8 buyers у unplanned IUSE на ~$1,178.
  const iuseBuyers = [
    { id: 'oks',  amount: 438 },
    { id: 'kvak', amount: 174 },
    { id: 'band', amount: 116 },
    { id: 'pug',  amount: 90 },
    { id: 'gor',  amount: 90 },
    { id: 'gur',  amount: 90 },
    { id: 'ant',  amount: 90 },
    { id: 'push', amount: 90 },
  ];
  const result = aggregateRegionStats(
    [{
      clients: [],
      segments: [{
        segmentCode: 'IUSE',
        clients: iuseBuyers.map(b => ({ clientId: b.id, factAmountUSD: b.amount })),
      }],
    }],
    {
      // ВСІ ці клієнти заплановані по Vitaran, але НЕ по IUSE
      forecastClientIds: iuseBuyers.map(b => k('VITARAN', b.id)),
      gapNewClientIds: [],
      gapActivationClientIds: [],
    },
  );
  assert.equal(result.bySegment.IUSE.byCategory.active.factSum, 0, 'жоден не active');
  assert.equal(result.bySegment.IUSE.unplanned.factCount, 8);
  assert.equal(result.bySegment.IUSE.unplanned.factSum, 1178);
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
  // unused k import warning — ce no-op call
  void k;
  assert.equal(result.bySegment.PETARAN.unplanned.factCount, 78);
  assert.ok(Math.abs(result.bySegment.PETARAN.unplanned.factSum - 34279) < 1);
  assert.equal(result.bySegment.PETARAN.byCategory.active.factSum, 0);
});

// === aggregateClientCategoryStats: унікальні клієнти по 1С-категорії ===
import { aggregateClientCategoryStats } from '../src/lib/region-stats-aggregate.ts';

test('clientCategory: база/заплановано/купили унікальні по категорії', () => {
  const managers = [{
    login: 'm1@x',
    clients: [
      { clientId: 'a1', category: 'Активный' },
      { clientId: 'a2', category: 'активний' },
      { clientId: 's1', category: 'Спящий' },
      { clientId: 'z1', category: 'Без закупок' },
      { clientId: 'n1', category: 'Новый' },
      { clientId: 'r1', category: 'Активный', isReserved: true }, // резерв — не рахується
    ],
    segments: [
      { segmentCode: 'PETARAN', clients: [{ clientId: 'a1', factAmountUSD: 100 }, { clientId: 'z1', factAmountUSD: 50 }] },
      // a1 купив і у другому бренді — все одно рахується РАЗ у bought:
      { segmentCode: 'IUSE', clients: [{ clientId: 'a1', factAmountUSD: 30 }] },
    ],
  }];
  // a1 запланований у двох брендах — має бути 1 planned (унікальний):
  const planned = ['PETARAN|a1', 'IUSE|a1', 'PETARAN|s1'];
  const r = aggregateClientCategoryStats(managers, planned.map(k => k.split('|')[1]));

  assert.equal(r.region.active.base, 2);      // a1, a2
  assert.equal(r.region.active.planned, 1);   // тільки a1 (унік.)
  assert.equal(r.region.active.bought, 1);    // a1 (раз, попри 2 бренди)
  assert.equal(r.region.sleeping.base, 1);    // s1
  assert.equal(r.region.sleeping.planned, 1); // s1
  assert.equal(r.region.sleeping.bought, 0);  // s1 не купив
  assert.equal(r.region.none.base, 1);        // z1 «Без закупок»
  assert.equal(r.region.none.bought, 1);      // z1 купив
  assert.equal(r.region.none.planned, 0);     // z1 не в плані
  assert.equal(r.region.new.base, 1);         // n1
  assert.equal(r.byManager.length, 1);
  assert.equal(r.byManager[0].byCategory.active.base, 2);
});
