// Pure-функції агрегації Зведеного звіту РОП.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickWorstBrand,
  rollupPromises,
  crossRegionRedZones,
  computeRopDeadline,
  workingDaysBetween,
  resolvePlanStatus,
  reportSubmissionState,
  countByTone,
} from '../src/lib/rop-report-aggregate';

// ── pickWorstBrand ───────────────────────────────────────────────────────────
test('pickWorstBrand: чистий регіон (нема червоних) → гірший бренд, без «+N»', () => {
  const r = pickWorstBrand([
    { code: 'A', name: 'A', forecastPct: 95 },
    { code: 'B', name: 'B', forecastPct: 82 },
    { code: 'C', name: 'C', forecastPct: 110 },
  ]);
  assert.equal(r.worst?.code, 'B'); // min forecastPct
  assert.equal(r.hasRed, false);
  assert.equal(r.extraRedCount, 0);
});

test('pickWorstBrand: 3 червоних → worst = найгірший, extraRedCount = 2', () => {
  const r = pickWorstBrand([
    { code: 'A', name: 'A', forecastPct: 70 },
    { code: 'B', name: 'B', forecastPct: 55 },
    { code: 'C', name: 'C', forecastPct: 78 },
    { code: 'D', name: 'D', forecastPct: 120 },
  ]);
  assert.equal(r.worst?.code, 'B'); // 55 найгірший
  assert.equal(r.hasRed, true);
  assert.equal(r.red.length, 3);
  assert.equal(r.extraRedCount, 2); // окрім показаного B
});

test('pickWorstBrand: 1 червоний → extraRedCount = 0', () => {
  const r = pickWorstBrand([
    { code: 'A', name: 'A', forecastPct: 60 },
    { code: 'B', name: 'B', forecastPct: 95 },
  ]);
  assert.equal(r.worst?.code, 'A');
  assert.equal(r.extraRedCount, 0);
});

test('pickWorstBrand: порожньо → worst null', () => {
  assert.equal(pickWorstBrand([]).worst, null);
});

// ── rollupPromises (3 стани) ─────────────────────────────────────────────────
test('rollupPromises: обіцянок не було → none', () => {
  const r = rollupPromises([{ brand: 'A', hadPromise: false, done: null }]);
  assert.equal(r.status, 'none');
  assert.equal(r.total, 0);
});

test('rollupPromises: всі виконані → yes', () => {
  const r = rollupPromises([
    { brand: 'A', hadPromise: true, done: true },
    { brand: 'B', hadPromise: true, done: true },
  ]);
  assert.equal(r.status, 'yes');
  assert.equal(r.doneCount, 2);
  assert.equal(r.total, 2);
});

test('rollupPromises: є не виконана → no + причина', () => {
  const r = rollupPromises([
    { brand: 'A', hadPromise: true, done: true },
    { brand: 'B', hadPromise: true, done: false, reason: 'відпустка', promiseText: 'дотиснути' },
  ]);
  assert.equal(r.status, 'no');
  assert.equal(r.notDone.length, 1);
  assert.equal(r.notDone[0].brand, 'B');
  assert.equal(r.notDone[0].reason, 'відпустка');
});

test('rollupPromises: обіцянки були, але жодна не відмічена → none', () => {
  const r = rollupPromises([
    { brand: 'A', hadPromise: true, done: null },
    { brand: 'B', hadPromise: true, done: null },
  ]);
  assert.equal(r.status, 'none');
  assert.equal(r.total, 2);
  assert.equal(r.doneCount, 0);
});

// ── crossRegionRedZones ──────────────────────────────────────────────────────
test('crossRegionRedZones: бренд у 4 регіонах → escalate + % по регіонах (гірші перші)', () => {
  const rows = crossRegionRedZones([
    { region: 'Одеса', redBrands: [{ name: 'Ellanse', forecastPct: 60 }, { name: 'Vitaran', forecastPct: 70 }] },
    { region: 'Дніпро', redBrands: [{ name: 'Ellanse', forecastPct: 55 }, { name: 'Petaran', forecastPct: 66 }] },
    { region: 'Харків', redBrands: [{ name: 'Ellanse', forecastPct: 72 }, { name: 'Vitaran', forecastPct: 65 }] },
    { region: 'Запоріжжя', redBrands: [{ name: 'Ellanse', forecastPct: 50 }] },
  ]);
  assert.equal(rows[0].brand, 'Ellanse');
  assert.equal(rows[0].count, 4);
  assert.equal(rows[0].escalate, true);
  assert.equal(rows[0].regions[0].region, 'Запоріжжя'); // гірший % перший
  assert.equal(rows[0].regions[0].forecastPct, 50);
  const vitaran = rows.find(r => r.brand === 'Vitaran')!;
  assert.equal(vitaran.count, 2);
  assert.equal(vitaran.escalate, false);
});

