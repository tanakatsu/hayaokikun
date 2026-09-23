import { DEFAULT_TARGET_TIME, MAX_TARGET_TIME, MIN_TARGET_TIME } from './config';
import type { DateKey, DayOfWeek, ScheduleRule, TimeOfDay, WeeklyScheduleState } from './types';

export { DEFAULT_TARGET_TIME, MAX_TARGET_TIME, MIN_TARGET_TIME };

export class InvalidTargetTimeError extends Error {}

export function isValidTargetTime(time: TimeOfDay): boolean {
  return time >= MIN_TARGET_TIME && time <= MAX_TARGET_TIME;
}

export function createInitialSchedule(effectiveFrom: DateKey): WeeklyScheduleState {
  const rules: ScheduleRule[] = [];
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
    rules.push({
      dayOfWeek: dayOfWeek as DayOfWeek,
      enabled: true,
      targetTime: DEFAULT_TARGET_TIME,
      effectiveFrom,
    });
  }
  return { rules };
}

// Rules are append-only (never overwritten) so that reclassifying a past
// date always reflects the setting that was in effect back then.
export function addScheduleRule(
  schedule: WeeklyScheduleState,
  rule: ScheduleRule
): WeeklyScheduleState {
  if (rule.enabled && !isValidTargetTime(rule.targetTime)) {
    throw new InvalidTargetTimeError(
      `targetTime ${rule.targetTime} is outside ${MIN_TARGET_TIME}-${MAX_TARGET_TIME}`
    );
  }
  return { rules: [...schedule.rules, rule] };
}

export function getEffectiveRule(
  schedule: WeeklyScheduleState,
  dayOfWeek: DayOfWeek,
  onDate: DateKey
): ScheduleRule | undefined {
  const candidates = schedule.rules.filter(
    (r) => r.dayOfWeek === dayOfWeek && r.effectiveFrom <= onDate
  );
  if (candidates.length === 0) return undefined;
  // >= (not >) so that among same-effectiveFrom rules, the later-appended
  // one (a same-day correction) wins.
  return candidates.reduce((latest, r) => (r.effectiveFrom >= latest.effectiveFrom ? r : latest));
}
