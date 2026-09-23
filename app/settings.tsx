import { useCallback, useState, type ChangeEvent } from 'react';
import { Alert, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAppStore } from '../store/useAppStore';
import { verifyPin } from '../store/pin';
import { getLocalDateKey } from '../store/dateUtils';
import { getDayCalendarStatus, isScheduleEditLockedForDate } from '../store/entries';
import { MAX_TARGET_TIME, MIN_TARGET_TIME } from '../store/config';
import { DEFAULT_TARGET_TIME, getEffectiveRule, isValidTargetTime } from '../store/schedule';
import type { DayOfWeek, TimeOfDay } from '../store/types';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const ALL_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

function timeOfDayToDate(time: TimeOfDay): Date {
  const [h, m, s] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, s, 0);
  return d;
}

function dateToTimeOfDay(d: Date): TimeOfDay {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function ScheduleRow({ dayOfWeek }: { dayOfWeek: DayOfWeek }) {
  const entries = useAppStore((s) => s.entries);
  const schedule = useAppStore((s) => s.schedule);
  const addScheduleRuleAndPersist = useAppStore((s) => s.addScheduleRuleAndPersist);
  const today = getLocalDateKey(new Date());
  const todayDayOfWeek = new Date().getDay() as DayOfWeek;

  const effectiveRule = getEffectiveRule(schedule, dayOfWeek, today);
  const [enabled, setEnabled] = useState(effectiveRule?.enabled ?? true);
  const [targetTime, setTargetTime] = useState<TimeOfDay>(effectiveRule?.targetTime ?? DEFAULT_TARGET_TIME);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [message, setMessage] = useState('');

  const isTodayRow = dayOfWeek === todayDayOfWeek;
  const locked = isTodayRow && isScheduleEditLockedForDate(entries, today);

  const handleTimeChange = useCallback((event: DateTimePickerEvent, selected?: Date) => {
    // Android's "default" display is a modal dialog: onChange fires exactly
    // once, on confirm ('set') or cancel ('dismissed'), so it's safe to close
    // right away. iOS's "default" display is an inline spinner with no
    // confirm gesture of its own: onChange fires on every tick while
    // scrolling, so closing here would dismiss it before the user finishes
    // (the picker is instead closed by the iOS-only "完了" button below).
    if (Platform.OS === 'android') {
      setPickerOpen(false);
    }
    if (event.type === 'dismissed') {
      setPickerOpen(false);
      return;
    }
    if (!selected) return;
    setTargetTime(dateToTimeOfDay(selected));
  }, []);

  const handleWebTimeChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    setTargetTime(`${e.target.value}:00`);
  }, []);

  const handleSave = useCallback(async () => {
    if (enabled && !isValidTargetTime(targetTime)) {
      setMessage(`目標時刻は${MIN_TARGET_TIME.slice(0, 5)}〜${MAX_TARGET_TIME.slice(0, 5)}の範囲で入力してください`);
      return;
    }
    const success = await addScheduleRuleAndPersist({
      dayOfWeek,
      enabled,
      targetTime,
      effectiveFrom: today,
    });
    setMessage(success ? '保存しました' : '本日はすでに打刻済みのため変更できません');
  }, [addScheduleRuleAndPersist, dayOfWeek, enabled, targetTime, today]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, opacity: locked ? 0.5 : 1 }}>
      <Text style={{ width: 24 }}>{WEEKDAY_LABELS[dayOfWeek]}</Text>
      <Switch value={enabled} onValueChange={setEnabled} disabled={locked} />
      {enabled ? (
        Platform.OS === 'web' ? (
          // @react-native-community/datetimepicker has no web implementation
          // (it renders null there), so the browser's own time input is used.
          <input type="time" value={targetTime.slice(0, 5)} disabled={locked} onChange={handleWebTimeChange} />
        ) : (
          <Pressable onPress={() => !locked && setPickerOpen(true)} disabled={locked}>
            <Text>{targetTime.slice(0, 5)}</Text>
          </Pressable>
        )
      ) : (
        <Text style={{ color: '#9E9E9E' }}>－</Text>
      )}
      <Pressable onPress={handleSave} disabled={locked} style={{ padding: 8 }}>
        <Text>保存</Text>
      </Pressable>
      {message ? <Text style={{ fontSize: 12 }}>{message}</Text> : null}
      {pickerOpen ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <DateTimePicker value={timeOfDayToDate(targetTime)} mode="time" is24Hour onChange={handleTimeChange} />
          {Platform.OS === 'ios' ? (
            <Pressable onPress={() => setPickerOpen(false)} style={{ padding: 8 }}>
              <Text>完了</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function CancelTodaySection() {
  const entries = useAppStore((s) => s.entries);
  const schedule = useAppStore((s) => s.schedule);
  const cancelEntryAndPersist = useAppStore((s) => s.cancelEntryAndPersist);
  const today = getLocalDateKey(new Date());
  const [message, setMessage] = useState('');

  // Hooks must run unconditionally on every render, so these callbacks are
  // declared before the early-return guard below (e.g. cancelling flips
  // todayEntry.cancelled to true on this same mounted instance, which must
  // not change the number of hooks called).
  const performCancel = useCallback(async () => {
    const success = await cancelEntryAndPersist(today);
    if (success) {
      // The success message can't rely on local `message` state: the moment
      // cancellation succeeds, todayEntry.cancelled flips to true on the
      // next render, and the component's own guard below unmounts this
      // whole section (message included) before anyone could see it.
      Alert.alert('取り消しました', '本日の記録を取り消しました');
    } else {
      setMessage('取り消しに失敗しました');
    }
  }, [cancelEntryAndPersist, today]);

  const handleCancel = useCallback(() => {
    Alert.alert(
      '本日の記録を取り消しますか？',
      '取り消すと「未記録」扱いに戻ります。本日の再打刻はできません。この操作は元に戻せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '取り消す', style: 'destructive', onPress: performCancel },
      ]
    );
  }, [performCancel]);

  const todayEntry = entries.entries[today];
  if (!todayEntry || todayEntry.cancelled) return null; // nothing recorded (or already cancelled) — nothing to show

  const status = getDayCalendarStatus(entries, schedule, today);

  return (
    <View style={{ marginTop: 24, gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '600' }}>本日の記録の取り消し</Text>
      <Text>現在の記録: {status === 'achieved' ? '達成' : '未達成（遅刻）'}（{todayEntry.punchedAtLocalTime}打刻）</Text>
      <Text style={{ fontSize: 12, color: '#757575' }}>取り消すと「未記録」扱いに戻りますが、本日の再打刻はできません。</Text>
      <Pressable onPress={handleCancel} style={{ padding: 8, alignSelf: 'flex-start' }}>
        <Text>取り消す</Text>
      </Pressable>
      {message ? <Text>{message}</Text> : null}
    </View>
  );
}

export default function SettingsScreen() {
  const [pinInput, setPinInput] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [pinMessage, setPinMessage] = useState('');

  const handleUnlock = useCallback(async () => {
    const ok = await verifyPin(pinInput);
    if (ok) {
      setUnlocked(true);
      setPinMessage('');
    } else {
      setPinMessage('PINが違います');
    }
  }, [pinInput]);

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
        {pinMessage ? <Text>{pinMessage}</Text> : null}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 4 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>曜日ごとの目標起床時刻</Text>
      {ALL_DAYS.map((d) => (
        <ScheduleRow key={d} dayOfWeek={d} />
      ))}
      <CancelTodaySection />
    </ScrollView>
  );
}
