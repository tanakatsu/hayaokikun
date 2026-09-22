jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly' },
}));

import * as Notifications from 'expo-notifications';
import { rescheduleAllReminders, requestNotificationPermission } from './notifications';
import { createInitialSchedule, addScheduleRule } from '../store/schedule';

const mocked = Notifications as jest.Mocked<typeof Notifications>;

describe('requestNotificationPermission', () => {
  it('returns true when permission is granted', async () => {
    mocked.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    expect(await requestNotificationPermission()).toBe(true);
  });

  it('returns false when permission is denied', async () => {
    mocked.requestPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
    expect(await requestNotificationPermission()).toBe(false);
  });
});

describe('rescheduleAllReminders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cancels existing reminders and schedules one per ON weekday, skipping OFF weekdays', async () => {
    let schedule = createInitialSchedule('2026-01-01'); // all 7 days ON at 07:00 by default
    schedule = addScheduleRule(schedule, {
      dayOfWeek: 6, // Saturday OFF
      enabled: false,
      targetTime: '07:00:00',
      effectiveFrom: '2026-01-01',
    });

    await rescheduleAllReminders(schedule, '2026-09-21');

    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(6); // 7 days minus the OFF Saturday
  });

  it('maps Sunday (JS dayOfWeek 0) to Expo weekday 1', async () => {
    const schedule = createInitialSchedule('2026-01-01');
    await rescheduleAllReminders(schedule, '2026-09-21');

    const sundayCall = mocked.scheduleNotificationAsync.mock.calls.find(
      (call) => (call[0].trigger as any).weekday === 1
    );
    expect(sundayCall).toBeDefined();
    expect((sundayCall![0].trigger as any).hour).toBe(7);
    expect((sundayCall![0].trigger as any).minute).toBe(0);
  });
});
