import { addScheduleRule, createInitialSchedule } from './schedule';
import {
  DuplicatePunchError,
  EntryOutOfEditWindowError,
  InvalidEditTimeError,
  NoEntryToCancelError,
  NoTargetForDateError,
  isWithinParentEditWindow,
  setEntryTimeByParent,
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
    entries = cancelEntry(entries, '2024-01-02', '2024-01-03'); // cancel the middle day of what would be a 3-day streak

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
    const next = cancelEntry(entries, '2026-09-21', '2026-09-21');
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
    cancelEntry(entries, '2026-09-21', '2026-09-21');
    expect(entries.entries['2026-09-21'].cancelled).toBe(false);
  });

  it('throws when there is no entry to cancel', () => {
    expect(() => cancelEntry(createEmptyEntriesState(), '2026-09-21', '2026-09-21')).toThrow(NoEntryToCancelError);
  });

  it('does not block a subsequent punch on that date (repunch is still refused by design)', () => {
    let entries = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1000, '06:50:00', '07:00:00');
    entries = cancelEntry(entries, '2026-09-21', '2026-09-21');
    expect(() => recordPunchIn(entries, '2026-09-21', 2000, '06:55:00', '07:00:00')).toThrow(
      DuplicatePunchError
    );
  });
});

describe('computePointsBalance', () => {
  it('awards 1 point per achieved day and 0 for late/no-record/no-target', () => {
    const schedule = createInitialSchedule('2026-01-01');
    let entries = createEmptyEntriesState();
    entries = recordPunchIn(entries, '2026-09-01', 1, '06:50:00', '07:00:00'); // achieved
    entries = recordPunchIn(entries, '2026-09-02', 1, '07:10:00', '07:00:00'); // late

    expect(computePointsBalance(entries, schedule)).toBe(1);
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

describe('cancelEntry edit window', () => {
  it('throws for a date older than the parent edit window', () => {
    const entries = recordPunchIn(createEmptyEntriesState(), '2026-09-17', 1, '06:50:00', '07:00:00');
    expect(() => cancelEntry(entries, '2026-09-17', '2026-09-25')).toThrow(EntryOutOfEditWindowError);
  });

  it('allows the oldest date inside the window', () => {
    const entries = recordPunchIn(createEmptyEntriesState(), '2026-09-18', 1, '06:50:00', '07:00:00');
    expect(cancelEntry(entries, '2026-09-18', '2026-09-25').entries['2026-09-18'].cancelled).toBe(true);
  });
});

describe('isWithinParentEditWindow', () => {
  it('includes today and exactly 7 days ago', () => {
    expect(isWithinParentEditWindow('2026-09-25', '2026-09-25')).toBe(true);
    expect(isWithinParentEditWindow('2026-09-18', '2026-09-25')).toBe(true);
  });

  it('excludes 8 days ago and any future date', () => {
    expect(isWithinParentEditWindow('2026-09-17', '2026-09-25')).toBe(false);
    expect(isWithinParentEditWindow('2026-09-26', '2026-09-25')).toBe(false);
  });

  it('works across a month boundary', () => {
    expect(isWithinParentEditWindow('2026-09-28', '2026-10-02')).toBe(true);
  });
});

describe('setEntryTimeByParent', () => {
  // Friday 2026-09-25 07:00:00 local. Every weekday targets 06:30 (defaults).
  const NOW = new Date(2026, 8, 25, 7, 0, 0);
  const schedule = createInitialSchedule('2026-01-01');

  it('adds a missing entry using the target in effect that day', () => {
    const next = setEntryTimeByParent(createEmptyEntriesState(), schedule, '2026-09-24', '06:20', NOW);
    expect(next.entries['2026-09-24']).toEqual({
      date: '2026-09-24',
      punchedAtEpochMs: new Date(2026, 8, 24, 6, 20, 0).getTime(),
      punchedAtLocalTime: '06:20:00',
      targetTimeSnapshot: '06:30:00',
      status: 'achieved',
      cancelled: false,
      editedByParent: true,
    });
  });

  it('marks an entry achieved at exactly the target and late one minute after', () => {
    const at = setEntryTimeByParent(createEmptyEntriesState(), schedule, '2026-09-24', '06:30:00', NOW);
    const after = setEntryTimeByParent(createEmptyEntriesState(), schedule, '2026-09-24', '06:31:00', NOW);
    expect(at.entries['2026-09-24'].status).toBe('achieved');
    expect(after.entries['2026-09-24'].status).toBe('late');
  });

  it('edits a child punch, keeping its target snapshot and original time', () => {
    const punched = recordPunchIn(createEmptyEntriesState(), '2026-09-24', 1, '06:42:15', '06:40:00');
    const next = setEntryTimeByParent(punched, schedule, '2026-09-24', '06:35:00', NOW);
    expect(next.entries['2026-09-24']).toMatchObject({
      punchedAtLocalTime: '06:35:00',
      targetTimeSnapshot: '06:40:00',
      status: 'achieved',
      editedByParent: true,
      originalPunchedAtLocalTime: '06:42:15',
    });
  });

  it('never overwrites the original time on a second edit', () => {
    const punched = recordPunchIn(createEmptyEntriesState(), '2026-09-24', 1, '06:42:15', '06:30:00');
    const once = setEntryTimeByParent(punched, schedule, '2026-09-24', '06:35:00', NOW);
    const twice = setEntryTimeByParent(once, schedule, '2026-09-24', '06:10:00', NOW);
    expect(twice.entries['2026-09-24'].originalPunchedAtLocalTime).toBe('06:42:15');
    expect(twice.entries['2026-09-24'].punchedAtLocalTime).toBe('06:10:00');
  });

  it('does not invent an original time when editing a parent-added entry', () => {
    const added = setEntryTimeByParent(createEmptyEntriesState(), schedule, '2026-09-24', '06:20:00', NOW);
    const edited = setEntryTimeByParent(added, schedule, '2026-09-24', '06:25:00', NOW);
    expect(edited.entries['2026-09-24'].originalPunchedAtLocalTime).toBeUndefined();
  });

  it('restores a cancelled entry', () => {
    const punched = recordPunchIn(createEmptyEntriesState(), '2026-09-24', 1, '06:20:00', '06:30:00');
    const cancelled = cancelEntry(punched, '2026-09-24', '2026-09-25');
    const restored = setEntryTimeByParent(cancelled, schedule, '2026-09-24', '06:20:00', NOW);
    expect(restored.entries['2026-09-24'].cancelled).toBe(false);
    expect(getDayCalendarStatus(restored, schedule, '2026-09-24')).toBe('achieved');
  });

  it('rejects dates outside the edit window', () => {
    const empty = createEmptyEntriesState();
    expect(() => setEntryTimeByParent(empty, schedule, '2026-09-17', '06:20:00', NOW)).toThrow(EntryOutOfEditWindowError);
    expect(() => setEntryTimeByParent(empty, schedule, '2026-09-26', '06:20:00', NOW)).toThrow(EntryOutOfEditWindowError);
  });

  it('rejects a day whose rule is OFF', () => {
    const offThursday = addScheduleRule(schedule, {
      dayOfWeek: 4,
      enabled: false,
      targetTime: '06:30:00',
      effectiveFrom: '2026-01-01',
    });
    expect(() =>
      setEntryTimeByParent(createEmptyEntriesState(), offThursday, '2026-09-24', '06:20:00', NOW)
    ).toThrow(NoTargetForDateError);
  });

  it('rejects times outside the punch window', () => {
    const empty = createEmptyEntriesState();
    expect(() => setEntryTimeByParent(empty, schedule, '2026-09-24', '04:59:00', NOW)).toThrow(InvalidEditTimeError);
    expect(() => setEntryTimeByParent(empty, schedule, '2026-09-24', '08:01:00', NOW)).toThrow(InvalidEditTimeError);
  });

  it('rejects a time later than now for today, but accepts now itself', () => {
    const empty = createEmptyEntriesState();
    expect(() => setEntryTimeByParent(empty, schedule, '2026-09-25', '07:01:00', NOW)).toThrow(InvalidEditTimeError);
    expect(setEntryTimeByParent(empty, schedule, '2026-09-25', '07:00:00', NOW).entries['2026-09-25'].status).toBe('late');
  });

  it('does not mutate the input state', () => {
    const empty = createEmptyEntriesState();
    setEntryTimeByParent(empty, schedule, '2026-09-24', '06:20:00', NOW);
    expect(empty.entries['2026-09-24']).toBeUndefined();
  });
});

describe('entries saved before parent correction existed', () => {
  it('read and classify exactly as before', () => {
    const legacy = {
      entries: {
        '2026-09-24': {
          date: '2026-09-24',
          punchedAtEpochMs: 1,
          punchedAtLocalTime: '06:20:00',
          targetTimeSnapshot: '06:30:00',
          status: 'achieved' as const,
          cancelled: false,
        },
      },
    };
    expect(getDayCalendarStatus(legacy, createInitialSchedule('2026-01-01'), '2026-09-24')).toBe('achieved');
    expect(legacy.entries['2026-09-24']).not.toHaveProperty('editedByParent');
  });
});
