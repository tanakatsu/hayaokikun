import { create } from 'zustand';
import type { EntriesState, ScheduleRule, WeeklyScheduleState, DateKey, TimeOfDay } from './types';
import { createEmptyEntriesState, recordPunchIn, DuplicatePunchError, isScheduleEditLockedForDate } from './entries';
import { createInitialSchedule, addScheduleRule } from './schedule';
import { getLocalDateKey } from './dateUtils';
import { loadEntriesState, loadScheduleState, saveEntriesState, saveScheduleState } from './persistence';

type LastError = null | 'save-failed' | 'already-punched' | 'schedule-locked-today';

interface AppStoreState {
  entries: EntriesState;
  schedule: WeeklyScheduleState;
  hydrated: boolean;
  lastError: LastError;
  hydrate: () => Promise<void>;
  punchIn: (
    date: DateKey,
    punchedAtEpochMs: number,
    punchedAtLocalTime: TimeOfDay,
    targetTimeSnapshot: TimeOfDay
  ) => Promise<boolean>;
  addScheduleRuleAndPersist: (rule: ScheduleRule) => Promise<boolean>;
}

export function createAppStore() {
  return create<AppStoreState>((set, get) => ({
    entries: createEmptyEntriesState(),
    schedule: createInitialSchedule(getLocalDateKey(new Date())),
    hydrated: false,
    lastError: null,

    hydrate: async () => {
      const today = getLocalDateKey(new Date());
      const [entries, schedule] = await Promise.all([loadEntriesState(), loadScheduleState(today)]);
      set({ entries, schedule, hydrated: true });
    },

    punchIn: async (date, punchedAtEpochMs, punchedAtLocalTime, targetTimeSnapshot) => {
      let next: EntriesState;
      try {
        next = recordPunchIn(get().entries, date, punchedAtEpochMs, punchedAtLocalTime, targetTimeSnapshot);
      } catch (e) {
        if (e instanceof DuplicatePunchError) {
          set({ lastError: 'already-punched' });
          return false;
        }
        throw e;
      }
      try {
        await saveEntriesState(next);
      } catch {
        // Persistence failed: leave in-memory state untouched, so the UI
        // stays at "not recorded" instead of updating optimistically.
        set({ lastError: 'save-failed' });
        return false;
      }
      set({ entries: next, lastError: null });
      return true;
    },

    addScheduleRuleAndPersist: async (rule) => {
      const today = getLocalDateKey(new Date());
      if (rule.effectiveFrom === today && isScheduleEditLockedForDate(get().entries, today)) {
        set({ lastError: 'schedule-locked-today' });
        return false;
      }
      const next = addScheduleRule(get().schedule, rule);
      await saveScheduleState(next);
      set({ schedule: next, lastError: null });
      return true;
    },
  }));
}

export const useAppStore = createAppStore();
