import type { DateKey, Entry, EntriesState, EntryStatus, TimeOfDay, WeeklyScheduleState } from './types';
import { addDaysToDateKey, dateKeyToDayOfWeek } from './dateUtils';
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

export class NoEntryToCancelError extends Error {}

export function cancelEntry(state: EntriesState, date: DateKey): EntriesState {
  const entry = state.entries[date];
  if (!entry) {
    throw new NoEntryToCancelError(`No entry for ${date} to cancel`);
  }
  if (entry.cancelled) return state; // idempotent
  return { entries: { ...state.entries, [date]: { ...entry, cancelled: true } } };
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

const POINTS_PER_ACHIEVED_DAY = 1;

export function computePointsBalance(entries: EntriesState, schedule: WeeklyScheduleState): number {
  let total = 0;
  for (const date of Object.keys(entries.entries)) {
    if (getDayCalendarStatus(entries, schedule, date) === 'achieved') {
      total += POINTS_PER_ACHIEVED_DAY;
    }
  }
  return Math.max(0, total);
}

// Defensive cap so a schedule with no history yet (or a huge gap) can't
// spin forever; ~10 years of daily lookback is far beyond any real pilot.
const MAX_STREAK_LOOKBACK_DAYS = 3650;

export function computeAchievementStreak(
  entries: EntriesState,
  schedule: WeeklyScheduleState,
  asOfDate: DateKey
): number {
  let streak = 0;
  let cursor = asOfDate;
  for (let i = 0; i < MAX_STREAK_LOOKBACK_DAYS; i++) {
    const status = getDayCalendarStatus(entries, schedule, cursor);
    if (status === 'no-target') {
      cursor = addDaysToDateKey(cursor, -1);
      continue;
    }
    if (status === 'achieved') {
      streak += 1;
      cursor = addDaysToDateKey(cursor, -1);
      continue;
    }
    break; // 'late' or 'no-record' breaks the streak
  }
  return streak;
}

export function isScheduleEditLockedForDate(entries: EntriesState, date: DateKey): boolean {
  const entry = entries.entries[date];
  return Boolean(entry && !entry.cancelled);
}
