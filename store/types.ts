export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // matches Date.getDay(): 0 = Sunday

export type DateKey = string; // "YYYY-MM-DD", zero-padded, local calendar date

export type TimeOfDay = string; // "HH:MM:SS", zero-padded, 24-hour local time

export interface ScheduleRule {
  dayOfWeek: DayOfWeek;
  enabled: boolean;
  targetTime: TimeOfDay; // only meaningful when enabled === true
  effectiveFrom: DateKey; // inclusive start date this rule applies from
}

export interface WeeklyScheduleState {
  rules: ScheduleRule[]; // append-only; never mutate or remove existing entries
}

export type EntryStatus = 'achieved' | 'late';

export interface Entry {
  date: DateKey;
  punchedAtEpochMs: number;
  punchedAtLocalTime: TimeOfDay;
  targetTimeSnapshot: TimeOfDay; // the target time in effect at punch time, frozen forever
  status: EntryStatus;
  cancelled: boolean; // set by the parent-only cancel flow (T12); always false when recorded
}

export interface EntriesState {
  entries: Record<DateKey, Entry>; // at most one Entry per date
}
