// Guard незаповнених свят + розрахунок N-го робочого дня (дедлайн звіту РОП).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isHolidayYearConfigured,
  assertHolidaysConfigured,
  getNthWorkingDay,
} from '../src/lib/working-days';

test('isHolidayYearConfigured: 2026 заповнено, 2027 порожньо, 2099 відсутній', () => {
  assert.equal(isHolidayYearConfigured(2026), true);   // має свята
  assert.equal(isHolidayYearConfigured(2027), false);  // placeholder (порожній Set)
  assert.equal(isHolidayYearConfigured(2099), false);  // немає у мапі
});

test('assertHolidaysConfigured: 2026 ок, 2027/2099 кидають', () => {
  assert.doesNotThrow(() => assertHolidaysConfigured(2026));
  assert.throws(() => assertHolidaysConfigured(2027), /не заповнені/);
  assert.throws(() => assertHolidaysConfigured(2099), /не заповнені/);
});

test('getNthWorkingDay: 4-й роб. день червня 2026 = 05.06 (1.06 свято → зсув)', () => {
  // Червень 2026: 01.06 (пн) — свято (Трійця перенесена) → не рахується.
  // 02.06 вт = 1-й, 03.06 = 2-й, 04.06 = 3-й, 05.06 пт = 4-й робочий день.
  const d = getNthWorkingDay(2026, 5, 4); // month 5 = червень (0-indexed)
  assert.equal(d.getMonth(), 5);
  assert.equal(d.getDate(), 5);
});

test('getNthWorkingDay: 4-й роб. день липня 2026 = 06.07 (без свят, 1.07 ср)', () => {
  // Липень 2026: 01.07 ср = 1-й, 02.07 = 2-й, 03.07 пт = 3-й, 06.07 пн = 4-й
  // (04-05 — вихідні). Свят у липні немає.
  const d = getNthWorkingDay(2026, 6, 4); // month 6 = липень
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 6);
});
