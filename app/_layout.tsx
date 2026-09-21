import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useAppStore } from '../store/useAppStore';

export default function RootLayout() {
  useEffect(() => {
    if (!useAppStore.getState().hydrated) {
      useAppStore.getState().hydrate();
    }
  }, []);

  return <Stack />;
}
