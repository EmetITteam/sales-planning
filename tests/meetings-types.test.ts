/**
 * Tests for src/lib/meetings/types.ts adapters.
 *
 * Перевіряємо round-trip snake_case ↔ camelCase + правильне ігнорування
 * undefined у `toMeetingRowDb` (для PATCH-семантики при оновленні).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptMeetingRow,
  adaptMeetingSyncRow,
  toMeetingRowDb,
  type MeetingRowDb,
  type MeetingSyncRowDb,
  type Meeting,
} from '../src/lib/meetings/types';

const dbRow: MeetingRowDb = {
  id: '11111111-2222-3333-4444-555555555555',
  manager_login: 'ivanov@emet.in.ua',
  client_id_1c: 'К-00012345',
  date: '2026-06-03',
  time: '10:30:00',
  duration_min: 45,
  status: 'planned',
  purpose: 'Презентація ELLANSE',
  comment: null,
  planned_address: 'вул. Хорива 42, Київ',
  start_address: null,
  start_lat: null,
  start_lon: null,
  end_address: null,
  end_lat: null,
  end_lon: null,
  geo_manual: false,
  calendar_event_id: null,
  created_at: '2026-06-03T08:00:00Z',
  updated_at: '2026-06-03T08:00:00Z',
};

describe('adaptMeetingRow', () => {
  it('converts snake_case DB row to camelCase Meeting', () => {
    const m = adaptMeetingRow(dbRow);
    assert.equal(m.id, dbRow.id);
    assert.equal(m.managerLogin, 'ivanov@emet.in.ua');
    assert.equal(m.clientId1c, 'К-00012345');
    assert.equal(m.durationMin, 45);
    assert.equal(m.geoManual, false);
    assert.equal(m.calendarEventId, null);
    assert.equal(m.plannedAddress, 'вул. Хорива 42, Київ');
    assert.equal(m.createdAt, '2026-06-03T08:00:00Z');
  });

  it('preserves all null GPS-related fields when meeting just planned', () => {
    const m = adaptMeetingRow(dbRow);
    assert.equal(m.startLat, null);
    assert.equal(m.startLon, null);
    assert.equal(m.endLat, null);
    assert.equal(m.endLon, null);
    assert.equal(m.startAddress, null);
    assert.equal(m.endAddress, null);
  });

  it('handles in_progress meeting з зафіксованою геолокацією', () => {
    const inProgressRow: MeetingRowDb = {
      ...dbRow,
      status: 'in_progress',
      start_address: 'вул. Хорива 42, Київ',
      start_lat: 50.464822,
      start_lon: 30.518693,
    };
    const m = adaptMeetingRow(inProgressRow);
    assert.equal(m.status, 'in_progress');
    assert.equal(m.startAddress, 'вул. Хорива 42, Київ');
    assert.equal(m.startLat, 50.464822);
    assert.equal(m.startLon, 30.518693);
  });

  it('handles geo_manual=true (адресу ввели вручну, ADR-7)', () => {
    const manualRow: MeetingRowDb = {
      ...dbRow,
      status: 'in_progress',
      start_address: 'вул. Хорива 42, Київ',
      start_lat: null, // null коли вручну
      start_lon: null,
      geo_manual: true,
    };
    const m = adaptMeetingRow(manualRow);
    assert.equal(m.geoManual, true);
    assert.equal(m.startAddress, 'вул. Хорива 42, Київ');
    assert.equal(m.startLat, null);
  });
});

describe('adaptMeetingSyncRow', () => {
  const syncRow: MeetingSyncRowDb = {
    id: 'aaaa-bbbb-cccc',
    meeting_id: '11111111-2222-3333-4444-555555555555',
    status: 'pending',
    operation: 'save',
    payload_snapshot: { managerLogin: 'ivanov@emet.in.ua', date: '2026-06-03' },
    onec_response: null,
    failure_reason: null,
    retry_count: 0,
    next_retry_at: null,
    synced_at: null,
    created_at: '2026-06-03T08:00:00Z',
  };

  it('converts snake_case DB row to camelCase MeetingSync', () => {
    const s = adaptMeetingSyncRow(syncRow);
    assert.equal(s.id, 'aaaa-bbbb-cccc');
    assert.equal(s.meetingId, '11111111-2222-3333-4444-555555555555');
    assert.equal(s.status, 'pending');
    assert.equal(s.operation, 'save');
    assert.deepEqual(s.payloadSnapshot, { managerLogin: 'ivanov@emet.in.ua', date: '2026-06-03' });
    assert.equal(s.retryCount, 0);
    assert.equal(s.failureReason, null);
  });

  it('handles failed sync with failure_reason (ADR-9)', () => {
    const failedRow: MeetingSyncRowDb = {
      ...syncRow,
      status: 'failed',
      failure_reason: '1С: client not found',
      retry_count: 3,
      next_retry_at: '2026-06-03T09:00:00Z',
    };
    const s = adaptMeetingSyncRow(failedRow);
    assert.equal(s.status, 'failed');
    assert.equal(s.failureReason, '1С: client not found');
    assert.equal(s.retryCount, 3);
    assert.equal(s.nextRetryAt, '2026-06-03T09:00:00Z');
  });

  it('handles successful sync з onec_response', () => {
    const syncedRow: MeetingSyncRowDb = {
      ...syncRow,
      status: 'synced',
      onec_response: { status: 'success', data: { id: '1С-12345' } },
      synced_at: '2026-06-03T08:05:00Z',
    };
    const s = adaptMeetingSyncRow(syncedRow);
    assert.equal(s.status, 'synced');
    assert.deepEqual(s.onecResponse, { status: 'success', data: { id: '1С-12345' } });
    assert.equal(s.syncedAt, '2026-06-03T08:05:00Z');
  });
});

describe('toMeetingRowDb (PATCH semantics)', () => {
  it('переводить camelCase → snake_case', () => {
    const partial: Partial<Meeting> = {
      managerLogin: 'ivanov@emet.in.ua',
      clientId1c: 'К-12345',
      status: 'in_progress',
      startLat: 50.464822,
    };
    const row = toMeetingRowDb(partial);
    assert.equal(row.manager_login, 'ivanov@emet.in.ua');
    assert.equal(row.client_id_1c, 'К-12345');
    assert.equal(row.status, 'in_progress');
    assert.equal(row.start_lat, 50.464822);
  });

  it('ігнорує undefined поля (не включає у PATCH)', () => {
    // PATCH-семантика: тільки явно вказані поля → потрапляють у UPDATE.
    // undefined НЕ повинні переписувати існуючі значення на null.
    const partial: Partial<Meeting> = {
      status: 'done',
      // comment, purpose etc. — undefined → не передаємо у UPDATE
    };
    const row = toMeetingRowDb(partial);
    assert.equal(row.status, 'done');
    assert.equal('comment' in row, false);
    assert.equal('purpose' in row, false);
    assert.equal('manager_login' in row, false);
  });

  it('null явно передає (відрізняючи від undefined)', () => {
    // null означає "явно очистити поле".
    const partial: Partial<Meeting> = {
      comment: null,
      purpose: null,
    };
    const row = toMeetingRowDb(partial);
    assert.equal('comment' in row, true);
    assert.equal(row.comment, null);
    assert.equal('purpose' in row, true);
    assert.equal(row.purpose, null);
  });

  it('обробляє Finish-сценарій (start не торкаємо, end заповнюємо)', () => {
    const partial: Partial<Meeting> = {
      status: 'done',
      endAddress: 'вул. Хорива 42, Київ',
      endLat: 50.464822,
      endLon: 30.518693,
    };
    const row = toMeetingRowDb(partial);
    assert.equal(row.status, 'done');
    assert.equal(row.end_address, 'вул. Хорива 42, Київ');
    assert.equal(row.end_lat, 50.464822);
    assert.equal(row.end_lon, 30.518693);
    // start-поля не торкаємо
    assert.equal('start_address' in row, false);
    assert.equal('start_lat' in row, false);
  });
});

describe('round-trip stability', () => {
  it('adaptMeetingRow → toMeetingRowDb повертає еквівалентний снапшот', () => {
    const m = adaptMeetingRow(dbRow);
    const row2 = toMeetingRowDb(m);
    // Усі поля повинні бути присутні (бо m не має undefined)
    assert.equal(row2.id, dbRow.id);
    assert.equal(row2.manager_login, dbRow.manager_login);
    assert.equal(row2.client_id_1c, dbRow.client_id_1c);
    assert.equal(row2.date, dbRow.date);
    assert.equal(row2.time, dbRow.time);
    assert.equal(row2.status, dbRow.status);
    assert.equal(row2.geo_manual, dbRow.geo_manual);
  });
});
