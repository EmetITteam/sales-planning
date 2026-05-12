// Security regression тести для PostgREST filter value escaping.
//
// Дві pure-функції з src/lib/supabase.ts:
// 1. eq/lt — простий encodeURIComponent (PostgREST приймає decoded)
// 2. in/notIn — escapeListValue: quoting якщо є кома/дужка/лапка/backslash
//
// Раніше була єдина quoted-функція що ламала GET .eq() для emails з .
// (PostgREST для quoted eq має інший синтаксис → запит повертав 0 рядків →
// save переписував дані з нуля → втрачались зміни менеджера).

import test from 'node:test';
import assert from 'node:assert/strict';

// Дублюємо логіку з supabase.ts — pure helpers.
function escapeEqValue(v: unknown): string {
  return encodeURIComponent(String(v));
}

function escapeListValue(v: unknown): string {
  const s = String(v ?? '');
  if (/[,()"\\]/.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return encodeURIComponent(s);
}

// === eq/lt: простий URL-encode ===

test('eq: простий ASCII', () => {
  assert.equal(escapeEqValue('manager1'), 'manager1');
});

test('eq: email з @ і крапкою (РАНІШЕ ЛАМАЛОСЯ)', () => {
  // КРИТИЧНО: цей формат МАЄ працювати, бо всі user_id у БД — emails.
  // Якщо escape оборачує у "..." → PostgREST не знаходить → save регресія.
  assert.equal(escapeEqValue('rm.zp@emet.in.ua'), 'rm.zp%40emet.in.ua');
});

test('eq: число → string', () => {
  assert.equal(escapeEqValue(42), '42');
});

test('eq: ID з YYYYMMDD форматом', () => {
  assert.equal(escapeEqValue('20260531'), '20260531');
});

test('eq: bool', () => {
  assert.equal(escapeEqValue(true), 'true');
});

// === escapeListValue (in/notIn) ===

test('in: простий ASCII — без quoting', () => {
  assert.equal(escapeListValue('manager1'), 'manager1');
});

test('in: email з @ і крапкою — БЕЗ quoting (тільки url-encode)', () => {
  // У list контексті крапка не розділювач — quoting НЕ потрібен.
  assert.equal(escapeListValue('rm.zp@emet.in.ua'), 'rm.zp%40emet.in.ua');
});

test('🐛 in: client_id з комою — quoting (security regression)', () => {
  // Без quoting: in.(00012,00034,evil) → DELETE захопить evil
  // З quoting: in.("00012,00034",evil) → коректно
  assert.equal(escapeListValue('00012,00034'), '"00012,00034"');
});

test('🐛 in: client_id з дужкою — quoting', () => {
  assert.equal(escapeListValue('client)id'), '"client)id"');
});

test('🐛 in: client_id з лапками — escape \\"', () => {
  assert.equal(escapeListValue('client"name'), '"client\\"name"');
});

test('🐛 in: client_id з backslash — escape \\\\', () => {
  assert.equal(escapeListValue('client\\name'), '"client\\\\name"');
});

test('in: число у list', () => {
  assert.equal(escapeListValue(42), '42');
});

test('in: null/undefined → пустий рядок', () => {
  assert.equal(escapeListValue(null), '');
  assert.equal(escapeListValue(undefined), '');
});

test('🐛 SQL injection attempt — нейтралізується quoting', () => {
  const evil = "1)';DROP TABLE--";
  const result = escapeListValue(evil);
  assert.ok(result.startsWith('"'), 'обернуто у лапки');
  assert.ok(result.endsWith('"'), 'обернуто у лапки');
});
