import { buildMarkedStatusesForMonth, buildPunchTimesForMonth } from '../app/calendar';
import { cancelEntry, createEmptyEntriesState, recordPunchIn } from '../store/entries';
import { createInitialSchedule, addScheduleRule } from '../store/schedule';
import type { DayOfWeek } from '../store/types';

describe('buildMarkedStatusesForMonth', () => {
  it('maps every day in the month to its calendar status', () => {
    const schedule = createInitialSchedule('2026-01-01');
    const entries = recordPunchIn(createEmptyEntriesState(), '2026-09-05', 1, '06:50:00', '07:00:00');
    const marked = buildMarkedStatusesForMonth(entries, schedule, 2026, 9);

    expect(Object.keys(marked)).toHaveLength(30);
    expect(marked['2026-09-05']).toBe('achieved');
    expect(marked['2026-09-06']).toBe('no-record');
  });

  it('marks an OFF weekday as no-target for every occurrence in the month', () => {
    let schedule = createInitialSchedule('2026-01-01');
    const sundayDayOfWeek = new Date(2026, 8, 6).getDay() as DayOfWeek; // 2026-09-06 is a Sunday
    schedule = addScheduleRule(schedule, {
      dayOfWeek: sundayDayOfWeek,
      enabled: false,
      targetTime: '07:00:00',
      effectiveFrom: '2026-01-01',
    });
    const marked = buildMarkedStatusesForMonth(createEmptyEntriesState(), schedule, 2026, 9);

    expect(marked['2026-09-06']).toBe('no-target');
    expect(marked['2026-09-13']).toBe('no-target'); // the following Sunday
  });
});

describe('buildPunchTimesForMonth', () => {
  it('formats punch times as H:MM without a leading zero on the hour', () => {
    let entries = recordPunchIn(createEmptyEntriesState(), '2026-09-05', 1, '06:05:59', '07:00:00');
    entries = recordPunchIn(entries, '2026-09-07', 2, '10:30:00', '07:00:00');
    const times = buildPunchTimesForMonth(entries, 2026, 9);

    expect(times).toEqual({ '2026-09-05': '6:05', '2026-09-07': '10:30' });
  });

  it('omits cancelled entries and entries outside the month', () => {
    let entries = recordPunchIn(createEmptyEntriesState(), '2026-09-05', 1, '06:50:00', '07:00:00');
    entries = cancelEntry(entries, '2026-09-05', '2026-09-05');
    entries = recordPunchIn(entries, '2026-10-01', 2, '06:50:00', '07:00:00');

    expect(buildPunchTimesForMonth(entries, 2026, 9)).toEqual({});
  });
});
