/**
 * Тести для логіки «passive rows» — клієнтів з amount=0.
 *
 * Семантика: менеджер ставить 0 щоб «пам'ятати, але не планувати».
 * Такі рядки:
 *  - НЕ враховуються у counter'ах
 *  - НЕ зараховуються у заповненість бренду
 *  - сортуються в кінець списку
 *  - потрапляють у «Незаплановані» якщо у клієнта з'явиться факт
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  isPassiveAmount,
  compareForecastRows,
  compareGapRows,
  classifyManagerStatus,
} from '../src/lib/passive-rows';
import { getUnplannedBuyersForSegment } from '../src/lib/unplanned-buyers';
import type { Client1C, SalesFactResponse } from '../src/lib/types';

// -----------------------------------------------------------------------------
// isPassiveAmount
// -----------------------------------------------------------------------------

test('isPassiveAmount: 0 → true', () => {
  assert.equal(isPassiveAmount(0), true);
});

test('isPassiveAmount: 0.0 → true', () => {
  assert.equal(isPassiveAmount(0.0), true);
});

test('isPassiveAmount: negative → true (захист від bug-ів)', () => {
  assert.equal(isPassiveAmount(-100), true);
});

test('isPassiveAmount: 1 → false', () => {
  assert.equal(isPassiveAmount(1), false);
});

test('isPassiveAmount: великa сумa → false', () => {
  assert.equal(isPassiveAmount(50000), false);
});

test('isPassiveAmount: null/undefined → true (порожнє = passive)', () => {
  assert.equal(isPassiveAmount(null), true);
  assert.equal(isPassiveAmount(undefined), true);
});

// -----------------------------------------------------------------------------
// compareForecastRows
// -----------------------------------------------------------------------------

const fRow = (name: string, amount: number, completed = false) => ({
  clientName: name,
  forecastAmount: amount,
  completed,
});

test('compareForecastRows: amount > 0 ПЕРЕД amount = 0', () => {
  const rows = [
    fRow('Альфа', 0),
    fRow('Бета', 1000),
  ];
  const sorted = [...rows].sort(compareForecastRows);
  assert.equal(sorted[0].clientName, 'Бета', 'активний має бути зверху');
  assert.equal(sorted[1].clientName, 'Альфа', 'passive в кінці');
});

test('compareForecastRows: усередині active — алфавіт', () => {
  const rows = [
    fRow('Бета', 500),
    fRow('Альфа', 1000),
    fRow('Гама', 300),
  ];
  const sorted = [...rows].sort(compareForecastRows);
  assert.deepEqual(sorted.map(r => r.clientName), ['Альфа', 'Бета', 'Гама']);
});

test('compareForecastRows: усередині passive — теж алфавіт', () => {
  const rows = [
    fRow('Зет', 0),
    fRow('Альфа', 0),
    fRow('Бета', 0),
  ];
  const sorted = [...rows].sort(compareForecastRows);
  assert.deepEqual(sorted.map(r => r.clientName), ['Альфа', 'Бета', 'Зет']);
});

test('compareForecastRows: completed йдуть в самий низ навіть з amount > 0', () => {
  const rows = [
    fRow('Виконаний-але-активний', 5000, true),
    fRow('Passive', 0, false),
    fRow('Активний', 1000, false),
  ];
  const sorted = [...rows].sort(compareForecastRows);
  assert.equal(sorted[0].clientName, 'Активний');
  assert.equal(sorted[1].clientName, 'Passive');
  assert.equal(sorted[2].clientName, 'Виконаний-але-активний');
});

test('compareForecastRows: повний приклад змішаний', () => {
  const rows = [
    fRow('Виконаний-Б', 500, true),
    fRow('Активний-Г', 200, false),
    fRow('Passive-А', 0, false),
    fRow('Виконаний-А', 100, true),
    fRow('Активний-Б', 800, false),
    fRow('Passive-Б', 0, false),
  ];
  const sorted = [...rows].sort(compareForecastRows);
  // Активні (алф), потім passive (алф), потім completed (алф)
  assert.deepEqual(sorted.map(r => r.clientName), [
    'Активний-Б',
    'Активний-Г',
    'Passive-А',
    'Passive-Б',
    'Виконаний-А',
    'Виконаний-Б',
  ]);
});

// -----------------------------------------------------------------------------
// compareGapRows (потенціал замість прогнозу — інший field name)
// -----------------------------------------------------------------------------

const gRow = (name: string, amount: number, completed = false) => ({
  clientName: name,
  potentialAmount: amount,
  completed,
});

test('compareGapRows: passive в кінець', () => {
  const rows = [
    gRow('Альфа', 0),
    gRow('Бета', 500),
  ];
  const sorted = [...rows].sort(compareGapRows);
  assert.equal(sorted[0].clientName, 'Бета');
  assert.equal(sorted[1].clientName, 'Альфа');
});

// -----------------------------------------------------------------------------
// classifyManagerStatus
// -----------------------------------------------------------------------------

test('classifyManagerStatus: 9/9 active+finalized → finalized', () => {
  assert.equal(classifyManagerStatus(9, 9, 9), 'finalized');
});

test('classifyManagerStatus: 0/9 active → empty', () => {
  assert.equal(classifyManagerStatus(0, 0, 9), 'empty');
});

test('classifyManagerStatus: 5/9 active → partial', () => {
  assert.equal(classifyManagerStatus(5, 0, 9), 'partial');
});

test('classifyManagerStatus: 9 active але 0 finalized → partial', () => {
  // Усі бренди заповнені реальними сумами, але жоден ще не finalized → чернетка
  assert.equal(classifyManagerStatus(9, 0, 9), 'partial');
});

test('classifyManagerStatus: 9 finalized але 0 active (всі суми 0) → empty', () => {
  // Бренди finalized у БД, але всі рядки amount=0 → читаємо як пустий
  // (intersection: finalized AND active = 0)
  assert.equal(classifyManagerStatus(0, 0, 9), 'empty');
});

test('classifyManagerStatus: 3 active з яких 2 finalized → partial', () => {
  assert.equal(classifyManagerStatus(3, 2, 9), 'partial');
});

// -----------------------------------------------------------------------------
// Інтеграція: unplanned-buyers повертає клієнтів які НЕ у plannedClientIds.
// Перевіряємо що якщо ми ВИКЛЮЧИМО amount=0 рядок з plannedClientIds Set
// (як зробить виправлена aggregate route), цей клієнт потрапить у unplanned
// коли в нього з'явиться факт.
// -----------------------------------------------------------------------------

const fakeClient = (id: string, name: string, category: Client1C['category']): Client1C => ({
  clientId: id,
  clientName: name,
  category,
  lastPurchaseDate: null,
  lastPurchaseAmount: 0,
  totalYTD: 0,
  meetingsThisMonth: 0,
  callsThisMonth: 0,
  phone: '',
  address: '',
});

const fakeFact = (clients: { id: string; name: string; amount: number }[]): SalesFactResponse => ({
  facts: [
    {
      segmentCode: 'PETARAN',
      totalAmount: clients.reduce((s, c) => s + c.amount, 0),
      totalClientCount: clients.length,
      clients: clients.map(c => ({
        clientId: c.id,
        clientName: c.name,
        amount: c.amount,
        lastSaleDate: '2026-05-01',
      })),
    },
  ],
});

test('Інтеграція: клієнт з amount=0 у плані (виключений з plannedSet) потрапляє у unplanned при факті', () => {
  const clients = [
    fakeClient('C1', 'Активний клієнт', 'active'),
    fakeClient('C2', 'Passive клієнт', 'sleeping'),
  ];
  const fact = fakeFact([
    { id: 'C1', name: 'Активний клієнт', amount: 1500 },
    { id: 'C2', name: 'Passive клієнт', amount: 800 }, // facт по passive!
  ]);

  // Імітуємо ВИПРАВЛЕНУ aggregate logic: amount=0 НЕ потрапляє у Set.
  // У плані менеджера: C1 з $1500, C2 з $0 → у Set лише C1.
  const plannedSet = new Set<string>(['C1']);

  const unplanned = getUnplannedBuyersForSegment(clients, fact, 'PETARAN', plannedSet);
  assert.equal(unplanned.length, 1, 'C2 (з amount=0 і фактом) має бути у unplanned');
  assert.equal(unplanned[0].clientId, 'C2');
  assert.equal(unplanned[0].factAmount, 800);
});

test('Інтеграція: клієнт з amount>0 у плані НЕ потрапляє у unplanned навіть з фактом', () => {
  const clients = [fakeClient('C1', 'Активний', 'active')];
  const fact = fakeFact([{ id: 'C1', name: 'Активний', amount: 1500 }]);
  const plannedSet = new Set<string>(['C1']); // у плані з реальною сумою

  const unplanned = getUnplannedBuyersForSegment(clients, fact, 'PETARAN', plannedSet);
  assert.equal(unplanned.length, 0, 'C1 у плані → не unplanned');
});

// -----------------------------------------------------------------------------
// Документуючий тест: симуляція aggregate route filter.
// Перевіряємо що totalForecast виключає amount=0 рядки.
// -----------------------------------------------------------------------------

test('Симуляція aggregate: totalForecast виключає amount=0 рядки', () => {
  // Імітуємо forecasts які повернув би Supabase
  const forecasts = [
    { user_id: 'mgr1', segment_code: 'PETARAN', client_id_1c: 'C1', forecast_amount: 1500 },
    { user_id: 'mgr1', segment_code: 'PETARAN', client_id_1c: 'C2', forecast_amount: 0 },   // passive
    { user_id: 'mgr1', segment_code: 'PETARAN', client_id_1c: 'C3', forecast_amount: 800 },
  ];

  let totalForecast = 0;
  const plannedClientIds = new Set<string>();
  for (const f of forecasts) {
    const amount = Number(f.forecast_amount) || 0;
    if (amount <= 0) continue; // ← ЦЕ і є фікс
    totalForecast += amount;
    plannedClientIds.add(f.client_id_1c);
  }

  assert.equal(totalForecast, 2300, '1500 + 800 (без C2 = 0)');
  assert.equal(plannedClientIds.size, 2);
  assert.ok(!plannedClientIds.has('C2'), 'C2 з amount=0 не у plannedClientIds');
});

test('Симуляція aggregate: clientCount виключає amount=0 клієнтів', () => {
  const forecasts = [
    { client_id_1c: 'C1', forecast_amount: 1500 },
    { client_id_1c: 'C2', forecast_amount: 0 },
    { client_id_1c: 'C3', forecast_amount: 800 },
    { client_id_1c: 'C4', forecast_amount: 0 },
  ];
  const seenClients = new Set<string>();
  for (const f of forecasts) {
    if ((Number(f.forecast_amount) || 0) <= 0) continue;
    seenClients.add(f.client_id_1c);
  }
  assert.equal(seenClients.size, 2, 'тільки C1 і C3');
});
