import type { DateKey, Entry, EntriesState, EntryStatus, TimeOfDay, WeeklyScheduleState } from './types';
import { dateKeyToDayOfWeek } from './dateUtils';
import { getEffectiveRule } from './schedule';

export function createEmptyEntriesState(): EntriesState {
  return { entries: {} };
}

export class DuplicatePunchError extends Error {}

// String comparison is valid here because both operands are zero-padded
// "HH:MM:SS" of equal width, so lexicographic order matches chronological order.
export function computeEntryStatus(punchedAtLocalTime: TimeOfDay, targetTime: TimeOfDay): EntryStatus {
  return punchedAtLocalTime <= targetTime ? 'achieved' : 'late';
}

export function recordPunchIn(
  state: EntriesState,
  date: DateKey,
  punchedAtEpochMs: number,
  punchedAtLocalTime: TimeOfDay,
  targetTimeSnapshot: TimeOfDay
): EntriesState {
  if (state.entries[date]) {
    throw new DuplicatePunchError(`Entry for ${date} already exists`);
  }
  const entry: Entry = {
    date,
    punchedAtEpochMs,
    punchedAtLocalTime,
    targetTimeSnapshot,
    status: computeEntryStatus(punchedAtLocalTime, targetTimeSnapshot),
    cancelled: false,
  };
  return { entries: { ...state.entries, [date]: entry } };
}

export function getDayCalendarStatus(
  entries: EntriesState,
  schedule: WeeklyScheduleState,
  date: DateKey
): 'achieved' | 'late' | 'no-record' | 'no-target' {
  const rule = getEffectiveRule(schedule, dateKeyToDayOfWeek(date), date);
  if (!rule || !rule.enabled) return 'no-target';
  const entry = entries.entries[date];
  if (!entry || entry.cancelled) return 'no-record';
  return entry.status;
}
