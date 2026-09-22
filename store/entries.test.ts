import { addScheduleRule, createInitialSchedule } from './schedule';
import {
  DuplicatePunchError,
  NoEntryToCancelError,
  cancelEntry,
  computeAchievementStreak,
  computeEntryStatus,
  computePointsBalance,
  createEmptyEntriesState,
  getDayCalendarStatus,
  isScheduleEditLockedForDate,
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

  it('does not retroactively reclassify a past date after the weekday is later turned OFF', () => {
    const pastDate = '2024-01-01';
    const dayOfWeek = new Date(2024, 0, 1).getDay() as DayOfWeek;
    let schedule = createInitialSchedule('2024-01-01');
    const entries = recordPunchIn(createEmptyEntriesState(), pastDate, 1, '06:50:00', '07:00:00');

    expect(getDayCalendarStatus(entries, schedule, pastDate)).toBe('achieved');

    schedule = addScheduleRule(schedule, {
      dayOfWeek,
      enabled: false,
      targetTime: '07:00:00',
      effectiveFrom: '2024-06-01',
    });

    expect(getDayCalendarStatus(entries, schedule, pastDate)).toBe('achieved');
  });
});

describe('computeAchievementStreak', () => {
  // 2024-01-01 is a known Monday; Saturday (dayOfWeek 6) is turned OFF from day one.
  function buildOffSaturdaySchedule() {
    let schedule = createInitialSchedule('2024-01-01');
    schedule = addScheduleRule(schedule, {
      dayOfWeek: 6,
      enabled: false,
      targetTime: '07:00:00',
      effectiveFrom: '2024-01-01',
    });
    return schedule;
  }

  function punch(entries: ReturnType<typeof createEmptyEntriesState>, date: string, localTime: string) {
    return recordPunchIn(entries, date, new Date(`${date}T${localTime}`).getTime(), localTime, '07:00:00');
  }

  it('counts consecutive achieved ON-days and skips an OFF day without breaking', () => {
    const schedule = buildOffSaturdaySchedule();
    let entries = createEmptyEntriesState();
    // Mon 01-01 .. Fri 01-05 achieved, Sat 01-06 is OFF (no entry), Sun 01-07 and Mon 01-08 achieved.
    entries = punch(entries, '2024-01-01', '06:50:00');
    entries = punch(entries, '2024-01-02', '06:50:00');
    entries = punch(entries, '2024-01-03', '06:50:00');
    entries = punch(entries, '2024-01-04', '06:50:00');
    entries = punch(entries, '2024-01-05', '06:50:00');
    entries = punch(entries, '2024-01-07', '06:50:00');
    entries = punch(entries, '2024-01-08', '06:50:00');

    expect(computeAchievementStreak(entries, schedule, '2024-01-08')).toBe(7);
  });

  it('breaks the streak on a late punch', () => {
    const schedule = buildOffSaturdaySchedule();
    let entries = createEmptyEntriesState();
    entries = punch(entries, '2024-01-01', '06:50:00');
    entries = punch(entries, '2024-01-02', '06:50:00');
    entries = punch(entries, '2024-01-03', '06:50:00');
    entries = punch(entries, '2024-01-04', '07:10:00'); // late
    entries = punch(entries, '2024-01-05', '06:50:00');
    entries = punch(entries, '2024-01-07', '06:50:00');
    entries = punch(entries, '2024-01-08', '06:50:00');

    expect(computeAchievementStreak(entries, schedule, '2024-01-08')).toBe(3);
  });

  it('breaks the streak on a missing (no-record) day', () => {
    const schedule = buildOffSaturdaySchedule();
    let entries = createEmptyEntriesState();
    entries = punch(entries, '2024-01-01', '06:50:00');
    entries = punch(entries, '2024-01-02', '06:50:00');
    entries = punch(entries, '2024-01-03', '06:50:00');
    // 01-04 intentionally has no entry
    entries = punch(entries, '2024-01-05', '06:50:00');
    entries = punch(entries, '2024-01-07', '06:50:00');
    entries = punch(entries, '2024-01-08', '06:50:00');

    expect(computeAchievementStreak(entries, schedule, '2024-01-08')).toBe(3);
  });

  it('breaks the streak when an achieved day is later cancelled', () => {
    const schedule = buildOffSaturdaySchedule();
    let entries = createEmptyEntriesState();
    entries = punch(entries, '2024-01-01', '06:50:00');
    entries = punch(entries, '2024-01-02', '06:50:00');
    entries = punch(entries, '2024-01-03', '06:50:00');
    entries = cancelEntry(entries, '2024-01-02'); // cancel the middle day of what would be a 3-day streak

    expect(computeAchievementStreak(entries, schedule, '2024-01-03')).toBe(1);
  });
});

