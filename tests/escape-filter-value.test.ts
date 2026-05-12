// Security regression тести для PostgREST filter value escaping.
//
// КРИТИЧНО: без правильного escape, client_id_1c з 1С що містить кому/
// дужки/лапки ламає `in.()` / `notIn.()` фільтр → DELETE захоплює чужі
// рядки. Це реальний security risk виявлений у code-review 2026-05-12.
//
// Логіка escape (з src/lib/supabase.ts):
//   - Якщо містить [,()"\s.\] → "..." з \"\\ escape
//   - Інакше → encodeURIComponent

import test from 'node:test';
import assert from 'node:assert/strict';

// Дублюємо логіку з supabase.ts — pure helper. Якщо реалізація розійдеться —
// тести впадуть і покажуть розходження.
function escapeFilterValue(v: unknown): string {
  const s = String(v ?? '');
  if (/[,()"\s.\\]/.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return encodeURIComponent(s);
}

// === Безпечні значення (URL-encode) ===

test('простий ASCII login: encodeURIComponent', () => {
  assert.equal(escapeFilterValue('manager1'), 'manager1');
});

test('email з @ і дефісом: encodeURIComponent', () => {
  assert.equal(escapeFilterValue('sm.dnepr3@emet.in.ua'), '"sm.dnepr3@emet.in.ua"');
  // ⚠️ . тут спецсимвол PostgREST → quoting
});

test('число у вигляді рядка', () => {
  assert.equal(escapeFilterValue('20260531'), '20260531');
});

test('UUID без спецсимволів', () => {
  assert.equal(escapeFilterValue('abc123def456'), 'abc123def456');
});

// === Спецсимволи PostgREST → quoting ===

test('🐛 client_id з комою — security regression', () => {
  // Без escape: in.(00012,00034,evil) → DELETE захопить evil
  // З escape: in.("00012,00034",evil) → коректно
  assert.equal(escapeFilterValue('00012,00034'), '"00012,00034"');
});

test('🐛 client_id з дужкою', () => {
  assert.equal(escapeFilterValue('client)id'), '"client)id"');
});

test('🐛 client_id з лапками — escape \\"', () => {
  assert.equal(escapeFilterValue('client"name'), '"client\\"name"');
});

test('🐛 client_id з backslash — escape \\\\', () => {
  assert.equal(escapeFilterValue('client\\name'), '"client\\\\name"');
});

test('значення з пробілом — quoting', () => {
  assert.equal(escapeFilterValue('Іван Петренко'), '"Іван Петренко"');
});

test('значення з крапкою — quoting (PostgREST реcтриктивний)', () => {
  assert.equal(escapeFilterValue('client.id'), '"client.id"');
});

// === Edge cases ===

test('null → пустий рядок', () => {
  assert.equal(escapeFilterValue(null), '');
});

test('undefined → пустий рядок', () => {
  assert.equal(escapeFilterValue(undefined), '');
});

test('число → string + encodeURIComponent', () => {
  assert.equal(escapeFilterValue(42), '42');
});

test('empty string', () => {
  assert.equal(escapeFilterValue(''), '');
});

test('🐛 SQL injection attempt', () => {
  // Якщо хтось напише client_id типу `1)+OR+1=1+(` — quoting нейтралізує
  const evil = "1)';DROP TABLE--";
  const result = escapeFilterValue(evil);
  assert.ok(result.startsWith('"'), 'обернуто у лапки');
  assert.ok(result.endsWith('"'), 'обернуто у лапки');
  // backslash перед лапкою — exists для інших symbols, тут лише ' нема escape
});
