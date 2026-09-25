import { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../store/useAppStore';
import { verifyPin } from '../store/pin';
import { addDaysToDateKey, dateKeyToDayOfWeek, getLocalDateKey } from '../store/dateUtils';
import { computeEntryStatus, getDayCalendarStatus, isScheduleEditLockedForDate } from '../store/entries';
import { MAX_TARGET_TIME, MIN_TARGET_TIME, PARENT_EDIT_WINDOW_DAYS } from '../store/config';
import { DEFAULT_TARGET_TIME, getEffectiveRule, isValidTargetTime } from '../store/schedule';
import type { DateKey, DayOfWeek, TimeOfDay } from '../store/types';
import { TimeOfDayField } from '../components/TimeOfDayField';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const ALL_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

// react-native-web's Alert.alert is a no-op, so the web build (used for
// local preview and for the Playwright e2e suite) needs browser-native
// fallbacks for both the confirm prompt and the plain notice.
function confirmThen(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'キャンセル', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

function formatDateLabel(date: DateKey): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}（${WEEKDAY_LABELS[dateKeyToDayOfWeek(date)]}）`;
}

function formatTime(time: TimeOfDay): string {
  return time.slice(0, 5);
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
  const [message, setMessage] = useState('');

  const isTodayRow = dayOfWeek === todayDayOfWeek;
  const locked = isTodayRow && isScheduleEditLockedForDate(entries, today);

  const handleSave = useCallback(async () => {
    if (enabled && !isValidTargetTime(targetTime)) {
      setMessage(`目標時刻は${formatTime(MIN_TARGET_TIME)}〜${formatTime(MAX_TARGET_TIME)}の範囲で入力してください`);
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
    <View
      testID={`schedule-row-${dayOfWeek}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, opacity: locked ? 0.5 : 1 }}
    >
      <Text style={{ width: 24 }}>{WEEKDAY_LABELS[dayOfWeek]}</Text>
      <Switch
        testID={`schedule-enabled-${dayOfWeek}`}
        value={enabled}
        onValueChange={setEnabled}
        disabled={locked}
      />
      {enabled ? (
        <TimeOfDayField
          testID={`schedule-time-${dayOfWeek}`}
          value={targetTime}
          onChange={setTargetTime}
          disabled={locked}
        />
      ) : (
        <Text style={{ color: '#9E9E9E' }}>－</Text>
      )}
      <Pressable testID={`schedule-save-${dayOfWeek}`} onPress={handleSave} disabled={locked} style={{ padding: 8 }}>
        <Text>保存</Text>
      </Pressable>
      {message ? <Text testID={`schedule-message-${dayOfWeek}`} style={{ fontSize: 12 }}>{message}</Text> : null}
    </View>
  );
}

const ENTRY_ERROR_MESSAGES: Record<string, string> = {
  'save-failed': '保存に失敗しました。もう一度お試しください',
  'out-of-edit-window': `修正できるのは今日から${PARENT_EDIT_WINDOW_DAYS}日前までです`,
  'no-target-for-date': 'この日は目標が設定されていません',
  'invalid-edit-time': `${formatTime(MIN_TARGET_TIME)}〜${formatTime(MAX_TARGET_TIME)}の範囲で、現在より前の時刻を入力してください`,
  'no-entry-to-cancel': '取り消す記録がありません',
};

