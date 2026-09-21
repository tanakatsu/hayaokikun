jest.mock('./persistence');

import { createEmptyEntriesState } from './entries';
import { createInitialSchedule } from './schedule';
import * as persistence from './persistence';
import { createAppStore } from './useAppStore';

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

describe('useAppStore addScheduleRuleAndPersist', () => {
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
    await store.getState().punchIn('2026-09-21', 1000, '06:55:00', '07:00:00');

    const success = await store.getState().addScheduleRuleAndPersist({
      dayOfWeek: 1,
      enabled: true,
      targetTime: '08:00:00',
      effectiveFrom: '2026-09-21',
    });

    expect(success).toBe(false);
    expect(mockedPersistence.saveScheduleState).not.toHaveBeenCalled();
  });

  it('allows a change to a future date even if today is punched', async () => {
    mockedPersistence.saveEntriesState.mockResolvedValue(undefined);
    const store = createAppStore();
    await store.getState().hydrate();
    await store.getState().punchIn('2026-09-21', 1000, '06:55:00', '07:00:00');

    const success = await store.getState().addScheduleRuleAndPersist({
      dayOfWeek: 1,
      enabled: true,
      targetTime: '08:00:00',
      effectiveFrom: '2026-09-22',
    });

    expect(success).toBe(true);
    expect(mockedPersistence.saveScheduleState).toHaveBeenCalledTimes(1);
  });
});
