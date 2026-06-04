/**
 * Tests for `adaptOneCMeeting` — конвертер 1С PascalCase → MeetingWithSync.
 *
 * Sprint 1.5.3: hook useMeetings тепер тягне зустрічі з 1С getInitialData.
 * Цей adapter гарантує що різні легасі-формати дат/статусу/null-полів
 * нормалізуються без crash.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptOneCMeeting,
  adaptOneCMeetings,
  type OneCMeetingRow,
} from '../src/lib/meetings/onec-adapter';

describe('adaptOneCMeeting — date normalization', () => {
  test('DD.MM.YYYY → YYYY-MM-DD', () => {
    const m = adaptOneCMeeting({ ID: '1', Date: '04.06.2026' });
    assert.equal(m.date, '2026-06-04');
  });

  test('already ISO YYYY-MM-DD stays as is', () => {
    const m = adaptOneCMeeting({ ID: '1', Date: '2026-06-04' });
    assert.equal(m.date, '2026-06-04');
  });

  test('missing date → today ISO', () => {
    const m = adaptOneCMeeting({ ID: '1' });
    assert.match(m.date, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('adaptOneCMeeting — time normalization', () => {
  test('HH:MM → HH:MM:00', () => {
    const m = adaptOneCMeeting({ ID: '1', Time: '10:30' });
    assert.equal(m.time, '10:30:00');
  });

  test('HH:MM:SS stays', () => {
    const m = adaptOneCMeeting({ ID: '1', Time: '10:30:45' });
    assert.equal(m.time, '10:30:45');
  });
});

describe('adaptOneCMeeting — status enum mapping', () => {
  const cases: Array<[string, string]> = [
    ['В работе', 'in_progress'],
    ['Завершено', 'done'],
    ['Завершена', 'done'],
    ['Отмена', 'cancelled'],
    ['Отменено', 'cancelled'],
    ['Просрочено', 'postponed'],
    ['Запланировано', 'planned'],
    ['', 'planned'], // default
    ['unknown garbage', 'planned'],
  ];
  for (const [input, expected] of cases) {
    test(`«${input}» → ${expected}`, () => {
      const m = adaptOneCMeeting({ ID: '1', Status: input });
      assert.equal(m.status, expected);
    });
  }
});

describe('adaptOneCMeeting — numeric/null normalization', () => {
  test('StartLatitude as string → number', () => {
    const m = adaptOneCMeeting({ ID: '1', StartLatitude: '50.464822' });
    assert.equal(m.startLat, 50.464822);
  });

  test('StartLatitude empty string → null', () => {
    const m = adaptOneCMeeting({ ID: '1', StartLatitude: '' });
    assert.equal(m.startLat, null);
  });

  test('StartLatitude null → null', () => {
    const m = adaptOneCMeeting({ ID: '1', StartLatitude: null });
    assert.equal(m.startLat, null);
  });

  test('StartLatitude as number → number', () => {
    const m = adaptOneCMeeting({ ID: '1', StartLatitude: 50.464822 });
    assert.equal(m.startLat, 50.464822);
  });
});

describe('adaptOneCMeeting — field mapping', () => {
  test('PascalCase → camelCase повний цикл', () => {
    const row: OneCMeetingRow = {
      ID: 'mid-1',
      ClientID: '000123',
      Date: '04.06.2026',
      Time: '10:30',
      Status: 'В работе',
      Purpose: 'Презентація',
      Comment: 'нотатка',
      ManagerLogin: 'sm.kiev4@emet.in.ua',
      PlannedAddress: 'вул. Хорива 42',
      StartAddress: 'вул. Хорива 42',
      StartLatitude: 50.464822,
      StartLongitude: 30.518693,
      EndAddress: '',
      EndLatitude: null,
      EndLongitude: null,
      GeoManual: false,
      calendarEventId: 'gcal-evt-1',
    };
    const m = adaptOneCMeeting(row);
    assert.equal(m.id, 'mid-1');
    assert.equal(m.clientId1c, '000123');
    assert.equal(m.date, '2026-06-04');
    assert.equal(m.time, '10:30:00');
    assert.equal(m.status, 'in_progress');
    assert.equal(m.purpose, 'Презентація');
    assert.equal(m.comment, 'нотатка');
    assert.equal(m.managerLogin, 'sm.kiev4@emet.in.ua');
    assert.equal(m.plannedAddress, 'вул. Хорива 42');
    assert.equal(m.startLat, 50.464822);
    assert.equal(m.startLon, 30.518693);
    assert.equal(m.calendarEventId, 'gcal-evt-1');
  });
});

describe('adaptOneCMeetings — batch + filter', () => {
  test('rows без ID відкидаються', () => {
    const result = adaptOneCMeetings([
      { ID: 'a', Date: '04.06.2026' },
      { Date: '04.06.2026' }, // no ID
      { ID: 'b', Date: '05.06.2026' },
    ]);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'a');
    assert.equal(result[1].id, 'b');
  });

  test('undefined/non-array → []', () => {
    assert.deepEqual(adaptOneCMeetings(undefined), []);
  });

  test('sync status defaults to synced (вже в 1С)', () => {
    const [m] = adaptOneCMeetings([{ ID: 'x' }]);
    assert.equal(m.syncStatus, 'synced');
  });
});
