import AsyncStorage from '@react-native-async-storage/async-storage';

const PIN_STORAGE_KEY = 'hayaoki:parentPin:v1';
const DEFAULT_PIN = '0000';

export async function getStoredPin(): Promise<string> {
  const raw = await AsyncStorage.getItem(PIN_STORAGE_KEY);
  return raw ?? DEFAULT_PIN;
}

export async function setStoredPin(pin: string): Promise<void> {
  await AsyncStorage.setItem(PIN_STORAGE_KEY, pin);
}

export async function verifyPin(candidate: string): Promise<boolean> {
  const stored = await getStoredPin();
  return candidate === stored;
}
