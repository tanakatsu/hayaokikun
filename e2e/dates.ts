// A known week fully inside September 2026 (Mon 2026-09-21 .. and beyond),
// so multi-day scenarios never cross a calendar-month boundary —
// react-native-calendars hides days from adjacent months, which would break
// test-id lookups for those cells (see calendar.spec.ts).
const YEAR = 2026;
const MONTH = 8; // September, 0-indexed for the Date constructor

function day(offsetFromMonday: number): number {
  return 21 + offsetFromMonday;
}

export function at(offsetFromMonday: number, hh: number, mm: number, ss = 0): Date {
  return new Date(YEAR, MONTH, day(offsetFromMonday), hh, mm, ss);
}

export function dateKey(offsetFromMonday: number): string {
  return `${YEAR}-09-${String(day(offsetFromMonday)).padStart(2, '0')}`;
}

// Matches the calendar day cell's testID (app/calendar.tsx).
export function calendarDayTestId(offsetFromMonday: number): string {
  return `calendar-day-${dateKey(offsetFromMonday)}`;
}

// offsetFromMonday -> DayOfWeek, matching JS Date#getDay() (0 = Sunday).
export const OFFSET = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6, MON2: 7 } as const;
export const DOW = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 0 } as const;
