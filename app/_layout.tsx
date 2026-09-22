import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { useAppStore } from '../store/useAppStore';

export default function RootLayout() {
  useEffect(() => {
    if (!useAppStore.getState().hydrated) {
      useAppStore.getState().hydrate();
    }
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
