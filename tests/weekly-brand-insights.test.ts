// brandToSegment — рол-ап sales.brand → SEGMENT-код Тижневого звіту.
import test from 'node:test';
import assert from 'node:assert/strict';
import { brandToSegment } from '../src/lib/weekly-brand-insights';

test('brandToSegment — 8 ключових брендів', () => {
  assert.equal(brandToSegment('Vitaran'), 'VITARAN');
  assert.equal(brandToSegment('Petaran'), 'PETARAN');
  assert.equal(brandToSegment('EXOXE'), 'EXOXE');
  assert.equal(brandToSegment('IUSE Coll.'), 'IUSE');
});

test('brandToSegment — сегмент «Інші ТМ» (OTHER) = Vitaran Cosmetics + БАД', () => {
  assert.equal(brandToSegment('Vitaran Cosmetics'), 'OTHER'); // Exosome/Centella
  assert.equal(brandToSegment('БАД'), 'OTHER');               // Магнокс
  assert.equal(brandToSegment('щось нове'), 'OTHER');         // fallback
});
