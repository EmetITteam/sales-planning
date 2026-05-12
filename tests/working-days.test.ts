// Тести робочих днів — формула використовується скрізь у %% (Прогноз темп,
// норма виконання). Off-by-one тут → всі цифри на дашбордах поплили.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkingDay,
  getWorkingDaysInMonth,
  getPassedWorkingDays,
  getNthWorkingDay,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — імпорт з .ts
} from '../src/lib/working-days.ts';

// === isWorkingDay ===

test('понеділок — робочий', () => {
  // 2026-05-04 = понеділок
  assert.equal(isWorkingDay(new Date(2026, 4, 4)), true);
});

test('пʼятниця — робочий', () => {
  // 2026-05-08 = пʼятниця
  assert.equal(isWorkingDay(new Date(2026, 4, 8)), true);
});

test('субота — НЕ робочий', () => {
  // 2026-05-09 = субота
  assert.equal(isWorkingDay(new Date(2026, 4, 9)), false);
});

test('неділя — НЕ робочий', () => {
  // 2026-05-10 = неділя
  assert.equal(isWorkingDay(new Date(2026, 4, 10)), false);
});

test('1 червня 2026 (Трійця-понеділок) — НЕ робочий (свято)', () => {
  assert.equal(isWorkingDay(new Date(2026, 5, 1)), false);
});

test('24 серпня 2026 (День Незалежності) — НЕ робочий', () => {
  assert.equal(isWorkingDay(new Date(2026, 7, 24)), false);
});

test('25 грудня 2026 (Різдво) — НЕ робочий', () => {
  assert.equal(isWorkingDay(new Date(2026, 11, 25)), false);
});

test('1 травня 2026 (День праці) — РОБОЧИЙ для нашої компанії', () => {
  // Підтверджено user — 1.05 рахуємо як робочий день.
  // 2026-05-01 = пʼятниця.
  assert.equal(isWorkingDay(new Date(2026, 4, 1)), true);
});

// === getWorkingDaysInMonth ===

test('травень 2026: 21 робочий день (без свят, 1.05 робочий)', () => {
  // Травень 2026: 31 день. Weekends: 2,3,9,10,16,17,23,24,30,31 = 10 днів.
  // 31 - 10 = 21 робочих. Свят немає (1.05 робочий, 31.05 — Трійця, але це неділя).
  assert.equal(getWorkingDaysInMonth(2026, 4), 21);
});

test('червень 2026: 21 робочий день (1.06 — Трійця-понеділок ВИХІДНИЙ)', () => {
  // Червень 2026: 30 днів. Weekends: 6,7,13,14,20,21,27,28 = 8 днів.
  // 30 - 8 = 22 робочих. Мінус 1.06 (Трійця) = 21.
  assert.equal(getWorkingDaysInMonth(2026, 5), 21);
});

test('серпень 2026: 20 робочих (24.08 — День Незалежності понеділок)', () => {
  // Серпень 2026: 31 день. Weekends: 1,2,8,9,15,16,22,23,29,30 = 10 днів.
  // 31 - 10 = 21 робочих. Мінус 24.08 (понеділок) = 20.
  assert.equal(getWorkingDaysInMonth(2026, 7), 20);
});

// === getPassedWorkingDays ===

test('asOfDate=10.05.2026 → 7 робочих днів пройдено', () => {
  // 1,4,5,6,7,8 = 6 робочих (1=пт, 2-3=weekend, 4-8=пн-пт)
  // 10.05 = неділя → не дає +1
  // Перевіряємо правильно: 1,4,5,6,7,8 = 6 робочих до 10-го включно
  assert.equal(getPassedWorkingDays(2026, 4, new Date(2026, 4, 10)), 6);
});

test('asOfDate=15.05.2026 (пʼятниця) → 11 робочих', () => {
  // 1,4,5,6,7,8 (6) + 11,12,13,14,15 (5) = 11
  assert.equal(getPassedWorkingDays(2026, 4, new Date(2026, 4, 15)), 11);
});

test('asOfDate < початок місяця → 0', () => {
  assert.equal(getPassedWorkingDays(2026, 4, new Date(2026, 3, 30)), 0);
});

test('asOfDate > кінець місяця → всі робочі дні', () => {
  assert.equal(getPassedWorkingDays(2026, 4, new Date(2026, 5, 15)), 21);
});

test('asOfDate = 1.05.2026 (робочий пʼятниця) → 1', () => {
  assert.equal(getPassedWorkingDays(2026, 4, new Date(2026, 4, 1)), 1);
});

// === getNthWorkingDay ===

test('1-й робочий день травня 2026 = 1.05', () => {
  const d = getNthWorkingDay(2026, 4, 1);
  assert.equal(d.getDate(), 1);
});

test('5-й робочий день травня 2026 = 7.05', () => {
  // 1,4,5,6,7 — 5-й = 7.05
  const d = getNthWorkingDay(2026, 4, 5);
  assert.equal(d.getDate(), 7);
});

test('N перевищує робочі дні → повертає останній робочий день місяця', () => {
  const d = getNthWorkingDay(2026, 4, 100);
  // Травень 2026 останній робочий = 29.05 (пʼятниця)
  assert.equal(d.getDate(), 29);
});

test('1-й робочий день червня 2026 (НЕ 1.06 бо Трійця) = 2.06', () => {
  const d = getNthWorkingDay(2026, 5, 1);
  assert.equal(d.getDate(), 2);
});
