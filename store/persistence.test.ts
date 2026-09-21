import AsyncStorage from '@react-native-async-storage/async-storage';
import { createInitialSchedule } from './schedule';
import {
  ENTRIES_STORAGE_KEY,
  SCHEDULE_STORAGE_KEY,
  loadEntriesState,
  loadScheduleState,
  saveEntriesState,
  saveScheduleState,
} from './persistence';

describe('persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('round-trips entries state through save and load', async () => {
    const state = {
      entries: {
        '2026-09-21': {
          date: '2026-09-21',
          punchedAtEpochMs: 1,
          punchedAtLocalTime: '06:50:00',
          targetTimeSnapshot: '07:00:00',
          status: 'achieved' as const,
          cancelled: false,
        },
      },
    };
    await saveEntriesState(state);
    expect(await loadEntriesState()).toEqual(state);
  });

  it('returns an empty entries store when nothing was ever saved', async () => {
    expect(await loadEntriesState()).toEqual({ entries: {} });
  });

  it('falls back to an empty entries store when the saved JSON is corrupt', async () => {
    await AsyncStorage.setItem(ENTRIES_STORAGE_KEY, '{not valid json');
    expect(await loadEntriesState()).toEqual({ entries: {} });
  });

  it('falls back to an empty entries store when the saved shape is wrong', async () => {
    await AsyncStorage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify({ foo: 'bar' }));
    expect(await loadEntriesState()).toEqual({ entries: {} });
  });

  it('round-trips schedule state through save and load', async () => {
    const state = createInitialSchedule('2026-09-21');
    await saveScheduleState(state);
    expect(await loadScheduleState('2099-01-01')).toEqual(state);
  });

  it('falls back to a fresh default schedule when the saved JSON is corrupt', async () => {
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, '{not valid json');
    expect(await loadScheduleState('2026-09-21')).toEqual(createInitialSchedule('2026-09-21'));
  });
});
