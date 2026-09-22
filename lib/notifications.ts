import * as Notifications from 'expo-notifications';
import { getEffectiveRule } from '../store/schedule';
import type { DateKey, DayOfWeek, WeeklyScheduleState } from '../store/types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function rescheduleAllReminders(schedule: WeeklyScheduleState, asOfDate: DateKey): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
    const rule = getEffectiveRule(schedule, dayOfWeek as DayOfWeek, asOfDate);
    if (!rule || !rule.enabled) continue;
    const [hour, minute] = rule.targetTime.split(':').map(Number);
    await Notifications.scheduleNotificationAsync({
      content: { title: '早起きくん', body: 'そろそろ起きる時間だよ!アプリを開いて打刻してね。' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: dayOfWeek + 1, // Expo: 1 = Sunday .. 7 = Saturday; JS Date.getDay(): 0 = Sunday
        hour,
        minute,
      } as any,
    });
  }
}
