import type { DateKey, Entry, EntriesState, EntryStatus, TimeOfDay, WeeklyScheduleState } from './types';
import { addDaysToDateKey, dateKeyToDayOfWeek, getLocalDateKey, getLocalTimeOfDay, isWithinPunchWindow } from './dateUtils';
import { PARENT_EDIT_WINDOW_DAYS } from './config';
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
export class EntryOutOfEditWindowError extends Error {}
export class NoTargetForDateError extends Error {}
export class InvalidEditTimeError extends Error {}

// The dates a parent may add, edit or cancel: today and the
// PARENT_EDIT_WINDOW_DAYS days before it. Future dates are never editable.
export function isWithinParentEditWindow(date: DateKey, today: DateKey): boolean {
  return date <= today && date >= addDaysToDateKey(today, -PARENT_EDIT_WINDOW_DAYS);
}

export function cancelEntry(state: EntriesState, date: DateKey, today: DateKey): EntriesState {
  if (!isWithinParentEditWindow(date, today)) {
    throw new EntryOutOfEditWindowError(`${date} is outside the parent edit window as of ${today}`);
  }
  const entry = state.entries[date];
  if (!entry) {
    throw new NoEntryToCancelError(`No entry for ${date} to cancel`);
  }
  if (entry.cancelled) return state; // idempotent
  return { entries: { ...state.entries, [date]: { ...entry, cancelled: true } } };
}

function dateAndTimeToEpochMs(date: DateKey, time: TimeOfDay): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss).getTime();
}

// Parent-only correction for a forgotten or wrong punch. Three cases:
//
//   no entry          -> add      (target = rule in effect that day)
//   entry, cancelled  -> restore  (cancelled: false, time replaced)
//   entry             -> edit     (time replaced, target snapshot kept)
//
// Edited entries remember the child's own original time exactly once, so
// a second edit never erases what the child actually punched.
export function setEntryTimeByParent(
  state: EntriesState,
  schedule: WeeklyScheduleState,
  date: DateKey,
  time: TimeOfDay,
  now: Date
): EntriesState {
  const today = getLocalDateKey(now);
  if (!isWithinParentEditWindow(date, today)) {
    throw new EntryOutOfEditWindowError(`${date} is outside the parent edit window as of ${today}`);
  }
  const rule = getEffectiveRule(schedule, dateKeyToDayOfWeek(date), date);
  if (!rule || !rule.enabled) {
    throw new NoTargetForDateError(`${date} has no target`);
  }
  const normalized: TimeOfDay = `${time.slice(0, 5)}:00`;
  if (!isWithinPunchWindow(normalized)) {
    throw new InvalidEditTimeError(`${normalized} is outside the punch window`);
  }
  // A time that hasn't happened yet today would settle today's result
  // before the child is even up (and block their own punch).
  if (date === today && normalized > getLocalTimeOfDay(now)) {
    throw new InvalidEditTimeError(`${normalized} is later than now`);
  }

  const existing = state.entries[date];
  const targetTimeSnapshot = existing ? existing.targetTimeSnapshot : rule.targetTime;
  const originalPunchedAtLocalTime =
    existing?.originalPunchedAtLocalTime ??
    (existing && !existing.editedByParent ? existing.punchedAtLocalTime : undefined);

  const entry: Entry = {
    date,
    punchedAtEpochMs: dateAndTimeToEpochMs(date, normalized),
    punchedAtLocalTime: normalized,
    targetTimeSnapshot,
    status: computeEntryStatus(normalized, targetTimeSnapshot),
    cancelled: false,
    editedByParent: true,
    ...(originalPunchedAtLocalTime ? { originalPunchedAtLocalTime } : {}),
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
