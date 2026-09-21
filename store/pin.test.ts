import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStoredPin, setStoredPin, verifyPin } from './pin';

describe('pin', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('falls back to the default PIN when none has been set', async () => {
    expect(await getStoredPin()).toBe('0000');
    expect(await verifyPin('0000')).toBe(true);
    expect(await verifyPin('1234')).toBe(false);
  });

  it('verifies against a PIN that was explicitly set', async () => {
    await setStoredPin('4321');
    expect(await verifyPin('4321')).toBe(true);
    expect(await verifyPin('0000')).toBe(false);
  });
});
