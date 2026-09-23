import { DEFAULT_TARGET_TIME, MAX_TARGET_TIME, MIN_TARGET_TIME } from './config';
import {
  InvalidTargetTimeError,
  addScheduleRule,
  createInitialSchedule,
  getEffectiveRule,
  isValidTargetTime,
} from './schedule';
import type { WeeklyScheduleState } from './types';

describe('createInitialSchedule', () => {
  it('creates one enabled rule per weekday at the default target time', () => {
    const schedule = createInitialSchedule('2026-01-01');
    expect(schedule.rules).toHaveLength(7);
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
      const rule = schedule.rules.find((r) => r.dayOfWeek === dayOfWeek);
      expect(rule).toEqual({
        dayOfWeek,
        enabled: true,
        targetTime: DEFAULT_TARGET_TIME,
        effectiveFrom: '2026-01-01',
      });
    }
  });
});

describe('isValidTargetTime', () => {
  it('accepts the boundaries', () => {
    expect(isValidTargetTime(MIN_TARGET_TIME)).toBe(true);
    expect(isValidTargetTime(MAX_TARGET_TIME)).toBe(true);
  });

  it('rejects times outside the boundaries', () => {
    expect(isValidTargetTime('03:59:59')).toBe(false);
    expect(isValidTargetTime('12:00:01')).toBe(false);
  });
});

describe('addScheduleRule', () => {
  it('rejects an enabled rule with an out-of-range target time', () => {
    const schedule = createInitialSchedule('2026-01-01');
    expect(() =>
      addScheduleRule(schedule, {
        dayOfWeek: 6,
        enabled: true,
        targetTime: '13:00:00',
        effectiveFrom: '2026-06-01',
      })
    ).toThrow(InvalidTargetTimeError);
  });

  it('does not validate target time for a disabled rule', () => {
    const schedule = createInitialSchedule('2026-01-01');
    expect(() =>
      addScheduleRule(schedule, {
        dayOfWeek: 6,
        enabled: false,
        targetTime: '13:00:00',
        effectiveFrom: '2026-06-01',
      })
    ).not.toThrow();
  });

  it('appends without mutating the original schedule object', () => {
    const schedule = createInitialSchedule('2026-01-01');
    const next = addScheduleRule(schedule, {
      dayOfWeek: 6,
      enabled: false,
      targetTime: '07:00:00',
      effectiveFrom: '2026-06-01',
    });
    expect(schedule.rules).toHaveLength(7);
    expect(next.rules).toHaveLength(8);
  });
});

describe('getEffectiveRule', () => {
  let schedule: WeeklyScheduleState;

  beforeEach(() => {
    schedule = createInitialSchedule('2024-01-01');
    schedule = addScheduleRule(schedule, {
      dayOfWeek: 6, // Saturday
      enabled: false,
      targetTime: '07:00:00',
      effectiveFrom: '2024-06-01',
    });
  });

  it('uses the original rule for a date before the change', () => {
    const rule = getEffectiveRule(schedule, 6, '2024-05-15');
    expect(rule?.enabled).toBe(true);
  });

  it('uses the new rule for a date on or after the change', () => {
    const rule = getEffectiveRule(schedule, 6, '2024-06-01');
    expect(rule?.enabled).toBe(false);
    const later = getEffectiveRule(schedule, 6, '2024-12-31');
    expect(later?.enabled).toBe(false);
  });

  it('returns undefined when no rule exists yet for that date', () => {
    expect(getEffectiveRule(schedule, 6, '2023-12-31')).toBeUndefined();
  });

  it('prefers the later-added rule when two rules share the same effectiveFrom', () => {
    let s = createInitialSchedule('2024-01-01'); // Saturday enabled, effectiveFrom 2024-01-01
    s = addScheduleRule(s, {
      dayOfWeek: 6,
      enabled: false,
      targetTime: '07:00:00',
      effectiveFrom: '2024-01-01', // same-day correction
    });
    expect(getEffectiveRule(s, 6, '2024-01-01')?.enabled).toBe(false);
  });
});
