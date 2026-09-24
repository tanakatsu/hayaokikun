import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, type CalendarProps, type DateData } from 'react-native-calendars';
import { useAppStore } from '../store/useAppStore';
import { getDayCalendarStatus } from '../store/entries';
import { getLocalDateKey } from '../store/dateUtils';
import type { DateKey, EntriesState, WeeklyScheduleState } from '../store/types';

type DayStatus = 'achieved' | 'late' | 'no-record' | 'no-target';

const STATUS_STYLE: Record<DayStatus, { bg: string; fg: string; glyph: string; border: 'solid' | 'dashed' | 'dotted' | 'none' }> = {
  achieved: { bg: '#C8E6C9', fg: '#1B5E20', glyph: '✓', border: 'solid' },
  late: { bg: '#FFE0B2', fg: '#E65100', glyph: '△', border: 'dashed' },
  'no-record': { bg: '#F5F5F5', fg: '#757575', glyph: '・', border: 'dotted' },
  'no-target': { bg: '#E0E0E0', fg: '#9E9E9E', glyph: '', border: 'none' },
};

// Exposed via accessibilityLabel (not just the glyph) so both screen readers
// and tests can identify a day's status unambiguously — 'no-target' has no
// glyph of its own, and 'achieved'/'late' glyphs alone aren't self-describing.
export const STATUS_LABEL: Record<DayStatus, string> = {
  achieved: '達成',
  late: '未達成（遅刻）',
  'no-record': '未記録',
  'no-target': '目標なし',
};

export function buildMarkedStatusesForMonth(
  entries: EntriesState,
  schedule: WeeklyScheduleState,
  year: number,
  month: number // 1-12
): Record<DateKey, DayStatus> {
  const daysInMonth = new Date(year, month, 0).getDate();
  const marked: Record<DateKey, DayStatus> = {};
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey: DateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    marked[dateKey] = getDayCalendarStatus(entries, schedule, dateKey);
  }
  return marked;
}

const TODAY_COLOR = '#1976D2';

function CalendarDay({ date, marking }: { date?: DateData; marking?: { status?: DayStatus; isToday?: boolean } }) {
  if (!date) return null;
  const status = marking?.status ?? 'no-target';
  const style = STATUS_STYLE[status];
  const isToday = marking?.isToday ?? false;
  return (
    <View
      testID={`calendar-day-${date.dateString}`}
      accessibilityLabel={STATUS_LABEL[status]}
      style={{
        width: 34,
        height: 42,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: style.bg,
        borderRadius: 6,
        borderWidth: isToday ? 2 : style.border === 'none' ? 0 : 1.5,
        borderStyle: isToday || style.border === 'none' ? 'solid' : style.border,
        borderColor: isToday ? TODAY_COLOR : style.fg,
      }}
    >
      <Text style={{ color: style.fg, fontWeight: isToday ? '800' : '600' }}>{date.day}</Text>
      <Text style={{ color: style.fg, fontSize: 10, lineHeight: 12 }}>{style.glyph}</Text>
    </View>
  );
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const entries = useAppStore((s) => s.entries);
  const schedule = useAppStore((s) => s.schedule);
  const today = getLocalDateKey(new Date());
  const [visibleYear, setVisibleYear] = useState(Number(today.slice(0, 4)));
  const [visibleMonth, setVisibleMonth] = useState(Number(today.slice(5, 7)));

  const marked = useMemo(
    () => buildMarkedStatusesForMonth(entries, schedule, visibleYear, visibleMonth),
    [entries, schedule, visibleYear, visibleMonth]
  );

  const markedDates = useMemo(() => {
    const result: Record<string, { status: DayStatus; isToday: boolean }> = {};
    for (const [dateKey, status] of Object.entries(marked)) {
      result[dateKey] = { status, isToday: dateKey === today };
    }
    return result;
  }, [marked, today]);

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 12 }}>
      <Calendar
        current={`${visibleYear}-${String(visibleMonth).padStart(2, '0')}-01`}
        onMonthChange={(m: DateData) => {
          setVisibleYear(m.year);
          setVisibleMonth(m.month);
        }}
        // buildMarkedStatusesForMonth only builds statuses for the visible
        // month, so leading/trailing days from adjacent months would
        // otherwise render with the wrong (default 'no-target') status.
        hideExtraDays
        // react-native-calendars' MarkingProps/DayProps types are "weak"
        // (every field optional) and don't declare our custom `status`
        // field, so TS's weak-type check rejects a direct assignment even
        // though the library passes markedDates[key] and dayComponent's
        // `marking` prop through untouched at runtime. Cast through the
        // library's own declared prop types (not `any`) to stay accurate
        // to whatever shape the installed version actually expects.
        markedDates={markedDates as CalendarProps['markedDates']}
        dayComponent={CalendarDay as CalendarProps['dayComponent']}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16, justifyContent: 'center' }}>
        <Text>✓ 達成</Text>
        <Text>△ 未達成</Text>
        <Text>・ 未記録</Text>
        <Text style={{ color: '#9E9E9E' }}>（空欄）目標なし</Text>
        <Text style={{ color: TODAY_COLOR, fontWeight: '700' }}>枠線＝今日</Text>
      </View>
    </View>
  );
}
