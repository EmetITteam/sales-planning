import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalSegmentCode,
  cleanBrandName,
  toUICategory,
  toUkrainianChip,
  initials,
  parseMonthLabelToYM,
  isHiddenProperty,
  formatMonthLabel,
  fmtYMShort,
  lastNMonthsBefore,
} from '../src/components/clients/client-helpers';

// ─── canonicalSegmentCode ────────────────────────────────────────────────

test('canonicalSegmentCode: ДРУГИЕТМ (без пробілу) → OTHER', () => {
  assert.equal(canonicalSegmentCode('ДРУГИЕТМ'), 'OTHER');
});

test('canonicalSegmentCode: «ДРУГИЕ ТМ» (з пробілом) → OTHER', () => {
  assert.equal(canonicalSegmentCode('ДРУГИЕ ТМ'), 'OTHER');
});

test('canonicalSegmentCode: «Vitaran Cosmetics» → OTHER (prefix pattern)', () => {
  assert.equal(canonicalSegmentCode('Vitaran Cosmetics'), 'OTHER');
});

test('canonicalSegmentCode: «Vitaran БАДи» → OTHER (prefix pattern)', () => {
  assert.equal(canonicalSegmentCode('Vitaran БАДи'), 'OTHER');
});

test('canonicalSegmentCode: «IUSE Collagen» → IUSE (main)', () => {
  assert.equal(canonicalSegmentCode('IUSE Collagen'), 'IUSE');
});

test('canonicalSegmentCode: «IUSE SkinBooster» → IUSE', () => {
  assert.equal(canonicalSegmentCode('IUSE SkinBooster'), 'IUSE');
});

test('canonicalSegmentCode: bare VITARAN (без пробілу) → UPPERCASE', () => {
  assert.equal(canonicalSegmentCode('Vitaran'), 'VITARAN');
});

test('canonicalSegmentCode: leading underscore «_ELLANSE» → ELLANSE', () => {
  assert.equal(canonicalSegmentCode('_ELLANSE'), 'ELLANSE');
});

test('canonicalSegmentCode: порожній рядок → повертає raw', () => {
  assert.equal(canonicalSegmentCode(''), '');
});

// ─── cleanBrandName ─────────────────────────────────────────────────────

test('cleanBrandName: «_ESSE» → «ESSE»', () => {
  assert.equal(cleanBrandName('_ESSE'), 'ESSE');
});

test('cleanBrandName: «__Neuronox» → «Neuronox»', () => {
  assert.equal(cleanBrandName('__Neuronox'), 'Neuronox');
});

test('cleanBrandName: null/undefined → порожній рядок', () => {
  assert.equal(cleanBrandName(null), '');
  assert.equal(cleanBrandName(undefined), '');
});

// ─── toUICategory ────────────────────────────────────────────────────────

test('toUICategory: пустий → "missing" (error bucket)', () => {
  assert.equal(toUICategory(''), 'missing');
  assert.equal(toUICategory(null), 'missing');
  assert.equal(toUICategory(undefined), 'missing');
  assert.equal(toUICategory('   '), 'missing');
});

// ─── toUkrainianChip ────────────────────────────────────────────────────

test('toUkrainianChip: пустий → «Без категорії в 1С»', () => {
  assert.equal(toUkrainianChip(''), 'Без категорії в 1С');
  assert.equal(toUkrainianChip(null), 'Без категорії в 1С');
});

// ─── initials ────────────────────────────────────────────────────────────

test('initials: «Андрущук (Недолуга) Катерина» → «АН» (skip дужки)', () => {
  assert.equal(initials('Андрущук (Недолуга) Катерина'), 'АН');
});

test('initials: одне слово → одна буква', () => {
  assert.equal(initials('Шевченко'), 'Ш');
});

test('initials: пустий → «?»', () => {
  assert.equal(initials(''), '?');
  assert.equal(initials(null), '?');
  assert.equal(initials('   '), '?');
});

test('initials: латиниця', () => {
  assert.equal(initials('John Doe'), 'JD');
});

// ─── parseMonthLabelToYM ────────────────────────────────────────────────

test('parseMonthLabelToYM: «Май 2026» (RU) → 2026-05', () => {
  assert.equal(parseMonthLabelToYM('Май 2026'), '2026-05');
});

test('parseMonthLabelToYM: «Травень 2026» (UA) → 2026-05', () => {
  assert.equal(parseMonthLabelToYM('Травень 2026'), '2026-05');
});

test('parseMonthLabelToYM: «АПРЕЛЬ 2026» (UPPER) → 2026-04', () => {
  assert.equal(parseMonthLabelToYM('АПРЕЛЬ 2026'), '2026-04');
});

test('parseMonthLabelToYM: «Декабрь 2025» → 2025-12', () => {
  assert.equal(parseMonthLabelToYM('Декабрь 2025'), '2025-12');
});

test('parseMonthLabelToYM: без року → null', () => {
  assert.equal(parseMonthLabelToYM('Травень'), null);
});

test('parseMonthLabelToYM: некоректний місяць → null', () => {
  assert.equal(parseMonthLabelToYM('Hello 2026'), null);
});

test('parseMonthLabelToYM: null/undefined → null', () => {
  assert.equal(parseMonthLabelToYM(null), null);
  assert.equal(parseMonthLabelToYM(undefined), null);
});

// ─── isHiddenProperty ───────────────────────────────────────────────────

test('isHiddenProperty: «Валидный viber номер» → true', () => {
  assert.equal(isHiddenProperty('Валидный viber номер'), true);
});

test('isHiddenProperty: «Telegram канал» → false', () => {
  assert.equal(isHiddenProperty('Telegram канал'), false);
});

// ─── formatMonthLabel / fmtYMShort ──────────────────────────────────────

test('formatMonthLabel: 2026-05 → «Травень 2026»', () => {
  assert.equal(formatMonthLabel('2026-05'), 'Травень 2026');
});

test('formatMonthLabel: 2026-12 → «Грудень 2026»', () => {
  assert.equal(formatMonthLabel('2026-12'), 'Грудень 2026');
});

test('fmtYMShort: 2026-05 → «тра 2026»', () => {
  assert.equal(fmtYMShort('2026-05'), 'тра 2026');
});

test('fmtYMShort: 2026-01 → «січ 2026»', () => {
  assert.equal(fmtYMShort('2026-01'), 'січ 2026');
});

// ─── lastNMonthsBefore ──────────────────────────────────────────────────

test('lastNMonthsBefore: 2026-05, n=3 → [2026-02, 2026-03, 2026-04]', () => {
  assert.deepEqual(lastNMonthsBefore('2026-05', 3), ['2026-02', '2026-03', '2026-04']);
});

test('lastNMonthsBefore: перехід через рік (2026-02, n=3)', () => {
  assert.deepEqual(lastNMonthsBefore('2026-02', 3), ['2025-11', '2025-12', '2026-01']);
});

test('lastNMonthsBefore: 2026-01, n=1 → [2025-12]', () => {
  assert.deepEqual(lastNMonthsBefore('2026-01', 1), ['2025-12']);
});
