/**
 * Тести Etапу 1 Пакету А: admin role + safeRole + adaptLogin override.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeRole } from '../src/lib/types';
import { adaptLogin } from '../src/lib/onec-adapters';
import { ADMIN_LOGINS, isPlanningWritesAllowed } from '../src/lib/feature-flags';

test('safeRole за замовч. ВІДКИДАЄ admin (захист від ескалації через userMeta)', () => {
  // 'admin' валідна роль, але safeRole без allowAdmin=true її відкидає,
  // щоб не дозволити Director-у записати admin-роль чужому менеджеру.
  assert.equal(safeRole('admin'), 'manager');
});

test('safeRole з allowAdmin=true приймає admin', () => {
  assert.equal(safeRole('admin', 'manager', true), 'admin');
});

test('safeRole відхиляє superadmin → fallback manager', () => {
  assert.equal(safeRole('superadmin'), 'manager');
});

test('safeRole відхиляє owner → fallback manager', () => {
  assert.equal(safeRole('owner'), 'manager');
});

test('safeRole приймає director / rm / manager', () => {
  assert.equal(safeRole('director'), 'director');
  assert.equal(safeRole('rm'), 'rm');
  assert.equal(safeRole('manager'), 'manager');
});

test('adaptLogin переписує роль на admin для itd@emet.in.ua', () => {
  const session = adaptLogin({
    auth: true,
    login: 'itd@emet.in.ua',
    fullName: 'Test',
    roleCode: 'manager',
    region: '',
    regionCode: '',
    managedUsers: [],
  } as any);
  assert.equal(session.role, 'admin');
});

test('adaptLogin НЕ переписує роль звичайного менеджера', () => {
  const session = adaptLogin({
    auth: true,
    login: 'boyko.olha@emet.in.ua',
    fullName: 'Бойко О.',
    roleCode: 'manager',
    region: 'Київ',
    regionCode: 'KYV',
    managedUsers: [],
  } as any);
  assert.equal(session.role, 'manager');
});

test('adaptLogin працює з різним регістром у логіні (case-insensitive)', () => {
  const session = adaptLogin({
    auth: true,
    login: 'ITD@EMET.IN.UA',
    fullName: 'Test',
    roleCode: 'manager',
    region: '',
    regionCode: '',
    managedUsers: [],
  } as any);
  assert.equal(session.login, 'itd@emet.in.ua');
  assert.equal(session.role, 'admin');
});

test('ADMIN_LOGINS містить itd@emet.in.ua і нічого зайвого', () => {
  assert.deepEqual([...ADMIN_LOGINS], ['itd@emet.in.ua']);
});

test('isPlanningWritesAllowed пропускає admin login незалежно від case', () => {
  assert.equal(isPlanningWritesAllowed('itd@emet.in.ua'), true);
  assert.equal(isPlanningWritesAllowed('ITD@emet.in.ua'), true);
  assert.equal(isPlanningWritesAllowed(' itd@emet.in.ua '), true);
});

test('isPlanningWritesAllowed блокує не-admin логіни', () => {
  assert.equal(isPlanningWritesAllowed('boyko.olha@emet.in.ua'), false);
  assert.equal(isPlanningWritesAllowed('sdu@emet.in.ua'), false);
  assert.equal(isPlanningWritesAllowed(null), false);
  assert.equal(isPlanningWritesAllowed(undefined), false);
  assert.equal(isPlanningWritesAllowed(''), false);
});
