// Єдине правило статус-мітки (звіт РМ + звіт РОП). Пороги мають лишатись
// незмінними: ≥100 В ПЛАНІ · 80–99 РИЗИК · <80 ВІДСТАВАННЯ. «Червоний» = <80.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isRed, statusTone, statusBadge } from '../src/lib/status-badge';

test('isRed: <80 = червоний', () => {
  assert.equal(isRed(79.9), true);
  assert.equal(isRed(0), true);
  assert.equal(isRed(80), false);
  assert.equal(isRed(100), false);
  assert.equal(isRed(150), false);
});

test('statusTone: пороги 100/80', () => {
  assert.equal(statusTone(100), 'ok');
  assert.equal(statusTone(120), 'ok');
  assert.equal(statusTone(99.9), 'warn');
  assert.equal(statusTone(80), 'warn');
  assert.equal(statusTone(79.9), 'bad');
  assert.equal(statusTone(0), 'bad');
});

test('statusBadge: label + tone за порогами', () => {
  assert.equal(statusBadge(100).label, 'В ПЛАНІ');
  assert.equal(statusBadge(100).tone, 'ok');
  assert.equal(statusBadge(85).label, 'РИЗИК');
  assert.equal(statusBadge(85).tone, 'warn');
  assert.equal(statusBadge(50).label, 'ВІДСТАВАННЯ');
  assert.equal(statusBadge(50).tone, 'bad');
});

test('statusBadge: межа 80 = РИЗИК (не ВІДСТАВАННЯ)', () => {
  assert.equal(statusBadge(80).label, 'РИЗИК');
  assert.equal(statusBadge(79.99).label, 'ВІДСТАВАННЯ');
});
