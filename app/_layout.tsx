import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { useAppStore } from '../store/useAppStore';
import { getLocalDateKey } from '../store/dateUtils';
import { requestNotificationPermission, rescheduleAllReminders } from '../lib/notifications';

export default function RootLayout() {
  useEffect(() => {
    if (!useAppStore.getState().hydrated) {
      useAppStore.getState().hydrate();
    }
  }, []);

  useEffect(() => {
    requestNotificationPermission()
      .then((granted) => {
        if (!granted) return;
        return rescheduleAllReminders(useAppStore.getState().schedule, getLocalDateKey(new Date()));
      })
      .catch(() => {
        // Local reminders are optional (P3); a scheduling failure must never block the core app.
      });

    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      if (state.schedule === prevState.schedule) return;
      requestNotificationPermission()
        .then((granted) => {
          if (!granted) return;
          return rescheduleAllReminders(state.schedule, getLocalDateKey(new Date()));
        })
        .catch(() => {});
    });
    return unsubscribe;
  }, []);

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="today" options={{ title: '今日' }} />
      <Tabs.Screen name="calendar" options={{ title: 'カレンダー' }} />
      <Tabs.Screen name="settings" options={{ title: '設定' }} />
    </Tabs>
  );
}
