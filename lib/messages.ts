import { computeAchievementStreak, getDayCalendarStatus } from '../store/entries';
import { addDaysToDateKey } from '../store/dateUtils';
import type { DateKey, EntriesState, WeeklyScheduleState } from '../store/types';

const MESSAGES = {
  firstAchieved: 'はじめての早起き達成、やったね!🎉',
  streak3: '3日連続達成中!すごい!',
  streak7: '7日連続達成!早起き名人だね!',
  genericAchieved: '今日も早起きできたね!',
  firstUnachieved: '今日はちょっと遅かったね。また明日がんばろう!',
  streakBroken: '連続記録はここまで。また今日から積み重ねよう!',
  genericLate: 'また明日、早起きにチャレンジしよう!',
} as const;

function countPastStatus(
  entries: EntriesState,
  schedule: WeeklyScheduleState,
  beforeDate: DateKey,
  status: 'achieved' | 'late'
): number {
  let count = 0;
  for (const date of Object.keys(entries.entries)) {
    if (date >= beforeDate) continue; // strictly before today; today is handled separately by the caller
    if (getDayCalendarStatus(entries, schedule, date) === status) count += 1;
  }
  return count;
}

export function selectEncouragementMessage(
  entries: EntriesState,
  schedule: WeeklyScheduleState,
  date: DateKey
): string | null {
  const todayStatus = getDayCalendarStatus(entries, schedule, date);
  if (todayStatus === 'no-target' || todayStatus === 'no-record') return null;

  if (todayStatus === 'achieved') {
    const achievedBeforeToday = countPastStatus(entries, schedule, date, 'achieved');
    if (achievedBeforeToday === 0) return MESSAGES.firstAchieved;
    const streak = computeAchievementStreak(entries, schedule, date);
    if (streak === 3) return MESSAGES.streak3;
    if (streak === 7) return MESSAGES.streak7;
    return MESSAGES.genericAchieved;
  }

  // todayStatus === 'late'
  const previousStreak = computeAchievementStreak(entries, schedule, addDaysToDateKey(date, -1));
  if (previousStreak > 0) return MESSAGES.streakBroken;
  const lateBeforeToday = countPastStatus(entries, schedule, date, 'late');
  if (lateBeforeToday === 0) return MESSAGES.firstUnachieved;
  return MESSAGES.genericLate;
}
