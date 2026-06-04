/**
 * Tests for `mapBufferOpToOneC` (Sprint 1.5.3).
 *
 * Покриває всі 5 operations + edge cases. Shape узгоджено з
 * meeting-app/js/meetings.js (production legacy).
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
  test('saveNewMeeting receives meeting payload directly (not wrapped)', () => {
    const res = mapBufferOpToOneC('save', makeSnapshot());
    assert.ok(res);
    assert.equal(res.action, 'saveNewMeeting');
    // payload IS the meeting (not {newData: meeting})
    const meeting = res.payload as Record<string, unknown>;
    assert.equal(meeting.ID, 'mid-1');
    assert.equal(meeting.ClientID, '000123');
    // Date у 1С форматі DD.MM.YYYY
    assert.equal(meeting.Date, '04.06.2026');
    assert.equal(meeting.Time, '10:30');
    assert.equal(meeting.Purpose, 'Презентація ELLANSE');
    assert.equal(meeting.Status, 'planned');
  });

  test('locationData / endLocationData are nested objects', () => {
    const res = mapBufferOpToOneC(
      'save',
      makeSnapshot({
        startAddress: 'вул. Хорива 42',
        startLat: 50.464822,
        startLon: 30.518693,
      }),
    );
    assert.ok(res);
    const meeting = res.payload as Record<string, unknown>;
    const loc = meeting.locationData as Record<string, unknown>;
    assert.equal(loc.address, 'вул. Хорива 42');
    assert.equal(loc.lat, 50.464822);
    assert.equal(loc.lon, 30.518693);
    // empty endLocationData (нічого не зафіксовано)
    const endLoc = meeting.endLocationData as Record<string, unknown>;
    assert.equal(endLoc.address, '');
    assert.equal(endLoc.lat, '');
  });
});

describe('mapBufferOpToOneC — update / reschedule / finish', () => {
  test('update → updateMeeting with {newData, oldData}', () => {
    const res = mapBufferOpToOneC('update', makeSnapshot({ purpose: 'Інше' }));
    assert.ok(res);
    assert.equal(res.action, 'updateMeeting');
    assert.ok('newData' in (res.payload as object));
    assert.ok('oldData' in (res.payload as object));
    const newData = (res.payload as { newData: Record<string, unknown> }).newData;
    assert.equal(newData.Purpose, 'Інше');
  });

  test('reschedule reuses updateMeeting', () => {
    const res = mapBufferOpToOneC(
      'reschedule',
      makeSnapshot({ date: '2026-06-10', time: '14:00:00' }),
    );
    assert.ok(res);
    assert.equal(res.action, 'updateMeeting');
    const newData = (res.payload as { newData: Record<string, unknown> }).newData;
    assert.equal(newData.Date, '10.06.2026');
    assert.equal(newData.Time, '14:00');
  });

  test('finish → updateMeeting з status=done + endLocationData', () => {
    const res = mapBufferOpToOneC(
      'finish',
      makeSnapshot({
        status: 'done',
        endAddress: 'вул. Хорива 42, Київ',
        endLat: 50.464822,
        endLon: 30.518693,
      }),
    );
    assert.ok(res);
    assert.equal(res.action, 'updateMeeting');
    const newData = (res.payload as { newData: Record<string, unknown> }).newData;
    assert.equal(newData.Status, 'done');
    const endLoc = newData.endLocationData as Record<string, unknown>;
    assert.equal(endLoc.address, 'вул. Хорива 42, Київ');
    assert.equal(endLoc.lat, 50.464822);
  });
});

describe('mapBufferOpToOneC — start', () => {
  test('startMeeting payload is {meetingId, locationData}', () => {
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
    assert.equal(res.payload.meetingId, 'mid-1');
    const loc = res.payload.locationData as Record<string, unknown>;
    assert.equal(loc.address, 'вул. Хорива 42, Київ');
    assert.equal(loc.lat, 50.464822);
    assert.equal(loc.lon, 30.518693);
  });

  test('manual-address start: lat/lon empty strings', () => {
    const res = mapBufferOpToOneC(
      'start',
      makeSnapshot({
        startAddress: 'вручну введена адреса',
        startLat: null,
        startLon: null,
        geoManual: true,
      }),
    );
    assert.ok(res);
    const loc = res.payload.locationData as Record<string, unknown>;
    // null лат/лон → empty string як у meeting-app
    assert.equal(loc.lat, '');
    assert.equal(loc.lon, '');
    assert.equal(loc.address, 'вручну введена адреса');
  });
});

describe('mapBufferOpToOneC — empty/null fields', () => {
  test('comment/purpose null → empty string', () => {
    const res = mapBufferOpToOneC(
      'save',
      makeSnapshot({ comment: null, purpose: null, plannedAddress: null }),
    );
    assert.ok(res);
    const meeting = res.payload as Record<string, unknown>;
    assert.equal(meeting.Comment, '');
    assert.equal(meeting.Purpose, '');
    assert.equal(meeting.PlannedAddress, '');
  });
});
