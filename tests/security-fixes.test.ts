// Тести для P0 security/regression фіксів (2026-05-12).
//
// Покриває:
//   1. safeRole — ENUM validation для user role
//   2. CSRF — sec-fetch-site='none' дозволено лише для GET/HEAD
//   3. store merge — period filter reset логіка коли persisted stale

import test from 'node:test';
import assert from 'node:assert/strict';
import { safeRole } from '../src/lib/types';

// ═══ #1 safeRole — ENUM validation ═══

test('safeRole: валідні ролі повертаються як є', () => {
  assert.equal(safeRole('manager'), 'manager');
  assert.equal(safeRole('rm'), 'rm');
  assert.equal(safeRole('director'), 'director');
});

test('safeRole: спроби ескалації → fallback manager', () => {
  assert.equal(safeRole('superadmin'), 'manager');
  assert.equal(safeRole('admin'), 'manager');
  assert.equal(safeRole('owner'), 'manager');
  assert.equal(safeRole('root'), 'manager');
  assert.equal(safeRole(''), 'manager');
});

test('safeRole: невалідні типи → fallback', () => {
  assert.equal(safeRole(null), 'manager');
  assert.equal(safeRole(undefined), 'manager');
  assert.equal(safeRole(123), 'manager');
  assert.equal(safeRole({}), 'manager');
  assert.equal(safeRole(['director']), 'manager');
  assert.equal(safeRole(true), 'manager');
});

test('safeRole: кастомний fallback (наприклад rm)', () => {
  assert.equal(safeRole('superadmin', 'rm'), 'rm');
  assert.equal(safeRole(null, 'director'), 'director');
});

test('safeRole: case-sensitive (не приймає Manager / DIRECTOR)', () => {
  assert.equal(safeRole('Manager'), 'manager', 'Великі літери → fallback');
  assert.equal(safeRole('DIRECTOR'), 'manager');
  assert.equal(safeRole('RM'), 'manager');
});

test('🐛 SECURITY: Director не може записати «superadmin» через userMeta', () => {
  // Симуляція: Director через drill-down save planning з body.userMeta.role
  const maliciousPayload = { role: 'superadmin', fullName: 'Victim' };
  const safeProfile = {
    role: safeRole(maliciousPayload.role, 'manager'),
  };
  assert.equal(safeProfile.role, 'manager', 'НЕ записує superadmin');
  assert.notEqual(safeProfile.role, 'director', 'НЕ ескалує до director');
});

// ═══ #2 CSRF — sec-fetch-site логіка (симуляція validateApiRequest) ═══

interface CsrfDecision {
  acceptSecFetchSite: boolean;
  reason?: string;
}

// Симулюємо логіку з api-auth.ts:
function csrfCheck(sfSite: string | null, method: string): CsrfDecision {
  const isWrite = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method.toUpperCase());
  if (sfSite === 'same-origin' || sfSite === 'same-site') return { acceptSecFetchSite: true };
  if (sfSite === 'none' && !isWrite) return { acceptSecFetchSite: true, reason: 'none allowed for read' };
  return { acceptSecFetchSite: false };
}

test('CSRF: same-origin POST → OK', () => {
  assert.equal(csrfCheck('same-origin', 'POST').acceptSecFetchSite, true);
});

test('CSRF: same-site POST → OK', () => {
  assert.equal(csrfCheck('same-site', 'POST').acceptSecFetchSite, true);
});

test('CSRF: none GET → OK (закладка / адресний рядок)', () => {
  assert.equal(csrfCheck('none', 'GET').acceptSecFetchSite, true);
});

test('CSRF: none HEAD → OK', () => {
  assert.equal(csrfCheck('none', 'HEAD').acceptSecFetchSite, true);
});

test('🐛 CSRF: none POST → REJECTED (CSRF mitigation)', () => {
  // Phishing-сторінка з form action на наш API + cookie auto-sent
  // → браузер ставить sec-fetch-site=none → без захисту POST пройшов би
  assert.equal(csrfCheck('none', 'POST').acceptSecFetchSite, false, 'POST з none ВІДХИЛЯЄТЬСЯ');
});

