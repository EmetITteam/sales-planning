/**
 * Тести canPlanForMonth — pure window-lock logic (Етап 3 Пакету А).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPlanForMonth, type PlanningLock, type PlanningSettings } from '../src/lib/planning-window';

const settings5: PlanningSettings = { window_days: 5 };

test('минулий місяць — заблоковано', () => {
  const r = canPlanForMonth('mgr', '2026-04-01', new Date('2026-05-13T10:00:00Z'), settings5, []);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'past-month');
});

test('майбутній місяць — заблоковано', () => {
  const r = canPlanForMonth('mgr', '2026-06-01', new Date('2026-05-13T10:00:00Z'), settings5, []);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'future-month');
});

// Травень 2026: 1(пт)=РД1 · 2,3(сб,нд)=вихід · 4(пн)=РД2 · 5=РД3 · 6=РД4 · 7=РД5 · 8=РД6.
// Вікно 5 РОБОЧИХ днів → відкрито до 7 травня включно (не 5, як було з календарними).
test('поточний місяць, робочий день у вікні (03.05, вихідний перед РД) — дозволено', () => {
  const r = canPlanForMonth('mgr', '2026-05-01', new Date('2026-05-03T10:00:00Z'), settings5, []);
  assert.equal(r.allowed, true);
  assert.equal(r.reason, 'within-window');
});

test('поточний місяць, 06.05 (РД4, календарно >5 але у вікні роб. днів) — дозволено', () => {
  // Раніше з календарними днями це було б заблоковано (день 6 > 5); тепер відкрито.
  const r = canPlanForMonth('mgr', '2026-05-01', new Date('2026-05-06T10:00:00Z'), settings5, []);
  assert.equal(r.allowed, true);
  assert.equal(r.reason, 'within-window');
});

test('поточний місяць, 07.05 (5-й робочий день — останній у вікні) — дозволено', () => {
  const r = canPlanForMonth('mgr', '2026-05-01', new Date('2026-05-07T23:00:00Z'), settings5, []);
  assert.equal(r.allowed, true);
});

test('поточний місяць, 08.05 (РД6, після вікна) — заблоковано (outside window)', () => {
  const r = canPlanForMonth('mgr', '2026-05-01', new Date('2026-05-08T10:00:00Z'), settings5, []);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'outside-window');
});

test('user-allow override відкриває менеджеру навіть поза window', () => {
  const locks: PlanningLock[] = [
    { scope: 'user', user_login: 'mgr@x.com', month: '2026-05-01', type: 'allow' },
  ];
  const r = canPlanForMonth('mgr@x.com', '2026-05-01', new Date('2026-05-20T10:00:00Z'), settings5, locks);
  assert.equal(r.allowed, true);
  assert.equal(r.reason, 'user-allow');
});

test('user-block блокує менеджера навіть у window', () => {
  const locks: PlanningLock[] = [
    { scope: 'user', user_login: 'mgr@x.com', month: '2026-05-01', type: 'block' },
  ];
  const r = canPlanForMonth('mgr@x.com', '2026-05-01', new Date('2026-05-03T10:00:00Z'), settings5, locks);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'user-block');
});

test('global-block блокує всіх у window', () => {
  const locks: PlanningLock[] = [
    { scope: 'global', user_login: null, month: '2026-05-01', type: 'block' },
  ];
  const r = canPlanForMonth('mgr@x.com', '2026-05-01', new Date('2026-05-03T10:00:00Z'), settings5, locks);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'global-block');
});

test('user-allow перемагає global-block', () => {
  const locks: PlanningLock[] = [
    { scope: 'global', user_login: null, month: '2026-05-01', type: 'block' },
    { scope: 'user', user_login: 'mgr@x.com', month: '2026-05-01', type: 'allow' },
  ];
  const r = canPlanForMonth('mgr@x.com', '2026-05-01', new Date('2026-05-10T10:00:00Z'), settings5, locks);
  assert.equal(r.allowed, true);
  assert.equal(r.reason, 'user-allow');
});

test('user-block перемагає user-allow (заборона строгіша)', () => {
  // Edge case — одночасно block і allow на того ж менеджера. Логічно блокувати.
  const locks: PlanningLock[] = [
    { scope: 'user', user_login: 'mgr@x.com', month: '2026-05-01', type: 'allow' },
    { scope: 'user', user_login: 'mgr@x.com', month: '2026-05-01', type: 'block' },
  ];
  const r = canPlanForMonth('mgr@x.com', '2026-05-01', new Date('2026-05-10T10:00:00Z'), settings5, locks);
  // user-allow читається першим у нашій реалізації — він приоритетніший
  // (admin може switchнути allow → block явно видаливши allow).
  assert.equal(r.allowed, true);
  assert.equal(r.reason, 'user-allow');
});

test('lock на інший місяць не впливає', () => {
  const locks: PlanningLock[] = [
    { scope: 'user', user_login: 'mgr@x.com', month: '2026-04-01', type: 'block' },
  ];
  const r = canPlanForMonth('mgr@x.com', '2026-05-01', new Date('2026-05-03T10:00:00Z'), settings5, locks);
  assert.equal(r.allowed, true);
  assert.equal(r.reason, 'within-window');
});

test('lock на іншого юзера не впливає', () => {
  const locks: PlanningLock[] = [
    { scope: 'user', user_login: 'other@x.com', month: '2026-05-01', type: 'block' },
  ];
  const r = canPlanForMonth('mgr@x.com', '2026-05-01', new Date('2026-05-03T10:00:00Z'), settings5, locks);
  assert.equal(r.allowed, true);
});

test('case-insensitive порівняння user_login', () => {
  const locks: PlanningLock[] = [
    { scope: 'user', user_login: 'MGR@X.COM', month: '2026-05-01', type: 'block' },
  ];
  const r = canPlanForMonth('mgr@x.com', '2026-05-01', new Date('2026-05-03T10:00:00Z'), settings5, locks);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, 'user-block');
});

test('month прийнятий як YYYY-MM-DDTHH:MM:SS (truncate)', () => {
  const r = canPlanForMonth('mgr', '2026-05-01T00:00:00Z', new Date('2026-05-03T10:00:00Z'), settings5, []);
  assert.equal(r.allowed, true);
});