// One day in the parent correction list. Row states:
//
//   no target (OFF day)   -> read-only
//   no record             -> [追加]
//   cancelled             -> [追加]        (re-entering a time restores it)
//   recorded              -> [時刻を変更] [取り消す]
function RecentEntryRow({ date }: { date: DateKey }) {
  const entries = useAppStore((s) => s.entries);
  const schedule = useAppStore((s) => s.schedule);
  const setEntryTimeByParentAndPersist = useAppStore((s) => s.setEntryTimeByParentAndPersist);
  const cancelEntryAndPersist = useAppStore((s) => s.cancelEntryAndPersist);

  const entry = entries.entries[date];
  const rule = getEffectiveRule(schedule, dateKeyToDayOfWeek(date), date);
  const status = getDayCalendarStatus(entries, schedule, date);
  const active = Boolean(entry && !entry.cancelled);
  const [draftTime, setDraftTime] = useState<TimeOfDay>(entry?.punchedAtLocalTime ?? rule?.targetTime ?? DEFAULT_TARGET_TIME);
  const [message, setMessage] = useState('');

  const reportResult = useCallback((success: boolean, doneMessage: string) => {
    if (success) {
      setMessage(doneMessage);
    } else {
      const lastError = useAppStore.getState().lastError;
      setMessage((lastError && ENTRY_ERROR_MESSAGES[lastError]) ?? '保存に失敗しました');
    }
  }, []);

  const handleSave = useCallback(() => {
    const target = entry ? entry.targetTimeSnapshot : rule?.targetTime ?? DEFAULT_TARGET_TIME;
    const outcome = computeEntryStatus(draftTime, target) === 'achieved' ? '達成' : '未達成（遅刻）';
    confirmThen(
      `${formatDateLabel(date)}を${formatTime(draftTime)}で記録しますか？`,
      `判定: ${outcome}`,
      '記録する',
      async () => {
        reportResult(await setEntryTimeByParentAndPersist(date, draftTime), '記録しました');
      }
    );
  }, [date, draftTime, entry, rule, reportResult, setEntryTimeByParentAndPersist]);

  const handleCancel = useCallback(() => {
    confirmThen(
      `${formatDateLabel(date)}の記録を取り消しますか？`,
      '取り消すと「未記録」扱いに戻ります。時刻を入れ直せば元に戻せます。',
      '取り消す',
      async () => {
        reportResult(await cancelEntryAndPersist(date), '取り消しました');
      }
    );
  }, [date, reportResult, cancelEntryAndPersist]);

  let statusLabel: string;
  if (status === 'no-target') statusLabel = '目標なし';
  else if (entry?.cancelled) statusLabel = '取り消し済み';
  else if (status === 'achieved') statusLabel = `達成 ${formatTime(entry!.punchedAtLocalTime)}`;
  else if (status === 'late') statusLabel = `未達成（遅刻） ${formatTime(entry!.punchedAtLocalTime)}`;
  else statusLabel = '未記録';

  let editNote = '';
  if (active && entry?.editedByParent) {
    editNote = entry.originalPunchedAtLocalTime
      ? `親が修正（元 ${formatTime(entry.originalPunchedAtLocalTime)}）`
      : '親が追加';
  }

  return (
    <View testID={`recent-row-${date}`} style={{ paddingVertical: 8, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Text style={{ width: 72 }}>{formatDateLabel(date)}</Text>
        <Text testID={`recent-status-${date}`}>{statusLabel}</Text>
        {editNote ? (
          <Text testID={`recent-note-${date}`} style={{ fontSize: 12, color: '#757575' }}>
            {editNote}
          </Text>
        ) : null}
      </View>
      {status !== 'no-target' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingLeft: 84 }}>
          <TimeOfDayField testID={`recent-time-${date}`} value={draftTime} onChange={setDraftTime} />
          <Pressable testID={`recent-save-${date}`} onPress={handleSave} style={{ padding: 8 }}>
            <Text>{active ? '時刻を変更' : '追加'}</Text>
          </Pressable>
          {active ? (
            <Pressable testID={`recent-cancel-${date}`} onPress={handleCancel} style={{ padding: 8 }}>
              <Text>取り消す</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {message ? (
        <Text testID={`recent-message-${date}`} style={{ fontSize: 12, paddingLeft: 84 }}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

function RecentEntriesSection() {
  const today = getLocalDateKey(new Date());
  const dates: DateKey[] = [];
  for (let i = 0; i <= PARENT_EDIT_WINDOW_DAYS; i++) dates.push(addDaysToDateKey(today, -i));

  return (
    <View style={{ marginTop: 24, gap: 4 }}>
      <Text style={{ fontSize: 16, fontWeight: '600' }}>直近の記録の修正</Text>
      <Text style={{ fontSize: 12, color: '#757575' }}>
        打刻し忘れた日の追加、時刻の変更、取り消しができます（今日から{PARENT_EDIT_WINDOW_DAYS}日前まで）。
      </Text>
      {dates.map((date) => (
        <RecentEntryRow key={date} date={date} />
      ))}
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
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

  const handleLock = useCallback(() => {
    setUnlocked(false);
    setPinInput('');
    setPinMessage('');
  }, []);

  if (!unlocked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Text>保護者確認PINを入力してください</Text>
        <TextInput
          testID="pin-input"
          value={pinInput}
          onChangeText={setPinInput}
          secureTextEntry
          keyboardType="number-pad"
          style={{ borderWidth: 1, padding: 8, width: 120, textAlign: 'center', color: '#000000' }}
        />
        <Pressable testID="pin-confirm-button" onPress={handleUnlock} style={{ padding: 12 }}>
          <Text>確認</Text>
        </Pressable>
        {pinMessage ? <Text testID="pin-message">{pinMessage}</Text> : null}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, gap: 4 }}>
      <Pressable testID="lock-button" onPress={handleLock} style={{ alignSelf: 'flex-end', padding: 8, marginBottom: 8 }}>
        <Text>🔒 ロックする</Text>
      </Pressable>
      <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>曜日ごとの目標起床時刻</Text>
      {ALL_DAYS.map((d) => (
        <ScheduleRow key={d} dayOfWeek={d} />
      ))}
      <RecentEntriesSection />
    </ScrollView>
  );
}
