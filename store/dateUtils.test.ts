import {
  addDaysToDateKey,
  dateKeyToDayOfWeek,
  getLocalDateKey,
  getLocalTimeOfDay,
  isWithinPunchWindow,
} from './dateUtils';

describe('getLocalDateKey', () => {
  it('formats year, month, and day with zero-padding from local getters', () => {
    const d = new Date(2026, 8, 21, 23, 30, 0); // Sept 21, 2026, 23:30 local
    expect(getLocalDateKey(d)).toBe('2026-09-21');
  });

  it('zero-pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5, 0, 0, 0); // Jan 5, 2026
    expect(getLocalDateKey(d)).toBe('2026-01-05');
  });
});

describe('getLocalTimeOfDay', () => {
  it('formats hours, minutes, and seconds with zero-padding', () => {
    const d = new Date(2026, 8, 21, 6, 5, 9);
    expect(getLocalTimeOfDay(d)).toBe('06:05:09');
  });
});

describe('dateKeyToDayOfWeek', () => {
  it('resolves a known Monday', () => {
    expect(dateKeyToDayOfWeek('2024-01-01')).toBe(1); // 2024-01-01 was a Monday
  });

  it('resolves a known Sunday', () => {
    expect(dateKeyToDayOfWeek('2024-01-07')).toBe(0);
  });
});

describe('addDaysToDateKey', () => {
  it('crosses a month boundary', () => {
    expect(addDaysToDateKey('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses a year boundary', () => {
    expect(addDaysToDateKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('subtracts days across a month boundary in a non-leap February', () => {
    expect(addDaysToDateKey('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('isWithinPunchWindow', () => {
  it('accepts the boundaries 04:00:00 and 12:00:00 inclusive', () => {
    expect(isWithinPunchWindow('04:00:00')).toBe(true);
    expect(isWithinPunchWindow('12:00:00')).toBe(true);
  });

  it('rejects times just outside the window', () => {
    expect(isWithinPunchWindow('03:59:59')).toBe(false);
    expect(isWithinPunchWindow('12:00:01')).toBe(false);
  });

  it('accepts a time in the middle of the window', () => {
    expect(isWithinPunchWindow('07:30:00')).toBe(true);
  });
});
