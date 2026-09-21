import { addScheduleRule, createInitialSchedule } from './schedule';
import {
  DuplicatePunchError,
  computeEntryStatus,
  createEmptyEntriesState,
  getDayCalendarStatus,
  recordPunchIn,
} from './entries';
import type { DayOfWeek } from './types';

describe('computeEntryStatus', () => {
  it('is achieved when punched exactly at the target second', () => {
    expect(computeEntryStatus('07:00:00', '07:00:00')).toBe('achieved');
  });

  it('is achieved when punched one second early', () => {
    expect(computeEntryStatus('06:59:59', '07:00:00')).toBe('achieved');
  });

  it('is late when punched one second after the target', () => {
    expect(computeEntryStatus('07:00:01', '07:00:00')).toBe('late');
  });
});

describe('recordPunchIn', () => {
  it('records a new entry with the given snapshot and computed status', () => {
    const state = createEmptyEntriesState();
    const next = recordPunchIn(state, '2026-09-21', 1000, '06:50:00', '07:00:00');
    expect(next.entries['2026-09-21']).toEqual({
      date: '2026-09-21',
      punchedAtEpochMs: 1000,
      punchedAtLocalTime: '06:50:00',
      targetTimeSnapshot: '07:00:00',
      status: 'achieved',
      cancelled: false,
    });
  });

  it('rejects a second punch on the same date', () => {
    const state = createEmptyEntriesState();
    const next = recordPunchIn(state, '2026-09-21', 1000, '06:50:00', '07:00:00');
    expect(() => recordPunchIn(next, '2026-09-21', 2000, '06:55:00', '07:00:00')).toThrow(
      DuplicatePunchError
    );
  });

  it('does not mutate the input state', () => {
    const state = createEmptyEntriesState();
    recordPunchIn(state, '2026-09-21', 1000, '06:50:00', '07:00:00');
    expect(state.entries['2026-09-21']).toBeUndefined();
  });
});

describe('getDayCalendarStatus', () => {
  it('is no-target when the day is disabled', () => {
    const schedule = createInitialSchedule('2026-01-01');
    // Disable whatever weekday 2026-09-21 actually falls on, rather than
    // relying on a memorized (and error-prone) 2026 weekday lookup.
    const dayOfWeek = new Date(2026, 8, 21).getDay() as DayOfWeek;
    const disabledSchedule = addScheduleRule(schedule, {
      dayOfWeek,
      enabled: false,
      targetTime: '07:00:00',
      effectiveFrom: '2026-01-01',
    });
    expect(getDayCalendarStatus(createEmptyEntriesState(), disabledSchedule, '2026-09-21')).toBe(
      'no-target'
    );
  });

  it('is no-record when the day is enabled but has no entry', () => {
    const schedule = createInitialSchedule('2026-01-01');
    expect(getDayCalendarStatus(createEmptyEntriesState(), schedule, '2026-09-21')).toBe(
      'no-record'
    );
  });

  it('is achieved or late based on the recorded entry', () => {
    const schedule = createInitialSchedule('2026-01-01');
    const achieved = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1, '06:50:00', '07:00:00');
    expect(getDayCalendarStatus(achieved, schedule, '2026-09-21')).toBe('achieved');

    const late = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1, '07:10:00', '07:00:00');
    expect(getDayCalendarStatus(late, schedule, '2026-09-21')).toBe('late');
  });

  it('is no-record when the recorded entry was cancelled by a parent', () => {
    const schedule = createInitialSchedule('2026-01-01');
    const recorded = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1, '06:50:00', '07:00:00');
    // Cancellation itself is implemented in T12; this only checks that
    // getDayCalendarStatus already honors the flag the Entry type carries.
    const cancelled = {
      entries: { ...recorded.entries, '2026-09-21': { ...recorded.entries['2026-09-21'], cancelled: true } },
    };
    expect(getDayCalendarStatus(cancelled, schedule, '2026-09-21')).toBe('no-record');
  });
});
