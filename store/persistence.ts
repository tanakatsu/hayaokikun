import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DateKey, EntriesState, WeeklyScheduleState } from './types';
import { createInitialSchedule } from './schedule';

export const ENTRIES_STORAGE_KEY = 'hayaoki:entries:v1';
export const SCHEDULE_STORAGE_KEY = 'hayaoki:schedule:v1';

export async function saveEntriesState(state: EntriesState): Promise<void> {
  await AsyncStorage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify(state));
}

export async function saveScheduleState(state: WeeklyScheduleState): Promise<void> {
  await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(state));
}

export async function loadEntriesState(): Promise<EntriesState> {
  const raw = await AsyncStorage.getItem(ENTRIES_STORAGE_KEY);
  if (raw === null) return { entries: {} };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.entries !== 'object') {
      return { entries: {} };
    }
    return parsed as EntriesState;
  } catch {
    // Corrupt JSON (e.g. an app-kill mid-write): prefer an empty store over crashing.
    return { entries: {} };
  }
}

export async function loadScheduleState(fallbackEffectiveFrom: DateKey): Promise<WeeklyScheduleState> {
  const raw = await AsyncStorage.getItem(SCHEDULE_STORAGE_KEY);
  if (raw === null) return createInitialSchedule(fallbackEffectiveFrom);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rules)) {
      return createInitialSchedule(fallbackEffectiveFrom);
    }
    return parsed as WeeklyScheduleState;
  } catch {
    return createInitialSchedule(fallbackEffectiveFrom);
  }
}