describe('isScheduleEditLockedForDate', () => {
  it('is locked once a punch is recorded for that date', () => {
    const entries = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1, '06:50:00', '07:00:00');
    expect(isScheduleEditLockedForDate(entries, '2026-09-21')).toBe(true);
  });

  it('is unlocked when no punch has been recorded for that date', () => {
    expect(isScheduleEditLockedForDate(createEmptyEntriesState(), '2026-09-21')).toBe(false);
  });

  it('is unlocked when the recorded punch was cancelled', () => {
    const recorded = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1, '06:50:00', '07:00:00');
    const cancelled = {
      entries: { ...recorded.entries, '2026-09-21': { ...recorded.entries['2026-09-21'], cancelled: true } },
    };
    expect(isScheduleEditLockedForDate(cancelled, '2026-09-21')).toBe(false);
  });
});

describe('cancelEntry', () => {
  it('marks the entry cancelled while preserving the original punch fields', () => {
    const entries = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1000, '06:50:00', '07:00:00');
    const next = cancelEntry(entries, '2026-09-21');
    expect(next.entries['2026-09-21']).toEqual({
      date: '2026-09-21',
      punchedAtEpochMs: 1000,
      punchedAtLocalTime: '06:50:00',
      targetTimeSnapshot: '07:00:00',
      status: 'achieved',
      cancelled: true,
    });
  });

  it('does not mutate the input state', () => {
    const entries = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1000, '06:50:00', '07:00:00');
    cancelEntry(entries, '2026-09-21');
    expect(entries.entries['2026-09-21'].cancelled).toBe(false);
  });

  it('throws when there is no entry to cancel', () => {
    expect(() => cancelEntry(createEmptyEntriesState(), '2026-09-21')).toThrow(NoEntryToCancelError);
  });

  it('does not block a subsequent punch on that date (repunch is still refused by design)', () => {
    let entries = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1000, '06:50:00', '07:00:00');
    entries = cancelEntry(entries, '2026-09-21');
    expect(() => recordPunchIn(entries, '2026-09-21', 2000, '06:55:00', '07:00:00')).toThrow(
      DuplicatePunchError
    );
  });
});

describe('computePointsBalance', () => {
  it('awards 2 points per achieved day and 0 for late/no-record/no-target', () => {
    const schedule = createInitialSchedule('2026-01-01');
    let entries = createEmptyEntriesState();
    entries = recordPunchIn(entries, '2026-09-01', 1, '06:50:00', '07:00:00'); // achieved
    entries = recordPunchIn(entries, '2026-09-02', 1, '07:10:00', '07:00:00'); // late

    expect(computePointsBalance(entries, schedule)).toBe(2);
  });

  it('excludes a cancelled achieved entry from the total', () => {
    const schedule = createInitialSchedule('2026-01-01');
    let entries = recordPunchIn(createEmptyEntriesState(), '2026-09-01', 1, '06:50:00', '07:00:00');
    entries = {
      entries: { ...entries.entries, '2026-09-01': { ...entries.entries['2026-09-01'], cancelled: true } },
    };

    expect(computePointsBalance(entries, schedule)).toBe(0);
  });

  it('never goes negative', () => {
    expect(computePointsBalance(createEmptyEntriesState(), createInitialSchedule('2026-01-01'))).toBe(0);
  });
});
