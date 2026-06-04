/**
 * Tests for `mapBufferOpToOneC` (Sprint 1.5.3).
 *
 * Покриває всі 5 operations + edge cases. Snapshot fixture у одному
 * місці щоб тести читались узгоджено.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mapBufferOpToOneC, type BufferSnapshot } from '../src/lib/meetings/sync-mapping';

function makeSnapshot(overrides: Partial<BufferSnapshot> = {}): BufferSnapshot {
  return {
    id: 'mid-1',
    managerLogin: 'sm.kiev4@emet.in.ua',
    clientId1c: '000123',
    date: '2026-06-04',
    time: '10:30:00',
    durationMin: 45,
    status: 'planned',
    purpose: 'Презентація ELLANSE',
    comment: null,
    plannedAddress: 'вул. Хорива 42, Київ',
    startAddress: null,
    startLat: null,
    startLon: null,
    endAddress: null,
    endLat: null,
    endLon: null,
    geoManual: false,
    ...overrides,
  };
}

describe('mapBufferOpToOneC — save', () => {
  test('returns saveNewMeeting with full newData payload', () => {
    const res = mapBufferOpToOneC('save', makeSnapshot());
    assert.ok(res);
    assert.equal(res.action, 'saveNewMeeting');
    const newData = res.payload.newData as Record<string, unknown>;
    assert.equal(newData.ID, 'mid-1');
    assert.equal(newData.ClientID, '000123');
    assert.equal(newData.Date, '2026-06-04');
    assert.equal(newData.Time, '10:30'); // sliced from 10:30:00
    assert.equal(newData.Purpose, 'Презентація ELLANSE');
    assert.equal(newData.Status, 'planned');
  });
});

describe('mapBufferOpToOneC — update / reschedule', () => {
  test('update → updateMeeting', () => {
    const res = mapBufferOpToOneC('update', makeSnapshot({ purpose: 'Інше' }));
    assert.ok(res);
    assert.equal(res.action, 'updateMeeting');
    const newData = res.payload.newData as Record<string, unknown>;
    assert.equal(newData.Purpose, 'Інше');
  });

  test('reschedule reuses updateMeeting action', () => {
    const res = mapBufferOpToOneC(
      'reschedule',
      makeSnapshot({ date: '2026-06-10', time: '14:00:00' }),
    );
    assert.ok(res);
    assert.equal(res.action, 'updateMeeting');
    const newData = res.payload.newData as Record<string, unknown>;
    assert.equal(newData.Date, '2026-06-10');
    assert.equal(newData.Time, '14:00');
  });
});

describe('mapBufferOpToOneC — start', () => {
  test('GPS-captured start: full coords + geoManual=false', () => {
    const res = mapBufferOpToOneC(
      'start',
      makeSnapshot({
        status: 'in_progress',
        startAddress: 'вул. Хорива 42, Київ',
        startLat: 50.464822,
        startLon: 30.518693,
        geoManual: false,
      }),
    );
    assert.ok(res);
    assert.equal(res.action, 'startMeeting');
    assert.equal(res.payload.meetingID, 'mid-1');
    assert.equal(res.payload.managerLogin, 'sm.kiev4@emet.in.ua');
    assert.equal(res.payload.startLat, 50.464822);
    assert.equal(res.payload.startLon, 30.518693);
    assert.equal(res.payload.startAddress, 'вул. Хорива 42, Київ');
    assert.equal(res.payload.geoManual, false);
  });

  test('manual-address start: lat/lon null, geoManual=true', () => {
    const res = mapBufferOpToOneC(
      'start',
      makeSnapshot({
        status: 'in_progress',
        startAddress: 'вручну введена адреса',
        startLat: null,
        startLon: null,
        geoManual: true,
      }),
    );
    assert.ok(res);
    assert.equal(res.payload.startLat, null);
    assert.equal(res.payload.startLon, null);
    assert.equal(res.payload.geoManual, true);
  });
});

describe('mapBufferOpToOneC — finish', () => {
  test('finish → updateMeeting with status=done + end coords', () => {
    const res = mapBufferOpToOneC(
      'finish',
      makeSnapshot({
        status: 'done',
        startAddress: 'вул. Хорива 42, Київ',
        startLat: 50.464822,
        startLon: 30.518693,
        endAddress: 'вул. Хорива 42, Київ',
        endLat: 50.464822,
        endLon: 30.518693,
      }),
    );
    assert.ok(res);
    assert.equal(res.action, 'updateMeeting');
    const newData = res.payload.newData as Record<string, unknown>;
    assert.equal(newData.Status, 'done');
    assert.equal(newData.EndLat, 50.464822);
    assert.equal(newData.EndLon, 30.518693);
  });
});

describe('mapBufferOpToOneC — null fields', () => {
  test('comment/purpose null → empty string in payload', () => {
    const res = mapBufferOpToOneC(
      'save',
      makeSnapshot({ comment: null, purpose: null, plannedAddress: null }),
    );
    assert.ok(res);
    const newData = res.payload.newData as Record<string, unknown>;
    assert.equal(newData.Comment, '');
    assert.equal(newData.Purpose, '');
    assert.equal(newData.PlannedAddress, '');
  });

  test('numeric fields kept as null (not coerced to 0)', () => {
    const res = mapBufferOpToOneC(
      'save',
      makeSnapshot({ durationMin: null, startLat: null }),
    );
    assert.ok(res);
    const newData = res.payload.newData as Record<string, unknown>;
    assert.equal(newData.DurationMin, null);
    assert.equal(newData.StartLat, null);
  });
});
