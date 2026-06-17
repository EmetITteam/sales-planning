import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_OPTIONS,
  computePeriodStats,
  formatTrainingOption,
} from '../src/components/planning/planning-helpers';

// ─── STAGE_OPTIONS ──────────────────────────────────────────────────────

test('STAGE_OPTIONS contains 4 stages with icons', () => {
  assert.equal(STAGE_OPTIONS.length, 4);
  const values = STAGE_OPTIONS.map(o => o.value);
  assert.deepEqual(values, ['Дзвінок', 'Мессенджер', 'Зустріч', 'Навчання']);
  for (const opt of STAGE_OPTIONS) {
    assert.ok(opt.icon, `Stage "${opt.value}" must have an icon`);
  }
});

// ─── formatTrainingOption ───────────────────────────────────────────────

test('formatTrainingOption: basic format with date + name', () => {
  const result = formatTrainingOption({ date: '2026-05-15', trainingName: 'Ботокс intro' });
  assert.match(result, /15.05.2026.*Ботокс intro/);
});

test('formatTrainingOption: includes type prefix [Тип]', () => {
  const result = formatTrainingOption({
    date: '2026-05-15',
    trainingName: 'Workshop',
    trainingType: 'Семінар',
  });
  assert.match(result, /^\[Семінар\]/);
});

test('formatTrainingOption: truncates long names to maxNameLen + ellipsis', () => {
  const longName = 'a'.repeat(80);
  const result = formatTrainingOption({ date: '2026-05-15', trainingName: longName }, 20);
  assert.ok(result.includes('…'));
  // 20 chars + ellipsis
  const nameInResult = result.split('— ')[1];
  assert.equal(nameInResult.length, 21);
});

test('formatTrainingOption: short name not truncated', () => {
  const result = formatTrainingOption({ date: '2026-05-15', trainingName: 'Short' }, 50);
  assert.ok(!result.includes('…'));
  assert.ok(result.endsWith('Short'));
});

// ─── computePeriodStats ────────────────────────────────────────────────

test('computePeriodStats: повертає expectedAmount пропорційно робочим дням', () => {
  const stats = computePeriodStats({
    currentPeriod: { month: '2026-05-01', weekStart: '2026-05-01', weekEnd: '2026-05-15' },
    planAmount: 10000,
    factAmount: 5000,
  });
  assert.ok(stats.totalWorkingDays > 0);
  assert.ok(stats.passedWorkingDays > 0);
  assert.ok(stats.passedWorkingDays <= stats.totalWorkingDays);
  // expectedAmount = (plan / total) * passed
  const expected = (10000 / stats.totalWorkingDays) * stats.passedWorkingDays;
  assert.ok(Math.abs(stats.expectedAmount - expected) < 0.01);
});

test('computePeriodStats: planAmount=0 → expectedAmount=0', () => {
  const stats = computePeriodStats({
    currentPeriod: { month: '2026-05-01', weekStart: '2026-05-01', weekEnd: '2026-05-15' },
    planAmount: 0,
    factAmount: 0,
  });
  assert.equal(stats.expectedAmount, 0);
  assert.equal(stats.expectedPct, 0);
  assert.equal(stats.factPct, 0);
});

test('computePeriodStats: deviation = factPct - expectedPct', () => {
  const stats = computePeriodStats({
    currentPeriod: { month: '2026-05-01', weekStart: '2026-05-01', weekEnd: '2026-05-15' },
    planAmount: 10000,
    factAmount: 5000,
  });
  assert.equal(stats.deviation, stats.factPct - stats.expectedPct);
});

test('computePeriodStats: фінальний день місяця → passed = total', () => {
  // 31 травня — всі робочі дні мають пройти
  const stats = computePeriodStats({
    currentPeriod: { month: '2026-05-01', weekStart: '2026-05-25', weekEnd: '2026-05-31' },
    planAmount: 10000,
    factAmount: 10000,
  });
  assert.equal(stats.passedWorkingDays, stats.totalWorkingDays);
  // expectedAmount ≈ planAmount у останній день
  assert.equal(stats.expectedAmount, 10000);
});

test('computePeriodStats: periodLabel = UA-назва місяця', () => {
  const stats = computePeriodStats({
    currentPeriod: { month: '2026-05-01', weekStart: '2026-05-01', weekEnd: '2026-05-15' },
    planAmount: 1000,
    factAmount: 500,
  });
  // periodLabel — українська назва місяця (з getMonthName)
  assert.ok(typeof stats.periodLabel === 'string');
  assert.ok(stats.periodLabel.length > 0);
});

test('computePeriodStats: parse fallback на поточний рік якщо month-string некоректний', () => {
  // Захист від UTC bug — повертає валідний об'єкт навіть на edge-case вхід
  const stats = computePeriodStats({
    currentPeriod: { month: 'invalid', weekStart: 'invalid', weekEnd: 'invalid' },
    planAmount: 1000,
    factAmount: 0,
  });
  // Не падає
  assert.ok(stats.periodMonth instanceof Date);
});
