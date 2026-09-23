import { useEffect } from 'react';
import { Text, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { useAppStore } from '../store/useAppStore';

function TabIcon({ symbol, color, size }: { symbol: string; color: ColorValue; size: number }) {
  return <Text style={{ fontSize: size, color }}>{symbol}</Text>;
}

export default function RootLayout() {
  useEffect(() => {
    if (!useAppStore.getState().hydrated) {
      useAppStore.getState().hydrate();
    }
  }, []);

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="today"
        options={{ title: '今日', tabBarIcon: ({ color, size }) => <TabIcon symbol="☀️" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'カレンダー', tabBarIcon: ({ color, size }) => <TabIcon symbol="📅" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: '設定', tabBarIcon: ({ color, size }) => <TabIcon symbol="⚙️" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
