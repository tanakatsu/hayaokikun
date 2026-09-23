import { MAX_TARGET_TIME, MIN_TARGET_TIME } from './config';
import type { DateKey, DayOfWeek, TimeOfDay } from './types';

function pad(n: number, width: number): string {
  return n.toString().padStart(width, '0');
}

// Uses local getters (never toISOString/UTC slicing), because a UTC-based
// slice shifts the calendar day near midnight in any non-UTC timezone.
export function getLocalDateKey(d: Date): DateKey {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

export function getLocalTimeOfDay(d: Date): TimeOfDay {
  return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}`;
}

export function dateKeyToDayOfWeek(date: DateKey): DayOfWeek {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() as DayOfWeek;
}

export function addDaysToDateKey(date: DateKey, delta: number): DateKey {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return getLocalDateKey(dt);
}

export function isWithinPunchWindow(timeOfDay: TimeOfDay): boolean {
  return timeOfDay >= MIN_TARGET_TIME && timeOfDay <= MAX_TARGET_TIME;
}
