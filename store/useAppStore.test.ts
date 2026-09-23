jest.mock('./persistence');

import { createEmptyEntriesState } from './entries';
import { createInitialSchedule } from './schedule';
import * as persistence from './persistence';
import { createAppStore } from './useAppStore';
import { getLocalDateKey, addDaysToDateKey } from './dateUtils';
import type { DayOfWeek } from './types';

const mockedPersistence = persistence as jest.Mocked<typeof persistence>;

describe('useAppStore punchIn', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedPersistence.loadEntriesState.mockResolvedValue(createEmptyEntriesState());
    mockedPersistence.loadScheduleState.mockResolvedValue(createInitialSchedule('2026-01-01'));
  });

  it('does not update entries state when persistence fails (no optimistic UI)', async () => {
    mockedPersistence.saveEntriesState.mockRejectedValue(new Error('disk full'));
    const store = createAppStore();
    await store.getState().hydrate();

    const success = await store.getState().punchIn('2026-09-21', 1234567890000, '06:55:00', '07:00:00');

    expect(success).toBe(false);
    expect(store.getState().entries.entries['2026-09-21']).toBeUndefined();
    expect(store.getState().lastError).toBe('save-failed');
  });

  it('updates entries state only after persistence succeeds', async () => {
    mockedPersistence.saveEntriesState.mockResolvedValue(undefined);
    const store = createAppStore();
    await store.getState().hydrate();

    const success = await store.getState().punchIn('2026-09-21', 1234567890000, '06:55:00', '07:00:00');

    expect(success).toBe(true);
    expect(store.getState().entries.entries['2026-09-21'].status).toBe('achieved');
  });

  it('rejects a second punch on the same date without touching persistence again', async () => {
    mockedPersistence.saveEntriesState.mockResolvedValue(undefined);
    const store = createAppStore();
    await store.getState().hydrate();
    await store.getState().punchIn('2026-09-21', 1000, '06:55:00', '07:00:00');

    const success = await store.getState().punchIn('2026-09-21', 2000, '06:56:00', '07:00:00');

    expect(success).toBe(false);
    expect(store.getState().lastError).toBe('already-punched');
    expect(mockedPersistence.saveEntriesState).toHaveBeenCalledTimes(1);
  });
});

describe('useAppStore hydrate', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedPersistence.loadEntriesState.mockResolvedValue(createEmptyEntriesState());
  });

  it('persists default rules on first-ever hydrate, pinned to that day, instead of leaving them synthetic', async () => {
    mockedPersistence.loadScheduleState.mockResolvedValue({ rules: [] }); // nothing saved yet
    mockedPersistence.saveScheduleState.mockResolvedValue(undefined);
    const store = createAppStore();

    await store.getState().hydrate();

    const today = getLocalDateKey(new Date());
    expect(mockedPersistence.saveScheduleState).toHaveBeenCalledWith(createInitialSchedule(today));
    expect(store.getState().scheduleRaw).toEqual(createInitialSchedule(today));
  });

  it('does not overwrite an already-saved schedule on a later hydrate', async () => {
    const saved = createInitialSchedule('2026-01-01');
    mockedPersistence.loadScheduleState.mockResolvedValue(saved);
    const store = createAppStore();

    await store.getState().hydrate();

    expect(mockedPersistence.saveScheduleState).not.toHaveBeenCalled();
    expect(store.getState().scheduleRaw).toEqual(saved);
  });

  it('falls back to an in-memory default for this session when persisting it fails', async () => {
    mockedPersistence.loadScheduleState.mockResolvedValue({ rules: [] });
    mockedPersistence.saveScheduleState.mockRejectedValue(new Error('disk full'));
    const store = createAppStore();

    await store.getState().hydrate();

    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().scheduleRaw).toEqual({ rules: [] });
    // The in-memory display schedule still has usable defaults for today.
    const today = getLocalDateKey(new Date());
    expect(store.getState().schedule).toEqual(createInitialSchedule(today));
  });
});

