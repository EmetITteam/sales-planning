/**
 * Tests for mock-data helpers used by /meetings dashboard (Sprint 1.2).
 *
 * Перевіряємо: computeStats, groupMeetingsByDate, formatDayLabel.
 * Mock-data сам — за `Meeting` типом, тому коли swap на реальний `useMeetings`,
 * ті ж самі helpers працюють без змін.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getMockMeetings,
  computeStats,
  groupMeetingsByDate,
  formatDayLabel,
} from '../src/lib/meetings/mock-data';

const today = new Date();
today.setHours(12, 0, 0, 0);

describe('getMockMeetings', () => {
  it('returns 9 meetings with stable structure', () => {
    const all = getMockMeetings();
    assert.equal(all.length, 9);
    for (const m of all) {
      assert.ok(m.id);
      assert.ok(m.clientId1c);
      assert.match(m.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(m.time, /^\d{2}:\d{2}:\d{2}$/);
    }
  });

  it('contains at least one of each interesting state', () => {
    const all = getMockMeetings();
    assert.ok(all.some(m => m.status === 'in_progress'), 'expect in_progress for UI demo');
    assert.ok(all.some(m => m.status === 'done'), 'expect done');
    assert.ok(all.some(m => m.status === 'postponed'), 'expect postponed');
    assert.ok(all.some(m => m.syncStatus === 'failed'), 'expect one failed sync for ADR-9 demo');
  });
});

describe('computeStats', () => {
  it('counts today vs total + status breakdown', () => {
    const all = getMockMeetings();
    const stats = computeStats(all, today);
    assert.equal(stats.total, 9);
    assert.equal(stats.today, 6, 'mock-data розкидав 6 на сьогодні');
    assert.equal(stats.todayInProgress, 1);
    assert.equal(stats.todayCompleted, 1);
    assert.ok(stats.todayPlanned >= 3); // 4 planned today (1 з них failed sync)
    assert.equal(stats.needsFix, 1, 'один failed sync у mock');
  });

  it('weekCompleted рахує усі done у наборі', () => {
    const all = getMockMeetings();
    const stats = computeStats(all, today);
    const expected = all.filter(m => m.status === 'done').length;
    assert.equal(stats.weekCompleted, expected);
  });
});

describe('groupMeetingsByDate', () => {
  it('groups by date ascending, sorts by time within group', () => {
    const all = getMockMeetings();
    const groups = groupMeetingsByDate(all);
    assert.equal(groups.length, 3, 'today, tomorrow, day after');
    // груп упорядковані по date ASC
    const dates = groups.map(g => g.date);
    const sorted = [...dates].sort();
    assert.deepEqual(dates, sorted);
    // кожна група відсортована по time ASC
    for (const g of groups) {
      const times = g.items.map(m => m.time);
      const sortedTimes = [...times].sort();
      assert.deepEqual(times, sortedTimes);
    }
  });

  it('empty input → empty groups', () => {
    assert.deepEqual(groupMeetingsByDate([]), []);
  });
});

describe('formatDayLabel', () => {
  it('marks today as «Сьогодні»', () => {
    const todayStr = today.toISOString().slice(0, 10);
    const { label, isToday } = formatDayLabel(todayStr, today);
    assert.equal(isToday, true);
    assert.ok(label.startsWith('Сьогодні'));
  });

  it('marks tomorrow as «Завтра»', () => {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const { label, isToday } = formatDayLabel(tomorrowStr, today);
    assert.equal(isToday, false);
    assert.ok(label.startsWith('Завтра'));
  });

  it('future date uses generic format (no «Сьогодні»/«Завтра»)', () => {
    const future = new Date(today);
    future.setDate(today.getDate() + 5);
    const futureStr = future.toISOString().slice(0, 10);
    const { label, isToday } = formatDayLabel(futureStr, today);
    assert.equal(isToday, false);
    assert.ok(!label.includes('Сьогодні'));
    assert.ok(!label.includes('Завтра'));
  });
});
