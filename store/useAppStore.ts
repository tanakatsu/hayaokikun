import { create } from 'zustand';
import type { EntriesState, ScheduleRule, WeeklyScheduleState, DateKey, TimeOfDay, DayOfWeek } from './types';
import {
  createEmptyEntriesState,
  recordPunchIn,
  DuplicatePunchError,
  isScheduleEditLockedForDate,
  cancelEntry,
  NoEntryToCancelError,
} from './entries';
import { createInitialSchedule, addScheduleRule, withDefaultRules } from './schedule';
import { getLocalDateKey } from './dateUtils';
import { loadEntriesState, loadScheduleState, saveEntriesState, saveScheduleState } from './persistence';

type LastError =
  | null
  | 'save-failed'
  | 'already-punched'
  | 'schedule-locked-today'
  | 'not-hydrated'
  | 'no-entry-to-cancel';

interface AppStoreState {
  entries: EntriesState;
  schedule: WeeklyScheduleState; // display value: scheduleRaw + synthetic defaults for untouched days
  scheduleRaw: WeeklyScheduleState; // exactly what's persisted (or about to be)
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
  cancelEntryAndPersist: (date: DateKey) => Promise<boolean>;
}

export function createAppStore() {
  return create<AppStoreState>((set, get) => ({
    entries: createEmptyEntriesState(),
    schedule: createInitialSchedule(getLocalDateKey(new Date())),
    scheduleRaw: { rules: [] },
    hydrated: false,
    lastError: null,

    hydrate: async () => {
      const today = getLocalDateKey(new Date());
      const [entries, loadedSchedule] = await Promise.all([loadEntriesState(), loadScheduleState()]);
      let scheduleRaw = loadedSchedule;
      if (scheduleRaw.rules.length === 0) {
        // Nothing has ever been saved: persist today's defaults now, with
        // effectiveFrom pinned to today. Otherwise withDefaultRules would
        // keep synthesizing them fresh on every relaunch with THAT day's
        // date, silently retroactively turning every earlier day (including
        // already-recorded ones) into "no schedule" once the app reopens on
        // a later day and the parent still hasn't touched Settings.
        const initial = createInitialSchedule(today);
        try {
          await saveScheduleState(initial);
          scheduleRaw = initial;
        } catch {
          // Persistence failed: fall back to an in-memory-only default for
          // this session; withDefaultRules below still covers today's view.
        }
      }
      set({ entries, scheduleRaw, schedule: withDefaultRules(scheduleRaw, today), hydrated: true });
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
      if (!get().hydrated) {
        set({ lastError: 'not-hydrated' });
        return false;
      }
      const today = getLocalDateKey(new Date());
      const todayDayOfWeek = new Date().getDay() as DayOfWeek;
      if (rule.effectiveFrom < today) {
        set({ lastError: 'schedule-locked-today' });
        return false;
      }
      if (
        rule.effectiveFrom === today &&
        rule.dayOfWeek === todayDayOfWeek &&
        isScheduleEditLockedForDate(get().entries, today)
      ) {
        set({ lastError: 'schedule-locked-today' });
        return false;
      }
      try {
        // Append onto scheduleRaw (only ever what's actually been saved
        // before), never onto the display `schedule`, which also carries
        // synthetic defaults for days the parent hasn't touched — appending
        // onto that would persist those defaults as if explicitly saved.
        const nextRaw = addScheduleRule(get().scheduleRaw, rule);
        await saveScheduleState(nextRaw);
        set({ scheduleRaw: nextRaw, schedule: withDefaultRules(nextRaw, today), lastError: null });
        return true;
      } catch {
        set({ lastError: 'save-failed' });
        return false;
      }
    },

    cancelEntryAndPersist: async (date) => {
      let next: EntriesState;
      try {
        next = cancelEntry(get().entries, date);
      } catch (e) {
        if (e instanceof NoEntryToCancelError) {
          set({ lastError: 'no-entry-to-cancel' });
          return false;
        }
        throw e;
      }
      try {
        await saveEntriesState(next);
      } catch {
        set({ lastError: 'save-failed' });
        return false;
      }
      set({ entries: next, lastError: null });
      return true;
    },
  }));
}

export const useAppStore = createAppStore();
