import { useCallback, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { verifyPin } from '../store/pin';
import { getLocalDateKey } from '../store/dateUtils';
import { isScheduleEditLockedForDate } from '../store/entries';
import { isValidTargetTime } from '../store/schedule';
import type { DayOfWeek } from '../store/types';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export default function SettingsScreen() {
  const entries = useAppStore((s) => s.entries);
  const addScheduleRuleAndPersist = useAppStore((s) => s.addScheduleRuleAndPersist);
  const [pinInput, setPinInput] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [targetTimeInput, setTargetTimeInput] = useState('07:00:00');
  const [message, setMessage] = useState('');

  const today = getLocalDateKey(new Date());
  const todayDayOfWeek = new Date().getDay() as DayOfWeek;
  const locked = isScheduleEditLockedForDate(entries, today);

  const handleUnlock = useCallback(async () => {
    const ok = await verifyPin(pinInput);
    if (ok) {
      setUnlocked(true);
      setMessage('');
    } else {
      setMessage('PINが違います');
    }
  }, [pinInput]);

  const handleSave = useCallback(async () => {
    if (!isValidTargetTime(targetTimeInput)) {
      setMessage('目標時刻は04:00:00〜12:00:00の範囲で入力してください');
      return;
    }
    const success = await addScheduleRuleAndPersist({
      dayOfWeek: todayDayOfWeek,
      enabled: true,
      targetTime: targetTimeInput,
      effectiveFrom: today,
    });
    setMessage(success ? '保存しました' : '本日はすでに打刻済みのため変更できません');
  }, [addScheduleRuleAndPersist, targetTimeInput, todayDayOfWeek, today]);

  if (!unlocked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Text>保護者確認PINを入力してください</Text>
        <TextInput
          value={pinInput}
          onChangeText={setPinInput}
          secureTextEntry
          keyboardType="number-pad"
          style={{ borderWidth: 1, padding: 8, width: 120, textAlign: 'center' }}
        />
        <Pressable onPress={handleUnlock} style={{ padding: 12 }}>
          <Text>確認</Text>
        </Pressable>
        {message ? <Text>{message}</Text> : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Text>{WEEKDAY_LABELS[todayDayOfWeek]}曜日の目標時刻</Text>
      <TextInput
        value={targetTimeInput}
        onChangeText={setTargetTimeInput}
        editable={!locked}
        style={{ borderWidth: 1, padding: 8, width: 120, textAlign: 'center', opacity: locked ? 0.4 : 1 }}
      />
      {locked ? <Text>本日は打刻済みのため編集できません</Text> : null}
      <Pressable onPress={handleSave} disabled={locked} style={{ padding: 12 }}>
        <Text>保存</Text>
      </Pressable>
      {message ? <Text>{message}</Text> : null}
    </View>
  );
}
