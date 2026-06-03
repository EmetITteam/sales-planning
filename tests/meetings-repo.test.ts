/**
 * Тести для meetings repo (Sprint 1.5.1).
 *
 * Без реального Supabase: ловимо ранній exit `listMeetings` при невалідному
 * логіні (без `@`) — це гарантія що ownership-фільтр обов'язковий.
 *
 * Повна integration-перевірка repo — у Sprint 1.5.2 разом з useMeetings
 * через preview-deploy.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { listMeetings } from '../src/lib/meetings/repo';
import { adaptMeetingRow, toMeetingRowDb, type MeetingRowDb } from '../src/lib/meetings/types';

describe('listMeetings ownership guard', () => {
  test('rejects empty managerLogin', async () => {
    const { data, error } = await listMeetings('');
    assert.deepEqual(data, []);
    assert.match(error ?? '', /managerLogin/);
  });

  test('rejects malformed managerLogin (no @)', async () => {
    const { data, error } = await listMeetings('not-an-email');
    assert.deepEqual(data, []);
    assert.match(error ?? '', /managerLogin/);
  });
});

describe('adapters round-trip', () => {
  test('toMeetingRowDb omits undefined fields (partial update support)', () => {
    const row = toMeetingRowDb({ status: 'in_progress', startLat: 50.1 });
    assert.equal(row.status, 'in_progress');
    assert.equal(row.start_lat, 50.1);
    assert.equal('manager_login' in row, false);
    assert.equal('client_id_1c' in row, false);
  });

  test('adaptMeetingRow snake_case → camelCase', () => {
    const dbRow: MeetingRowDb = {
      id: 'abc',
      manager_login: 'm@emet.in.ua',
      client_id_1c: 'CL-1',
      date: '2026-06-03',
      time: '10:30:00',
      duration_min: 45,
      status: 'planned',
      purpose: null,
      comment: null,
      planned_address: null,
      start_address: null,
      start_lat: null,
      start_lon: null,
      end_address: null,
      end_lat: null,
      end_lon: null,
      geo_manual: false,
      calendar_event_id: null,
      created_at: '2026-06-03T10:00:00Z',
      updated_at: '2026-06-03T10:00:00Z',
    };
    const m = adaptMeetingRow(dbRow);
    assert.equal(m.managerLogin, 'm@emet.in.ua');
    assert.equal(m.clientId1c, 'CL-1');
    assert.equal(m.geoManual, false);
    assert.equal(m.calendarEventId, null);
  });

  test('toMeetingRowDb preserves null distinctly from undefined', () => {
    // Null треба зберігати (clear field) — undefined треба пропустити (partial patch).
    const row = toMeetingRowDb({ comment: null, plannedAddress: undefined });
    assert.equal(row.comment, null);
    assert.equal('planned_address' in row, false);
  });
});
