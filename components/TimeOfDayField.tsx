import { useCallback, useState, type ChangeEvent } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { TimeOfDay } from '../store/types';

// Lives outside app/ on purpose: expo-router turns every file under app/
// into a route.

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

// An "HH:MM" time input that works on Android, iOS and web, shared by every
// parent-facing time field so the per-platform picker quirks live in one place.
export function TimeOfDayField({
  value,
  onChange,
  disabled = false,
  testID,
}: {
  value: TimeOfDay;
  onChange: (time: TimeOfDay) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleTimeChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
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
      onChange(dateToTimeOfDay(selected));
    },
    [onChange]
  );

  const handleWebTimeChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (!e.target.value) return;
      onChange(`${e.target.value}:00`);
    },
    [onChange]
  );

  if (Platform.OS === 'web') {
    // @react-native-community/datetimepicker has no web implementation
    // (it renders null there), so the browser's own time input is used.
    return (
      <input
        type="time"
        data-testid={testID}
        value={value.slice(0, 5)}
        disabled={disabled}
        onChange={handleWebTimeChange}
      />
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable testID={testID} onPress={() => !disabled && setPickerOpen(true)} disabled={disabled}>
        <Text>{value.slice(0, 5)}</Text>
      </Pressable>
      {pickerOpen ? (
        <>
          <DateTimePicker value={timeOfDayToDate(value)} mode="time" is24Hour onChange={handleTimeChange} />
          {Platform.OS === 'ios' ? (
            <Pressable onPress={() => setPickerOpen(false)} style={{ padding: 8 }}>
              <Text>完了</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