test('🐛 CSRF: none PATCH/PUT/DELETE → REJECTED', () => {
  assert.equal(csrfCheck('none', 'PATCH').acceptSecFetchSite, false);
  assert.equal(csrfCheck('none', 'PUT').acceptSecFetchSite, false);
  assert.equal(csrfCheck('none', 'DELETE').acceptSecFetchSite, false);
});

test('CSRF: cross-site POST → REJECTED (треба API key)', () => {
  assert.equal(csrfCheck('cross-site', 'POST').acceptSecFetchSite, false);
});

test('CSRF: method case-insensitive', () => {
  assert.equal(csrfCheck('none', 'post').acceptSecFetchSite, false);
  assert.equal(csrfCheck('none', 'Get').acceptSecFetchSite, true);
});

// ═══ #3 Store merge — period filter stale detection ═══

interface PeriodInfo { id: number; weekStart: string; weekEnd: string; month: string; isActive: boolean }

// Симулюємо логіку merge() з store.ts
function shouldResetPeriod(persisted: PeriodInfo, today: string, defaultPeriod: PeriodInfo): boolean {
  if (!persisted) return false;
  const persistedMonth = persisted.month?.slice(0, 7);
  const defaultMonth = defaultPeriod.month.slice(0, 7);
  const persistedWeekEnd = persisted.weekEnd;
  const lastDayOfPersistedMonth = persistedMonth
    ? new Date(parseInt(persistedMonth.slice(0, 4), 10), parseInt(persistedMonth.slice(5, 7), 10), 0)
        .toISOString().slice(0, 10)
    : '';
  const isWholeMonth = persistedWeekEnd === lastDayOfPersistedMonth;
  return persistedMonth !== defaultMonth || persistedWeekEnd > today || isWholeMonth;
}

const def: PeriodInfo = { id: 20260510, weekStart: '2026-05-01', weekEnd: '2026-05-10', month: '2026-05-01', isActive: false };

test('store merge: той самий тиждень як default → НЕ reset', () => {
  const persisted = { ...def };
  assert.equal(shouldResetPeriod(persisted, '2026-05-12', def), false);
});

test('store merge: інший місяць → reset', () => {
  const persisted: PeriodInfo = { id: 20260430, weekStart: '2026-04-01', weekEnd: '2026-04-30', month: '2026-04-01', isActive: false };
  assert.equal(shouldResetPeriod(persisted, '2026-05-12', def), true);
});

test('store merge: weekEnd у майбутньому → reset', () => {
  const persisted: PeriodInfo = { id: 20260524, weekStart: '2026-05-01', weekEnd: '2026-05-24', month: '2026-05-01', isActive: false };
  assert.equal(shouldResetPeriod(persisted, '2026-05-12', def), true);
});

test('🐛 store merge: «Весь травень» persisted → reset на default тиждень', () => {
  // Це і є regression-сценарій: user вибрав «Весь травень» вчора, сьогодні
  // має побачити дефолтний тиждень, а не залишковий "Весь травень".
  const persisted: PeriodInfo = { id: 20260531, weekStart: '2026-05-01', weekEnd: '2026-05-31', month: '2026-05-01', isActive: false };
  assert.equal(shouldResetPeriod(persisted, '2026-05-12', def), true, 'whole-month detected as stale');
});

test('store merge: грудень → лютий (стик року)', () => {
  const dec: PeriodInfo = { id: 20251225, weekStart: '2025-12-01', weekEnd: '2025-12-25', month: '2025-12-01', isActive: false };
  const febDef: PeriodInfo = { id: 20260208, weekStart: '2026-02-01', weekEnd: '2026-02-08', month: '2026-02-01', isActive: false };
  assert.equal(shouldResetPeriod(dec, '2026-02-09', febDef), true);
});

test('store merge: «Весь грудень» (31.12) detected as stale', () => {
  const wholeDec: PeriodInfo = { id: 20251231, weekStart: '2025-12-01', weekEnd: '2025-12-31', month: '2025-12-01', isActive: false };
  // Якщо сьогодні 25.12.2025 — той самий місяць як default. Whole-month має reset-итись.
  const today = '2025-12-25';
  const defDec: PeriodInfo = { id: 20251214, weekStart: '2025-12-01', weekEnd: '2025-12-14', month: '2025-12-01', isActive: false };
  assert.equal(shouldResetPeriod(wholeDec, today, defDec), true, '«Весь місяць» завжди reset');
});
