import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EntriesState, WeeklyScheduleState } from './types';

export const ENTRIES_STORAGE_KEY = 'hayaoki:entries:v1';
export const SCHEDULE_STORAGE_KEY = 'hayaoki:schedule:v1';

export async function saveEntriesState(state: EntriesState): Promise<void> {
  await AsyncStorage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify(state));
}

export async function saveScheduleState(state: WeeklyScheduleState): Promise<void> {
  await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(state));
}

export async function loadEntriesState(): Promise<EntriesState> {
  try {
    const raw = await AsyncStorage.getItem(ENTRIES_STORAGE_KEY);
    if (raw === null) return { entries: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.entries !== 'object') {
      return { entries: {} };
    }
    return parsed as EntriesState;
  } catch {
    // Corrupt JSON (e.g. an app-kill mid-write) or an AsyncStorage failure:
    // prefer an empty store over crashing.
    return { entries: {} };
  }
}

// Returns exactly what has been explicitly saved — an empty rules array when
// nothing has been saved yet, or the saved JSON is corrupt/malformed. Callers
// that need a default for a day with no saved rule use schedule.ts's
// withDefaultRules; this function must never synthesize one, or every default
// ends up written back to storage as if the parent had explicitly saved it.
export async function loadScheduleState(): Promise<WeeklyScheduleState> {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (raw === null) return { rules: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rules)) {
      return { rules: [] };
    }
    return parsed as WeeklyScheduleState;
  } catch {
    return { rules: [] };
  }
}
