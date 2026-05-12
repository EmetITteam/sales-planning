// Тести для monthly canonical period_id helpers.
//
// Менеджер планує МІСЯЦЬ. Тижневий фільтр у дашборді — лише для розрахунку
// expected % (working days passed). Планові дані ВСІ зберігаються у канонічному
// monthly period_id (week_end = last_day_of_month).
//
// Раніше дані розкидались по тижневим period_id (20260503, 20260510, 20260517,
// 20260531) → переключення фільтру тиждень↔місяць показувало різні цифри.

import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyPidFromMonth, monthlyPidFromAnyPid, monthlyPeriodMeta, weekEndToId } from '../src/lib/periods';

test('monthlyPidFromMonth: травень 2026 → 20260531', () => {
  assert.equal(monthlyPidFromMonth('2026-05-01'), 20260531);
  assert.equal(monthlyPidFromMonth('2026-05-15'), 20260531);
  assert.equal(monthlyPidFromMonth('2026-05'), 20260531);
});

test('monthlyPidFromMonth: квітень 2026 (30 днів) → 20260430', () => {
  assert.equal(monthlyPidFromMonth('2026-04-01'), 20260430);
  assert.equal(monthlyPidFromMonth('2026-04-15'), 20260430);
  assert.equal(monthlyPidFromMonth('2026-04'), 20260430);
});

test('monthlyPidFromMonth: лютий 2026 (28 днів — невисокосний) → 20260228', () => {
  assert.equal(monthlyPidFromMonth('2026-02-01'), 20260228);
});

test('monthlyPidFromMonth: лютий 2024 (29 днів — високосний) → 20240229', () => {
  assert.equal(monthlyPidFromMonth('2024-02-01'), 20240229);
});

test('monthlyPidFromMonth: грудень → 20XX1231', () => {
  assert.equal(monthlyPidFromMonth('2026-12-01'), 20261231);
});

test('monthlyPidFromMonth: будь-який день місяця дає той самий monthly pid', () => {
  // Це і є інваріант. ВСІ тижневі дати у травні 2026 ремаппяться у 20260531.
  const expected = 20260531;
  for (const d of ['2026-05-01', '2026-05-03', '2026-05-10', '2026-05-17', '2026-05-24', '2026-05-31']) {
    assert.equal(monthlyPidFromMonth(d), expected, `failed for ${d}`);
  }
});

test('monthlyPidFromMonth: invalid input → throws', () => {
  assert.throws(() => monthlyPidFromMonth('not-a-date'));
  assert.throws(() => monthlyPidFromMonth(''));
});

test('monthlyPeriodMeta: повертає валідні week_start/end/month', () => {
  const m = monthlyPeriodMeta('2026-05-15');
  assert.equal(m.id, 20260531);
  assert.equal(m.weekStart, '2026-05-01');
  assert.equal(m.weekEnd, '2026-05-31');
  assert.equal(m.month, '2026-05-01');
});

test('monthlyPeriodMeta: квітень 2026 (30 днів)', () => {
  const m = monthlyPeriodMeta('2026-04-01');
  assert.equal(m.id, 20260430);
  assert.equal(m.weekStart, '2026-04-01');
  assert.equal(m.weekEnd, '2026-04-30');
  assert.equal(m.month, '2026-04-01');
});

test('monthlyPeriodMeta: id збігається з weekEndToId(weekEnd)', () => {
  for (const month of ['2026-01-01', '2026-02-01', '2026-04-01', '2026-12-01']) {
    const m = monthlyPeriodMeta(month);
    assert.equal(m.id, weekEndToId(m.weekEnd), `mismatch for ${month}`);
  }
});

test('monthlyPidFromAnyPid: weekly pid 20260510 → monthly 20260531 (pure)', () => {
  // Це і є фікс після M7: SELECT periods.month WHERE id=20260510 повертав
  // null (запис видалено), і fallback тримав rawPid → запит forecasts ходив
  // у неіснуючий pid → дашборд показував всі плани = 0.
  assert.equal(monthlyPidFromAnyPid(20260510), 20260531);
  assert.equal(monthlyPidFromAnyPid(20260503), 20260531);
  assert.equal(monthlyPidFromAnyPid(20260517), 20260531);
  assert.equal(monthlyPidFromAnyPid(20260524), 20260531);
  assert.equal(monthlyPidFromAnyPid(20260531), 20260531); // already monthly
});

test('monthlyPidFromAnyPid: квітень → 20260430 (30 днів)', () => {
  assert.equal(monthlyPidFromAnyPid(20260415), 20260430);
  assert.equal(monthlyPidFromAnyPid(20260430), 20260430);
});

test('monthlyPidFromAnyPid: лютий невисокосний → 20260228', () => {
  assert.equal(monthlyPidFromAnyPid(20260214), 20260228);
});

test('monthlyPidFromAnyPid: лютий високосний 2024 → 20240229', () => {
  assert.equal(monthlyPidFromAnyPid(20240214), 20240229);
});

test('monthlyPidFromAnyPid: legacy / non-YYYYMMDD pid → повертає як є', () => {
  // Старі sequential id (1,2,3,...,42) не мають формату YYYYMMDD.
  // Не транслюємо — повертаємо як є, щоб caller міг fallback на SELECT periods.
  assert.equal(monthlyPidFromAnyPid(42), 42);
  assert.equal(monthlyPidFromAnyPid(0), 0);
  assert.equal(monthlyPidFromAnyPid(-5), -5);
  assert.equal(monthlyPidFromAnyPid(19990101), 19990101); // before 2020
  assert.equal(monthlyPidFromAnyPid(20261301), 20261301); // bad month
  assert.equal(monthlyPidFromAnyPid(20260132), 20260132); // bad day
});

test('🐛 РЕГРЕСІЯ: фільтр тиждень↔місяць НЕ повинен міняти monthly pid', () => {
  // Це баг який і виправляли: дашборд показував різні % бо запит ходив у різні
  // period_id. Тепер усі тижневі/місячні фільтри одного місяця → один pid.
  const weeklyFilters = ['2026-05-03', '2026-05-10', '2026-05-17', '2026-05-24', '2026-05-31'];
  const pids = weeklyFilters.map(d => monthlyPidFromMonth(d));
  const unique = new Set(pids);
  assert.equal(unique.size, 1, `все травневі фільтри мають дати 1 monthly pid, отримано: ${[...unique]}`);
  assert.equal([...unique][0], 20260531);
});