describe('useAppStore addScheduleRuleAndPersist', () => {
  // Derived from the real clock at test-run time (never hardcoded), so these
  // tests remain correct regardless of what day they actually run on.
  const today = getLocalDateKey(new Date());
  const todayDayOfWeek = new Date().getDay() as DayOfWeek;
  const tomorrow = addDaysToDateKey(today, 1);
  const differentDayOfWeek = ((todayDayOfWeek + 1) % 7) as DayOfWeek;

  beforeEach(() => {
    jest.resetAllMocks();
    mockedPersistence.loadEntriesState.mockResolvedValue(createEmptyEntriesState());
    mockedPersistence.loadScheduleState.mockResolvedValue(createInitialSchedule('2026-01-01'));
    mockedPersistence.saveScheduleState.mockResolvedValue(undefined);
  });

  it('blocks a change to today once today is already punched', async () => {
    mockedPersistence.saveEntriesState.mockResolvedValue(undefined);
    const store = createAppStore();
    await store.getState().hydrate();
    await store.getState().punchIn(today, 1000, '06:55:00', '07:00:00');

    const success = await store.getState().addScheduleRuleAndPersist({
      dayOfWeek: todayDayOfWeek,
      enabled: true,
      targetTime: '08:00:00',
      effectiveFrom: today,
    });

    expect(success).toBe(false);
    expect(mockedPersistence.saveScheduleState).not.toHaveBeenCalled();
  });

  it('allows a change to a future date even if today is punched', async () => {
    mockedPersistence.saveEntriesState.mockResolvedValue(undefined);
    const store = createAppStore();
    await store.getState().hydrate();
    await store.getState().punchIn(today, 1000, '06:55:00', '07:00:00');

    const success = await store.getState().addScheduleRuleAndPersist({
      dayOfWeek: todayDayOfWeek,
      enabled: true,
      targetTime: '08:00:00',
      effectiveFrom: tomorrow,
    });

    expect(success).toBe(true);
    expect(mockedPersistence.saveScheduleState).toHaveBeenCalledTimes(1);
  });

  it('allows a change to a different weekday even if today (a different weekday) is already punched', async () => {
    mockedPersistence.saveEntriesState.mockResolvedValue(undefined);
    const store = createAppStore();
    await store.getState().hydrate();
    // Punch today, then edit a rule for a different day of the week, effective today.
    await store.getState().punchIn(today, 1000, '06:55:00', '07:00:00');

    const success = await store.getState().addScheduleRuleAndPersist({
      dayOfWeek: differentDayOfWeek,
      enabled: true,
      targetTime: '08:00:00',
      effectiveFrom: today,
    });

    expect(success).toBe(true);
    expect(mockedPersistence.saveScheduleState).toHaveBeenCalledTimes(1);
  });
});

describe('useAppStore cancelEntryAndPersist', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedPersistence.loadEntriesState.mockResolvedValue(createEmptyEntriesState());
    mockedPersistence.loadScheduleState.mockResolvedValue(createInitialSchedule('2026-01-01'));
  });

  it('cancels a recorded entry only after the write succeeds', async () => {
    mockedPersistence.saveEntriesState.mockResolvedValue(undefined);
    const store = createAppStore();
    await store.getState().hydrate();
    await store.getState().punchIn('2026-09-21', 1000, '06:55:00', '07:00:00');

    const success = await store.getState().cancelEntryAndPersist('2026-09-21');

    expect(success).toBe(true);
    expect(store.getState().entries.entries['2026-09-21'].cancelled).toBe(true);
  });

  it('leaves state untouched when persistence fails', async () => {
    mockedPersistence.saveEntriesState.mockResolvedValueOnce(undefined); // the punchIn save succeeds
    const store = createAppStore();
    await store.getState().hydrate();
    await store.getState().punchIn('2026-09-21', 1000, '06:55:00', '07:00:00');
    mockedPersistence.saveEntriesState.mockRejectedValueOnce(new Error('disk full')); // the cancel save fails

    const success = await store.getState().cancelEntryAndPersist('2026-09-21');

    expect(success).toBe(false);
    expect(store.getState().entries.entries['2026-09-21'].cancelled).toBe(false);
    expect(store.getState().lastError).toBe('save-failed');
  });

  it('returns false when there is nothing to cancel for that date', async () => {
    const store = createAppStore();
    await store.getState().hydrate();

    const success = await store.getState().cancelEntryAndPersist('2026-09-21');

    expect(success).toBe(false);
    expect(store.getState().lastError).toBe('no-entry-to-cancel');
  });
});
