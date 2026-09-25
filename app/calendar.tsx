import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, type CalendarProps, type DateData } from 'react-native-calendars';
import { useAppStore } from '../store/useAppStore';
import { getDayCalendarStatus } from '../store/entries';
import { getLocalDateKey } from '../store/dateUtils';
import type { DateKey, EntriesState, WeeklyScheduleState } from '../store/types';

type DayStatus = 'achieved' | 'late' | 'no-record' | 'no-target';

// Border style differs per status so days stay distinguishable without
// relying on color alone.
const STATUS_STYLE: Record<DayStatus, { bg: string; fg: string; border: 'solid' | 'dashed' | 'dotted' | 'none' }> = {
  achieved: { bg: '#C8E6C9', fg: '#1B5E20', border: 'solid' },
  late: { bg: '#FFE0B2', fg: '#E65100', border: 'dashed' },
  'no-record': { bg: '#F5F5F5', fg: '#757575', border: 'dotted' },
  'no-target': { bg: '#E0E0E0', fg: '#9E9E9E', border: 'none' },
};

// Exposed via accessibilityLabel so both screen readers and tests can
// identify a day's status unambiguously without relying on color.
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

// Non-cancelled punch times for the given month as "H:MM" (seconds dropped,
// no leading zero on the hour) to fit inside a calendar cell.
export function buildPunchTimesForMonth(
  entries: EntriesState,
  year: number,
  month: number // 1-12
): Record<DateKey, string> {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const times: Record<DateKey, string> = {};
  for (const [dateKey, entry] of Object.entries(entries.entries)) {
    if (!dateKey.startsWith(prefix) || entry.cancelled) continue;
    const [hh, mm] = entry.punchedAtLocalTime.split(':');
    times[dateKey] = `${Number(hh)}:${mm}`;
  }
  return times;
}

const TODAY_COLOR = '#1976D2';

function CalendarDay({ date, marking }: { date?: DateData; marking?: { status?: DayStatus; isToday?: boolean; punchTime?: string } }) {
  if (!date) return null;
  const status = marking?.status ?? 'no-target';
  const style = STATUS_STYLE[status];
  const isToday = marking?.isToday ?? false;
  const punchTime = marking?.punchTime;
  return (
    <View
      testID={`calendar-day-${date.dateString}`}
      accessibilityLabel={punchTime ? `${STATUS_LABEL[status]} ${punchTime}` : STATUS_LABEL[status]}
      style={{
        width: 44,
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
      <Text style={{ color: style.fg, fontSize: 10, lineHeight: 12 }}>{punchTime ?? ''}</Text>
    </View>
  );
}

function LegendItem({ status, label }: { status: DayStatus; label: string }) {
  const style = STATUS_STYLE[status];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          backgroundColor: style.bg,
          borderWidth: style.border === 'none' ? 0 : 1.5,
          borderStyle: style.border === 'none' ? 'solid' : style.border,
          borderColor: style.fg,
        }}
      />
      <Text>{label}</Text>
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

  const punchTimes = useMemo(
    () => buildPunchTimesForMonth(entries, visibleYear, visibleMonth),
    [entries, visibleYear, visibleMonth]
  );

  const markedDates = useMemo(() => {
    const result: Record<string, { status: DayStatus; isToday: boolean; punchTime?: string }> = {};
    for (const [dateKey, status] of Object.entries(marked)) {
      result[dateKey] = { status, isToday: dateKey === today, punchTime: punchTimes[dateKey] };
    }
    return result;
  }, [marked, punchTimes, today]);

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
        <LegendItem status="achieved" label="達成" />
        <LegendItem status="late" label="未達成" />
        <LegendItem status="no-record" label="未記録" />
        <LegendItem status="no-target" label="目標なし" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 14, height: 14, borderRadius: 3, borderWidth: 2, borderColor: TODAY_COLOR }} />
          <Text style={{ color: TODAY_COLOR, fontWeight: '700' }}>今日</Text>
        </View>
      </View>
    </View>
  );
}
