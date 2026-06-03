/**
 * Tests для geo capture (Sprint 1.4).
 *
 * `captureGeo` сам важко тестувати без браузерного API, тому покриваємо:
 *  - `mapError` — кожен `GeolocationPositionError.code` → правильна категорія
 *  - `formatCoords` — формат
 *  - branch `unsupported` коли navigator відсутній
 *  - `applyStart` — імутабельна мутація masking зустріч у in_progress
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mapError, formatCoords, captureGeo } from '../src/lib/meetings/geo';
import { getMockMeetings, applyStart } from '../src/lib/meetings/mock-data';

describe('mapError', () => {
  test('code=1 → permission_denied', () => {
    const err = { code: 1, message: '' } as GeolocationPositionError;
    const r = mapError(err);
    assert.equal(r.reason, 'permission_denied');
    assert.ok(r.message.includes('заборонена'));
  });

  test('code=2 → position_unavailable', () => {
    const err = { code: 2, message: '' } as GeolocationPositionError;
    const r = mapError(err);
    assert.equal(r.reason, 'position_unavailable');
    assert.ok(r.message.includes('GPS'));
  });

  test('code=3 → timeout', () => {
    const err = { code: 3, message: '' } as GeolocationPositionError;
    const r = mapError(err);
    assert.equal(r.reason, 'timeout');
    assert.ok(r.message.includes('10'));
  });

  test('unknown code → position_unavailable fallback', () => {
    const err = { code: 99, message: '' } as unknown as GeolocationPositionError;
    const r = mapError(err);
    assert.equal(r.reason, 'position_unavailable');
  });
});

describe('formatCoords', () => {
  test('format with 6 decimal places', () => {
    assert.equal(formatCoords(50.464822, 30.518693), '50.464822, 30.518693');
  });

  test('rounds long decimals', () => {
    assert.equal(formatCoords(50.46482234567, 30.518693876), '50.464822, 30.518694');
  });

  test('handles negative + zero', () => {
    assert.equal(formatCoords(-12.5, 0), '-12.500000, 0.000000');
  });
});

describe('captureGeo unsupported branch', () => {
  test('returns unsupported when navigator missing', async () => {
    // У Node без браузера — navigator відсутній → unsupported branch.
    const r = await captureGeo();
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, 'unsupported');
      assert.ok(r.message.includes('вручну'));
    }
  });
});

describe('applyStart', () => {
  test('mutates target meeting to in_progress with geo fields', () => {
    const meetings = getMockMeetings();
    const planned = meetings.find(m => m.status === 'planned');
    assert.ok(planned, 'expected at least one planned meeting in fixtures');

    const next = applyStart(meetings, planned.id, {
      address: 'вул. Тест 1',
      lat: 50.1,
      lon: 30.2,
      geoManual: false,
    });

    const updated = next.find(m => m.id === planned.id);
    assert.ok(updated);
    assert.equal(updated.status, 'in_progress');
    assert.equal(updated.startAddress, 'вул. Тест 1');
    assert.equal(updated.startLat, 50.1);
    assert.equal(updated.startLon, 30.2);
    assert.equal(updated.geoManual, false);
  });

  test('manual address — lat/lon stay null, geoManual=true', () => {
    const meetings = getMockMeetings();
    const planned = meetings.find(m => m.status === 'planned');
    assert.ok(planned);

    const next = applyStart(meetings, planned.id, {
      address: 'manual addr',
      lat: null,
      lon: null,
      geoManual: true,
    });

    const updated = next.find(m => m.id === planned.id);
    assert.ok(updated);
    assert.equal(updated.startLat, null);
    assert.equal(updated.startLon, null);
    assert.equal(updated.geoManual, true);
  });

  test('unknown id → returns array with no changes (length, same refs)', () => {
    const meetings = getMockMeetings();
    const next = applyStart(meetings, 'nonexistent', {
      address: 'x',
      lat: 0,
      lon: 0,
      geoManual: false,
    });
    assert.equal(next.length, meetings.length);
    // Всі items повинні бути identity-equal (map повертає same refs якщо predicate false).
    for (let i = 0; i < meetings.length; i++) {
      assert.equal(next[i], meetings[i]);
    }
  });

  test('returns NEW array reference (immutable)', () => {
    const meetings = getMockMeetings();
    const planned = meetings.find(m => m.status === 'planned')!;
    const next = applyStart(meetings, planned.id, {
      address: 'x',
      lat: 1,
      lon: 1,
      geoManual: false,
    });
    assert.notEqual(next, meetings);
    // Original meetings array не змінилось
    assert.equal(meetings.find(m => m.id === planned.id)?.status, 'planned');
  });
});