// ── дедлайн + прострочення ───────────────────────────────────────────────────
test('computeRopDeadline: липень 2026 = 06.07 16:00', () => {
  const d = computeRopDeadline('2026-07');
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 6);
  assert.equal(d.getHours(), 16);
});

test('computeRopDeadline: рік без свят кидає (2027)', () => {
  assert.throws(() => computeRopDeadline('2027-03'), /не заповнені/);
});

test('workingDaysBetween: +2 роб. дні (06→08 липня, без свят)', () => {
  // from=06.07 (пн), рахуємо ПІСЛЯ: 07.07 вт=1, 08.07 ср=2
  const n = workingDaysBetween(new Date(2026, 6, 6, 16), new Date(2026, 6, 8, 10));
  assert.equal(n, 2);
});

test('workingDaysBetween: пропускає свято 01.06 (Трійця)', () => {
  // from=29.05 пт: 30.05 сб(ні), 31.05 нд(ні), 01.06 пн-свято(ні), 02.06 вт=1
  const n = workingDaysBetween(new Date(2026, 4, 29, 16), new Date(2026, 5, 2, 10));
  assert.equal(n, 1);
});

const DL = new Date(2026, 6, 6, 16); // дедлайн 06.07 16:00

test('resolvePlanStatus: НЕМА жодного запису → not_started (не «узгоджено»!)', () => {
  const r = resolvePlanStatus({ hasAnyRecord: false, fullyFinalized: false, finalizedAt: null, deadline: DL });
  assert.equal(r.state, 'not_started');
  assert.equal(r.agreed, false);
  assert.equal(r.inTime, false);
});

test('resolvePlanStatus: є записи, не всі фіналізували → draft', () => {
  const r = resolvePlanStatus({ hasAnyRecord: true, fullyFinalized: false, finalizedAt: null, deadline: DL });
  assert.equal(r.state, 'draft');
  assert.equal(r.agreed, false);
});

test('resolvePlanStatus: повністю узгоджено у термін → in_time, 0 прострочення', () => {
  const r = resolvePlanStatus({ hasAnyRecord: true, fullyFinalized: true, finalizedAt: new Date(2026, 6, 6, 15), deadline: DL });
  assert.equal(r.state, 'in_time');
  assert.equal(r.agreed, true);
  assert.equal(r.inTime, true);
  assert.equal(r.overdueWorkingDays, 0);
});

test('resolvePlanStatus: узгоджено після дедлайну → late, +2 роб. дні', () => {
  const r = resolvePlanStatus({ hasAnyRecord: true, fullyFinalized: true, finalizedAt: new Date(2026, 6, 8, 10), deadline: DL });
  assert.equal(r.state, 'late');
  assert.equal(r.agreed, true);
  assert.equal(r.inTime, false);
  assert.equal(r.overdueWorkingDays, 2);
});

// ── reportSubmissionState (fix2: подача звіту ≠ узгодження плану) ─────────────
test('reportSubmissionState: фіналізовано → submitted', () => {
  assert.equal(reportSubmissionState(true, false), 'submitted');
  assert.equal(reportSubmissionState(true, true), 'submitted');
});

test('reportSubmissionState: НЕ фіналізовано але є замітки → partial (не приглушуємо)', () => {
  assert.equal(reportSubmissionState(false, true), 'partial');
});

test('reportSubmissionState: ні фіналізації, ні заміток → empty (звіт не подано)', () => {
  assert.equal(reportSubmissionState(false, false), 'empty');
});

// ── countByTone ──────────────────────────────────────────────────────────────
test('countByTone: розподіл по мітках', () => {
  const c = countByTone([110, 95, 82, 79, 50]); // ok, warn, warn, bad, bad
  assert.deepEqual(c, { ok: 1, warn: 2, bad: 2 });
});
