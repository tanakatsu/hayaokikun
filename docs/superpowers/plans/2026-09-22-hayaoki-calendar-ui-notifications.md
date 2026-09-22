# Hayaoki Calendar, Points/Streak UI, Messages, Cancellation & Notifications (T8–T14) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the remaining Sunday-scope of 早起きくん on top of the already-shipped store foundation (T1–T7): the 4-state color-coded calendar (T8), a full 7-row weekly schedule editor with a native time picker (T9), points/streak/character display on the Today screen (T10), the 5 encouragement-message triggers (T11), parent-only record cancellation (T12), optional local reminder notifications (T13), and the remaining pure-function test gaps (T14).

**Architecture:** All new business logic stays in `store/` as pure functions (matching the existing `entries.ts`/`schedule.ts` pattern) so it stays unit-testable per the project's 3A scope decision (data-model pure functions only — no automated UI/E2E tests). New UI-only concerns (calendar rendering, the weekly editor, message/character display) live in `app/` and `lib/`. `app/_layout.tsx` is upgraded from a plain `Stack` to a `Tabs` layout so Today/Calendar/Settings become reachable in-app (this was a latent gap: no screen currently links to another). Notification scheduling is kept out of the Zustand store entirely — it's a side effect wired from the UI layer via a store subscription — so the already-tested `useAppStore.test.ts` never needs to mock a native module.

**Tech Stack:** Expo Router `Tabs`, `react-native-calendars` (calendar grid with a custom `dayComponent` for colorblind-safe color+shape+glyph coding), `@react-native-community/datetimepicker` (native time picker), `expo-notifications` (optional local reminders), Jest (`jest-expo` preset) for all new pure-function tests.

**Spec:** `docs/designs/hayaoki-app.md` (Status: APPROVED, VERDICT: CLEARED)

**Prior plan:** `docs/superpowers/plans/2026-09-21-hayaoki-store-foundation.md` (T1–T7, already implemented and merged — read it for the existing store API before touching anything)

## Global Constraints

Copied verbatim (or directly derived) from the spec; every task below implicitly inherits these:

- **Punch window**: 04:00:00–12:00:00 local time only. Already enforced in `today.tsx`; do not change.
- **Achievement judgement**: punch time ≤ target time, compared to the second. Already implemented (`computeEntryStatus`); reuse, don't reimplement.
- **Scoring model**: achieved = **+2**, late = 0, no-record = 0, no-target (OFF day) = excluded entirely from scoring. Never subtract points — a late tap must score identically to a no-record day (no "safer not to tap" loophole).
- **Points floor**: the points balance is never negative (clamp at 0 defensively, even though the derivation described below can't actually go negative).
- **Streak definition**: consecutive ON-day achievements; OFF days are skipped (neither counted nor breaking); a late punch or no-record breaks the streak. Already implemented (`computeAchievementStreak`); reuse.
- **No delete-and-repunch**: a recorded day can never be edited or re-punched by the child. Only a parent, from Settings, can cancel a record back to "no record," keeping the original punch timestamp on the (now-cancelled) `Entry` — never delete the `Entry` object, or the duplicate-punch guard in `recordPunchIn` would stop blocking a second punch on that date.
- **Per-weekday ON/OFF + append-only history**: target time / ON-off changes are appended with an `effectiveFrom` date, never overwritten; classifying a past date always uses the rule in effect *on that date*. Already implemented (`addScheduleRule`, `getEffectiveRule`); reuse.
- **Settings protection**: schedule changes require the parent PIN; once **that specific weekday's** entry is recorded for today, **that weekday's** target time is locked from further edits for today (locking must be scoped to the punched weekday only — see Task 3, which fixes a bug where the current check locks *any* weekday's edit once *any* punch happens today).
- **Target-time input range**: 04:00:00–12:00:00, default 07:00:00, matching the punch window.
- **Persistence guarantee**: any new state mutation (cancellation included) updates in-memory state only after the AsyncStorage write is confirmed; a failed write leaves state untouched and surfaces an error.
- **Colorblind-safe calendar**: the 4 calendar states must be distinguishable by more than color alone (shape/glyph too).
- **Testing scope (3A, unchanged)**: only pure data-model functions get automated tests; screens (`app/*.tsx`) are verified manually. New pure functions introduced by this plan (points, messages, notification-schedule mapping) follow the same rule — they get colocated unit tests because they're cheap, deterministic pure functions, not because the UI screens do.

---

## Task 1: Reachable navigation — Today / Calendar / Settings tabs

**Files:**
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: an in-app way to reach the calendar screen Task 2 adds and the settings screen that already exists — required before Task 2's manual QA is even possible.

- [ ] **Step 1: Replace the root `Stack` with a `Tabs` layout**

Read the current file first (`app/_layout.tsx`) — it's 13 lines, just a `Stack` plus the hydrate-on-mount effect. Replace its contents:

```tsx
import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { useAppStore } from '../store/useAppStore';

export default function RootLayout() {
  useEffect(() => {
    if (!useAppStore.getState().hydrated) {
      useAppStore.getState().hydrate();
    }
  }, []);

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="today" options={{ title: '今日' }} />
      <Tabs.Screen name="calendar" options={{ title: 'カレンダー' }} />
      <Tabs.Screen name="settings" options={{ title: '設定' }} />
    </Tabs>
  );
}
```

`href: null` on the `index` route hides the redirect-only screen from the tab bar without removing it from the router.

- [ ] **Step 2: Manual QA**

`app/calendar.tsx` doesn't exist yet (Task 2 creates it), so `expo start` will currently warn about a missing route for the "カレンダー" tab. That's expected and temporary — don't stub a placeholder file; Task 2 creates the real one next. Confirm the "今日" and "設定" tabs render and switch correctly.

- [ ] **Step 3: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: add tab navigation for today/calendar/settings screens"
```

---

## Task 2: Calendar screen with 4-state colorblind-safe color coding

**Files:**
- Modify: `package.json` (add `react-native-calendars`)
- Create: `app/calendar.tsx`

**Interfaces:**
- Consumes: `getDayCalendarStatus(entries, schedule, date): 'achieved' | 'late' | 'no-record' | 'no-target'` from `store/entries.ts` (already implemented — do not duplicate this logic in the UI layer).
- Produces: a `/calendar` route, reachable via the tab bar from Task 1.

- [ ] **Step 1: Install the calendar library pinned to the installed Expo SDK**

```bash
npx expo install react-native-calendars
```

- [ ] **Step 2: Create `app/calendar.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
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

function CalendarDay({ date, marking }: { date?: DateData; marking?: { status?: DayStatus } }) {
  if (!date) return null;
  const status = marking?.status ?? 'no-target';
  const style = STATUS_STYLE[status];
  return (
    <View
      style={{
        width: 34,
        height: 42,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: style.bg,
        borderRadius: 6,
        borderWidth: style.border === 'none' ? 0 : 1.5,
        borderStyle: style.border === 'none' ? 'solid' : style.border,
        borderColor: style.fg,
      }}
    >
      <Text style={{ color: style.fg, fontWeight: '600' }}>{date.day}</Text>
      <Text style={{ color: style.fg, fontSize: 10, lineHeight: 12 }}>{style.glyph}</Text>
    </View>
  );
}

export default function CalendarScreen() {
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
    const result: Record<string, { status: DayStatus }> = {};
    for (const [dateKey, status] of Object.entries(marked)) {
      result[dateKey] = { status };
    }
    return result;
  }, [marked]);

  return (
    <View style={{ flex: 1, paddingTop: 12 }}>
      <Calendar
        current={`${visibleYear}-${String(visibleMonth).padStart(2, '0')}-01`}
        onMonthChange={(m: DateData) => {
          setVisibleYear(m.year);
          setVisibleMonth(m.month);
        }}
        markedDates={markedDates}
        dayComponent={CalendarDay}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16, justifyContent: 'center' }}>
        <Text>✓ 達成</Text>
        <Text>△ 未達成</Text>
        <Text>・ 未記録</Text>
        <Text style={{ color: '#9E9E9E' }}>（空欄）目標なし</Text>
      </View>
    </View>
  );
}
```

`buildMarkedStatusesForMonth` is exported specifically so it can be unit-tested without rendering React Native components (see Step 3) — the calendar's built-in `markingType`/`dot` styling is bypassed entirely in favor of the custom `dayComponent`, since colored dots alone would still only encode color, not shape.

- [ ] **Step 3: Write a unit test for the pure date-range logic**

Create `app/calendar.test.ts` (not `.tsx` — this test imports no React Native components, only the exported pure function, keeping it outside the "screens are manual-QA-only" rule since it touches zero rendering):

```ts
import { buildMarkedStatusesForMonth } from './calendar';
import { createEmptyEntriesState, recordPunchIn } from '../store/entries';
import { createInitialSchedule, addScheduleRule } from '../store/schedule';
import type { DayOfWeek } from '../store/types';

describe('buildMarkedStatusesForMonth', () => {
  it('maps every day in the month to its calendar status', () => {
    const schedule = createInitialSchedule('2026-01-01');
    const entries = recordPunchIn(createEmptyEntriesState(), '2026-09-05', 1, '06:50:00', '07:00:00');
    const marked = buildMarkedStatusesForMonth(entries, schedule, 2026, 9);

    expect(Object.keys(marked)).toHaveLength(30);
    expect(marked['2026-09-05']).toBe('achieved');
    expect(marked['2026-09-06']).toBe('no-record');
  });

  it('marks an OFF weekday as no-target for every occurrence in the month', () => {
    let schedule = createInitialSchedule('2026-01-01');
    const sundayDayOfWeek = new Date(2026, 8, 6).getDay() as DayOfWeek; // 2026-09-06 is a Sunday
    schedule = addScheduleRule(schedule, {
      dayOfWeek: sundayDayOfWeek,
      enabled: false,
      targetTime: '07:00:00',
      effectiveFrom: '2026-01-01',
    });
    const marked = buildMarkedStatusesForMonth(createEmptyEntriesState(), schedule, 2026, 9);

    expect(marked['2026-09-06']).toBe('no-target');
    expect(marked['2026-09-13']).toBe('no-target'); // the following Sunday
  });
});
```

- [ ] **Step 4: Run the test**

```bash
npx jest app/calendar.test.ts
```

Expected: PASS.

- [ ] **Step 5: Manual QA**

Run `npx expo start`, open the app, go to the カレンダー tab. Punch in today (from the 今日 tab first if needed) and confirm: the punched day shows a green solid-bordered cell with `✓`; navigate to a month with no entries and confirm ON days show a dotted gray `・` cell and any OFF weekday shows a plain gray cell with no glyph and no border.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app/calendar.tsx app/calendar.test.ts
git commit -m "feat: add 4-state color+shape calendar screen"
```

---

## Task 3: Fix the same-day schedule lock to be per-weekday (prerequisite for Task 4)

The existing `addScheduleRuleAndPersist` (from T5) blocks **any** schedule-rule save with `effectiveFrom === today` once **any** punch is recorded today — regardless of which weekday the rule is for. That's overly broad: it happens to look correct today only because the current Settings screen can only edit *today's own* weekday. Task 4 turns Settings into a 7-row editor, where a parent must still be able to edit **other** weekdays' targets even after today's own punch is locked. This task fixes the check before Task 4 needs it.

**Files:**
- Modify: `store/useAppStore.ts`
- Modify: `store/useAppStore.test.ts`

**Interfaces:**
- Consumes: `isScheduleEditLockedForDate(entries, date)` from `store/entries.ts` (unchanged).
- Produces: `addScheduleRuleAndPersist` now locks only the rule whose `dayOfWeek` matches today's actual weekday — every other weekday's rule remains editable even after today's punch.

- [ ] **Step 1: Write the failing test**

Add to `store/useAppStore.test.ts`, inside the existing `describe('useAppStore addScheduleRuleAndPersist', ...)` block:

```ts
  it('allows a change to a different weekday even if today (a different weekday) is already punched', async () => {
    mockedPersistence.saveEntriesState.mockResolvedValue(undefined);
    const store = createAppStore();
    await store.getState().hydrate();
    // 2026-09-21 is a Monday (dayOfWeek 1); punch today, then edit Wednesday's (dayOfWeek 3) rule.
    await store.getState().punchIn('2026-09-21', 1000, '06:55:00', '07:00:00');

    const success = await store.getState().addScheduleRuleAndPersist({
      dayOfWeek: 3,
      enabled: true,
      targetTime: '08:00:00',
      effectiveFrom: '2026-09-21',
    });

    expect(success).toBe(true);
    expect(mockedPersistence.saveScheduleState).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest store/useAppStore.test.ts -t "allows a change to a different weekday"
```

Expected: FAIL — `success` is `false` because the current check ignores `dayOfWeek`.

- [ ] **Step 3: Fix `addScheduleRuleAndPersist`**

In `store/useAppStore.ts`, add the import and narrow the lock check:

```ts
import { getLocalDateKey } from './dateUtils';
```
(already imported — no change needed there)

Replace:

```ts
    addScheduleRuleAndPersist: async (rule) => {
      if (!get().hydrated) {
        set({ lastError: 'not-hydrated' });
        return false;
      }
      const today = getLocalDateKey(new Date());
      if (rule.effectiveFrom < today) {
        set({ lastError: 'schedule-locked-today' });
        return false;
      }
      if (rule.effectiveFrom === today && isScheduleEditLockedForDate(get().entries, today)) {
        set({ lastError: 'schedule-locked-today' });
        return false;
      }
```

with:

```ts
    addScheduleRuleAndPersist: async (rule) => {
      if (!get().hydrated) {
        set({ lastError: 'not-hydrated' });
        return false;
      }
      const today = getLocalDateKey(new Date());
      const todayDayOfWeek = new Date().getDay() as DayOfWeek;
      if (rule.effectiveFrom < today) {
        set({ lastError: 'schedule-locked-today' });
        return false;
      }
      if (
        rule.effectiveFrom === today &&
        rule.dayOfWeek === todayDayOfWeek &&
        isScheduleEditLockedForDate(get().entries, today)
      ) {
        set({ lastError: 'schedule-locked-today' });
        return false;
      }
```

Add `DayOfWeek` to the existing type-only import at the top of the file:

```ts
import type { EntriesState, ScheduleRule, WeeklyScheduleState, DateKey, TimeOfDay, DayOfWeek } from './types';
```

- [ ] **Step 4: Run all `useAppStore` tests to confirm both the new test passes and the existing lock test still passes**

```bash
npx jest store/useAppStore.test.ts
```

Expected: PASS (all tests, including the pre-existing `'blocks a change to today once today is already punched'` test, which uses `dayOfWeek: 1` — 2026-09-21 is in fact a Monday, `dayOfWeek === 1`, so that test still correctly represents "same weekday as today").

- [ ] **Step 5: Commit**

```bash
git add store/useAppStore.ts store/useAppStore.test.ts
git commit -m "fix: scope the same-day schedule lock to today's own weekday"
```

---

## Task 4: Settings — full 7-row weekly schedule editor with native time picker

**Files:**
- Modify: `package.json` (add `@react-native-community/datetimepicker`)
- Modify: `app/settings.tsx` (replaces the current single-weekday editor entirely)

**Interfaces:**
- Consumes: `getEffectiveRule`, `isValidTargetTime`, `MIN_TARGET_TIME`, `MAX_TARGET_TIME`, `DEFAULT_TARGET_TIME` from `store/schedule.ts`; `isScheduleEditLockedForDate` from `store/entries.ts`; `addScheduleRuleAndPersist` from the store (now per-weekday-scoped per Task 3).
- Produces: nothing new consumed by later tasks (Task 6's cancel UI lives in the same file but is additive, not dependent on this task's internals).

- [ ] **Step 1: Install the native time picker**

```bash
npx expo install @react-native-community/datetimepicker
```

- [ ] **Step 2: Replace `app/settings.tsx`**

```tsx
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAppStore } from '../store/useAppStore';
import { verifyPin } from '../store/pin';
import { getLocalDateKey } from '../store/dateUtils';
import { isScheduleEditLockedForDate } from '../store/entries';
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

  const handleTimeChange = useCallback((_event: DateTimePickerEvent, selected?: Date) => {
    setPickerOpen(false);
    if (!selected) return;
    setTargetTime(dateToTimeOfDay(selected));
  }, []);

  const handleSave = useCallback(async () => {
    if (enabled && !isValidTargetTime(targetTime)) {
      setMessage('目標時刻は04:00〜12:00の範囲で入力してください');
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
        <Pressable onPress={() => !locked && setPickerOpen(true)} disabled={locked}>
          <Text>{targetTime.slice(0, 5)}</Text>
        </Pressable>
      ) : (
        <Text style={{ color: '#9E9E9E' }}>－</Text>
      )}
      <Pressable onPress={handleSave} disabled={locked} style={{ padding: 8 }}>
        <Text>保存</Text>
      </Pressable>
      {message ? <Text style={{ fontSize: 12 }}>{message}</Text> : null}
      {pickerOpen ? (
        <DateTimePicker value={timeOfDayToDate(targetTime)} mode="time" is24Hour onChange={handleTimeChange} />
      ) : null}
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
    </ScrollView>
  );
}
```

Note: this fully replaces the prior single-row `SettingsScreen`. Task 6 (record cancellation) appends a new section to the bottom of this same returned `ScrollView` — do not treat that as a conflicting rewrite, just an addition at implementation time.

- [ ] **Step 3: Manual QA**

Start the app, unlock Settings with the PIN, confirm all 7 rows render with the seeded 07:00 default. Toggle a day OFF and confirm its time control becomes a grayed `－` with Save still enabled. Punch in today's entry from the Today tab, return to Settings, and confirm **only today's own weekday row** is grayed/locked — every other row must remain editable and save successfully. Try an out-of-range time (if your platform's picker allows it) and confirm the validation message appears.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app/settings.tsx
git commit -m "feat: replace single-day settings editor with 7-row weekly schedule editor"
```

---

## Task 5: Today screen — points balance, streak, and character

**Files:**
- Modify: `store/entries.ts` (add `computePointsBalance`)
- Modify: `store/entries.test.ts`
- Modify: `app/today.tsx`

**Interfaces:**
- Consumes: `getDayCalendarStatus` (existing), `computeAchievementStreak` (existing).
- Produces: `computePointsBalance(entries: EntriesState, schedule: WeeklyScheduleState): number` — later reused as-is by nothing else in this plan, but it's the canonical points source of truth (no separate persisted points field is introduced; points are always derived from entries, which also makes T6's cancellation automatically reduce the total with zero extra bookkeeping).

- [ ] **Step 1: Write the failing test**

Add to `store/entries.test.ts`:

```ts
import { computePointsBalance } from './entries'; // add to the existing import from './entries' instead of a new line
```

(Add `computePointsBalance` to the existing `import { ... } from './entries'` statement at the top of the file rather than a second import line.)

```ts
describe('computePointsBalance', () => {
  it('awards 2 points per achieved day and 0 for late/no-record/no-target', () => {
    const schedule = createInitialSchedule('2026-01-01');
    let entries = createEmptyEntriesState();
    entries = recordPunchIn(entries, '2026-09-01', 1, '06:50:00', '07:00:00'); // achieved
    entries = recordPunchIn(entries, '2026-09-02', 1, '07:10:00', '07:00:00'); // late

    expect(computePointsBalance(entries, schedule)).toBe(2);
  });

  it('excludes a cancelled achieved entry from the total', () => {
    const schedule = createInitialSchedule('2026-01-01');
    let entries = recordPunchIn(createEmptyEntriesState(), '2026-09-01', 1, '06:50:00', '07:00:00');
    entries = {
      entries: { ...entries.entries, '2026-09-01': { ...entries.entries['2026-09-01'], cancelled: true } },
    };

    expect(computePointsBalance(entries, schedule)).toBe(0);
  });

  it('never goes negative', () => {
    expect(computePointsBalance(createEmptyEntriesState(), createInitialSchedule('2026-01-01'))).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest store/entries.test.ts -t "computePointsBalance"
```

Expected: FAIL with "computePointsBalance is not a function" (or a TypeScript error if run through `tsc`).

- [ ] **Step 3: Implement `computePointsBalance` in `store/entries.ts`**

Add near `getDayCalendarStatus` (which it depends on):

```ts
const POINTS_PER_ACHIEVED_DAY = 2;

export function computePointsBalance(entries: EntriesState, schedule: WeeklyScheduleState): number {
  let total = 0;
  for (const date of Object.keys(entries.entries)) {
    if (getDayCalendarStatus(entries, schedule, date) === 'achieved') {
      total += POINTS_PER_ACHIEVED_DAY;
    }
  }
  return Math.max(0, total);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest store/entries.test.ts
```

Expected: PASS (all tests in the file, including the new ones).

- [ ] **Step 5: Add points, streak, and a status-driven character to `app/today.tsx`**

In `app/today.tsx`, add the import and derive the three display values inside the component (near the existing `entries`/`schedule` selectors):

```tsx
import { computeAchievementStreak, computePointsBalance, getDayCalendarStatus } from '../store/entries';
```

Inside `TodayScreen`, after the existing `useAppStore` selectors:

```tsx
  const today = getLocalDateKey(new Date());
  const points = hydrated ? computePointsBalance(entries, schedule) : 0;
  const streak = hydrated ? computeAchievementStreak(entries, schedule, today) : 0;
  const todayStatus = hydrated ? getDayCalendarStatus(entries, schedule, today) : 'no-record';
  const CHARACTER: Record<typeof todayStatus, string> = {
    achieved: '😄',
    late: '😥',
    'no-record': '😴',
    'no-target': '😌',
  };
```

And render it above the existing punch button `<View>`:

```tsx
      <Text style={{ fontSize: 48 }}>{CHARACTER[todayStatus]}</Text>
      <Text style={{ fontSize: 18 }}>ポイント: {points}</Text>
      <Text style={{ fontSize: 14 }}>連続達成: {streak}日</Text>
```

(Place these three `Text`/character lines as the first children inside the existing root `<View style={{ flex: 1, ... }}>`, before the `<Pressable>` punch button.)

- [ ] **Step 6: Manual QA**

Open Today, confirm the sleepy-face character and `ポイント: 0` show before any punch. Punch in before the target time, confirm the character switches to 😄, points becomes `2`, and streak becomes `1`. Restart the app (or reload) to confirm the values persist via the existing hydrate flow.

- [ ] **Step 7: Commit**

```bash
git add store/entries.ts store/entries.test.ts app/today.tsx
git commit -m "feat: show points balance, achievement streak, and status character on Today"
```

---

## Task 6: Encouragement messages (5 required triggers + sensible defaults)

**Files:**
- Create: `lib/messages.ts`
- Create: `lib/messages.test.ts`
- Modify: `app/today.tsx`

**Interfaces:**
- Consumes: `getDayCalendarStatus`, `computeAchievementStreak` from `store/entries.ts`; `addDaysToDateKey` from `store/dateUtils.ts`.
- Produces: `selectEncouragementMessage(entries: EntriesState, schedule: WeeklyScheduleState, date: DateKey): string | null`.

- [ ] **Step 1: Write the failing tests**

Create `lib/messages.test.ts`:

```ts
import { selectEncouragementMessage } from './messages';
import { createEmptyEntriesState, recordPunchIn } from '../store/entries';
import { createInitialSchedule } from '../store/schedule';

describe('selectEncouragementMessage', () => {
  it('returns null when nothing is recorded yet today', () => {
    const schedule = createInitialSchedule('2026-01-01');
    expect(selectEncouragementMessage(createEmptyEntriesState(), schedule, '2026-09-21')).toBeNull();
  });

  it('returns null on an OFF (no-target) day', () => {
    const schedule = createInitialSchedule('2026-01-01');
    const offDay = { rules: schedule.rules.map((r) => ({ ...r, enabled: false })) };
    expect(selectEncouragementMessage(createEmptyEntriesState(), offDay, '2026-09-21')).toBeNull();
  });

  it('fires the first-ever-achieved message on the very first achieved day', () => {
    const schedule = createInitialSchedule('2026-01-01');
    const entries = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1, '06:50:00', '07:00:00');
    expect(selectEncouragementMessage(entries, schedule, '2026-09-21')).toMatch(/はじめて/);
  });

  it('fires the 3-day-streak message on the 3rd consecutive achieved day', () => {
    const schedule = createInitialSchedule('2026-01-01');
    let entries = createEmptyEntriesState();
    entries = recordPunchIn(entries, '2026-09-19', 1, '06:50:00', '07:00:00');
    entries = recordPunchIn(entries, '2026-09-20', 1, '06:50:00', '07:00:00');
    entries = recordPunchIn(entries, '2026-09-21', 1, '06:50:00', '07:00:00');
    expect(selectEncouragementMessage(entries, schedule, '2026-09-21')).toMatch(/3日連続/);
  });

  it('fires the 7-day-streak message on the 7th consecutive achieved day', () => {
    const schedule = createInitialSchedule('2026-01-01');
    let entries = createEmptyEntriesState();
    const dates = ['09-15', '09-16', '09-17', '09-18', '09-19', '09-20', '09-21'].map((d) => `2026-${d}`);
    for (const d of dates) entries = recordPunchIn(entries, d, 1, '06:50:00', '07:00:00');
    expect(selectEncouragementMessage(entries, schedule, '2026-09-21')).toMatch(/7日連続/);
  });

  it('falls back to a generic achieved message once past the special triggers', () => {
    const schedule = createInitialSchedule('2026-01-01');
    let entries = createEmptyEntriesState();
    const dates = ['09-17', '09-18', '09-19', '09-20', '09-21'].map((d) => `2026-${d}`); // streak of 5
    for (const d of dates) entries = recordPunchIn(entries, d, 1, '06:50:00', '07:00:00');
    const msg = selectEncouragementMessage(entries, schedule, '2026-09-21');
    expect(msg).not.toMatch(/はじめて|3日連続|7日連続/);
    expect(msg).not.toBeNull();
  });

  it('fires the first-ever-unachieved message on the very first late day', () => {
    const schedule = createInitialSchedule('2026-01-01');
    const entries = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1, '07:10:00', '07:00:00');
    expect(selectEncouragementMessage(entries, schedule, '2026-09-21')).toMatch(/遅かった|また明日/);
  });

  it('prefers the streak-broken message over the first-unachieved message when both apply', () => {
    const schedule = createInitialSchedule('2026-01-01');
    let entries = createEmptyEntriesState();
    entries = recordPunchIn(entries, '2026-09-19', 1, '06:50:00', '07:00:00');
    entries = recordPunchIn(entries, '2026-09-20', 1, '06:50:00', '07:00:00');
    entries = recordPunchIn(entries, '2026-09-21', 1, '07:10:00', '07:00:00'); // first-ever late, also breaks a streak of 2
    expect(selectEncouragementMessage(entries, schedule, '2026-09-21')).toMatch(/ここまで|途切れ/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest lib/messages.test.ts
```

Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `lib/messages.ts`**

```ts
import { computeAchievementStreak, getDayCalendarStatus } from '../store/entries';
import { addDaysToDateKey } from '../store/dateUtils';
import type { DateKey, EntriesState, WeeklyScheduleState } from '../store/types';

const MESSAGES = {
  firstAchieved: 'はじめての早起き達成、やったね!🎉',
  streak3: '3日連続達成中!すごい!',
  streak7: '7日連続達成!早起き名人だね!',
  genericAchieved: '今日も早起きできたね!',
  firstUnachieved: '今日はちょっと遅かったね。また明日がんばろう!',
  streakBroken: '連続記録はここまで。また今日から積み重ねよう!',
  genericLate: 'また明日、早起きにチャレンジしよう!',
} as const;

function countPastStatus(
  entries: EntriesState,
  schedule: WeeklyScheduleState,
  beforeDate: DateKey,
  status: 'achieved' | 'late'
): number {
  let count = 0;
  for (const date of Object.keys(entries.entries)) {
    if (date >= beforeDate) continue; // strictly before today; today is handled separately by the caller
    if (getDayCalendarStatus(entries, schedule, date) === status) count += 1;
  }
  return count;
}

export function selectEncouragementMessage(
  entries: EntriesState,
  schedule: WeeklyScheduleState,
  date: DateKey
): string | null {
  const todayStatus = getDayCalendarStatus(entries, schedule, date);
  if (todayStatus === 'no-target' || todayStatus === 'no-record') return null;

  if (todayStatus === 'achieved') {
    const achievedBeforeToday = countPastStatus(entries, schedule, date, 'achieved');
    if (achievedBeforeToday === 0) return MESSAGES.firstAchieved;
    const streak = computeAchievementStreak(entries, schedule, date);
    if (streak === 3) return MESSAGES.streak3;
    if (streak === 7) return MESSAGES.streak7;
    return MESSAGES.genericAchieved;
  }

  // todayStatus === 'late'
  const previousStreak = computeAchievementStreak(entries, schedule, addDaysToDateKey(date, -1));
  if (previousStreak > 0) return MESSAGES.streakBroken;
  const lateBeforeToday = countPastStatus(entries, schedule, date, 'late');
  if (lateBeforeToday === 0) return MESSAGES.firstUnachieved;
  return MESSAGES.genericLate;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest lib/messages.test.ts
```

Expected: PASS (all 8 tests).

- [ ] **Step 5: Display the message on the Today screen**

In `app/today.tsx`, add the import:

```tsx
import { selectEncouragementMessage } from '../lib/messages';
```

After the `todayStatus`/`CHARACTER` derivation from Task 5, add:

```tsx
  const encouragement = hydrated ? selectEncouragementMessage(entries, schedule, today) : null;
```

Render it just below the character/points/streak block added in Task 5:

```tsx
      {encouragement ? <Text style={{ fontSize: 14, textAlign: 'center' }}>{encouragement}</Text> : null}
```

- [ ] **Step 6: Manual QA**

Punch in as the very first entry ever recorded and confirm the "はじめての早起き達成" message shows. (Testing the 3-day/7-day/streak-broken triggers manually requires multi-day data — trust the unit tests from Step 4 for those; manual QA only needs to confirm the message renders at all and updates after a punch.)

- [ ] **Step 7: Commit**

```bash
git add lib/messages.ts lib/messages.test.ts app/today.tsx
git commit -m "feat: add 5-trigger encouragement messages to Today"
```

---

## Task 7: Parent-only record cancellation

**Files:**
- Modify: `store/entries.ts` (add `cancelEntry`, `NoEntryToCancelError`)
- Modify: `store/entries.test.ts`
- Modify: `store/useAppStore.ts` (add `cancelEntryAndPersist`)
- Modify: `store/useAppStore.test.ts`
- Modify: `app/settings.tsx` (append a cancel section)

**Interfaces:**
- Consumes: nothing new.
- Produces: `cancelEntry(state: EntriesState, date: DateKey): EntriesState` (pure) and `cancelEntryAndPersist(date: DateKey): Promise<boolean>` (store action) — not consumed elsewhere in this plan, but this is the function whose interaction with `recordPunchIn`'s duplicate guard Task 8 explicitly re-verifies.

- [ ] **Step 1: Write the failing test for the pure function**

Add to `store/entries.test.ts` (extend the existing `import { ... } from './entries'` list with `cancelEntry` and `NoEntryToCancelError`):

```ts
describe('cancelEntry', () => {
  it('marks the entry cancelled while preserving the original punch fields', () => {
    const entries = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1000, '06:50:00', '07:00:00');
    const next = cancelEntry(entries, '2026-09-21');
    expect(next.entries['2026-09-21']).toEqual({
      date: '2026-09-21',
      punchedAtEpochMs: 1000,
      punchedAtLocalTime: '06:50:00',
      targetTimeSnapshot: '07:00:00',
      status: 'achieved',
      cancelled: true,
    });
  });

  it('does not mutate the input state', () => {
    const entries = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1000, '06:50:00', '07:00:00');
    cancelEntry(entries, '2026-09-21');
    expect(entries.entries['2026-09-21'].cancelled).toBe(false);
  });

  it('throws when there is no entry to cancel', () => {
    expect(() => cancelEntry(createEmptyEntriesState(), '2026-09-21')).toThrow(NoEntryToCancelError);
  });

  it('does not block a subsequent punch on that date (repunch is still refused by design)', () => {
    let entries = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1000, '06:50:00', '07:00:00');
    entries = cancelEntry(entries, '2026-09-21');
    expect(() => recordPunchIn(entries, '2026-09-21', 2000, '06:55:00', '07:00:00')).toThrow(
      DuplicatePunchError
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest store/entries.test.ts -t "cancelEntry"
```

Expected: FAIL — `cancelEntry`/`NoEntryToCancelError` don't exist yet.

- [ ] **Step 3: Implement `cancelEntry` in `store/entries.ts`**

Add near `recordPunchIn`:

```ts
export class NoEntryToCancelError extends Error {}

export function cancelEntry(state: EntriesState, date: DateKey): EntriesState {
  const entry = state.entries[date];
  if (!entry) {
    throw new NoEntryToCancelError(`No entry for ${date} to cancel`);
  }
  if (entry.cancelled) return state; // idempotent
  return { entries: { ...state.entries, [date]: { ...entry, cancelled: true } } };
}
```

- [ ] **Step 4: Run the pure-function tests to verify they pass**

```bash
npx jest store/entries.test.ts
```

Expected: PASS (all tests in the file).

- [ ] **Step 5: Write the failing test for the store action**

Add to `store/useAppStore.test.ts`, in a new `describe` block:

```ts
describe('useAppStore cancelEntryAndPersist', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedPersistence.loadEntriesState.mockResolvedValue(createEmptyEntriesState());
    mockedPersistence.loadScheduleState.mockResolvedValue(createInitialSchedule('2026-01-01'));
  });

  it('cancels a recorded entry only after the write succeeds', async () => {
    mockedPersistence.saveEntriesState.mockResolvedValue(undefined);
    const store = createAppStore();
    await store.getState().hydrate();
    await store.getState().punchIn('2026-09-21', 1000, '06:55:00', '07:00:00');

    const success = await store.getState().cancelEntryAndPersist('2026-09-21');

    expect(success).toBe(true);
    expect(store.getState().entries.entries['2026-09-21'].cancelled).toBe(true);
  });

  it('leaves state untouched when persistence fails', async () => {
    mockedPersistence.saveEntriesState.mockResolvedValueOnce(undefined); // the punchIn save succeeds
    const store = createAppStore();
    await store.getState().hydrate();
    await store.getState().punchIn('2026-09-21', 1000, '06:55:00', '07:00:00');
    mockedPersistence.saveEntriesState.mockRejectedValueOnce(new Error('disk full')); // the cancel save fails

    const success = await store.getState().cancelEntryAndPersist('2026-09-21');

    expect(success).toBe(false);
    expect(store.getState().entries.entries['2026-09-21'].cancelled).toBe(false);
    expect(store.getState().lastError).toBe('save-failed');
  });

  it('returns false when there is nothing to cancel for that date', async () => {
    const store = createAppStore();
    await store.getState().hydrate();

    const success = await store.getState().cancelEntryAndPersist('2026-09-21');

    expect(success).toBe(false);
    expect(store.getState().lastError).toBe('no-entry-to-cancel');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
npx jest store/useAppStore.test.ts -t "cancelEntryAndPersist"
```

Expected: FAIL — `cancelEntryAndPersist` doesn't exist on the store yet.

- [ ] **Step 7: Implement `cancelEntryAndPersist` in `store/useAppStore.ts`**

Update the `LastError` union:

```ts
type LastError = null | 'save-failed' | 'already-punched' | 'schedule-locked-today' | 'not-hydrated' | 'no-entry-to-cancel';
```

Update the import from `./entries`:

```ts
import { createEmptyEntriesState, recordPunchIn, DuplicatePunchError, isScheduleEditLockedForDate, cancelEntry, NoEntryToCancelError } from './entries';
```

Add to the `AppStoreState` interface:

```ts
  cancelEntryAndPersist: (date: DateKey) => Promise<boolean>;
```

Add the action alongside `punchIn` (same file, same object literal):

```ts
    cancelEntryAndPersist: async (date) => {
      let next: EntriesState;
      try {
        next = cancelEntry(get().entries, date);
      } catch (e) {
        if (e instanceof NoEntryToCancelError) {
          set({ lastError: 'no-entry-to-cancel' });
          return false;
        }
        throw e;
      }
      try {
        await saveEntriesState(next);
      } catch {
        set({ lastError: 'save-failed' });
        return false;
      }
      set({ entries: next, lastError: null });
      return true;
    },
```

- [ ] **Step 8: Run the store tests to verify they pass**

```bash
npx jest store/useAppStore.test.ts
```

Expected: PASS (all tests in the file).

- [ ] **Step 9: Add a cancel section to Settings**

In `app/settings.tsx`, add imports:

```tsx
import { getDayCalendarStatus } from '../store/entries';
```

Add a new component in the same file:

```tsx
function CancelTodaySection() {
  const entries = useAppStore((s) => s.entries);
  const schedule = useAppStore((s) => s.schedule);
  const cancelEntryAndPersist = useAppStore((s) => s.cancelEntryAndPersist);
  const today = getLocalDateKey(new Date());
  const [message, setMessage] = useState('');

  const todayEntry = entries.entries[today];
  if (!todayEntry || todayEntry.cancelled) return null; // nothing recorded (or already cancelled) — nothing to show

  const status = getDayCalendarStatus(entries, schedule, today);

  const handleCancel = useCallback(async () => {
    const success = await cancelEntryAndPersist(today);
    setMessage(success ? '本日の記録を取り消しました' : '取り消しに失敗しました');
  }, [cancelEntryAndPersist, today]);

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
```

Render it at the bottom of the unlocked `SettingsScreen` return value, after the mapped `ScheduleRow` list:

```tsx
      {ALL_DAYS.map((d) => (
        <ScheduleRow key={d} dayOfWeek={d} />
      ))}
      <CancelTodaySection />
```

- [ ] **Step 10: Manual QA**

Punch in today, go to Settings, confirm the cancel section appears showing today's recorded status and punch time. Tap 取り消す, confirm the section disappears (nothing left to cancel) and the Today screen now shows "no-record" state — and confirm attempting to punch in again on Today is still refused (the button should already be disabled per the existing "本日はすでに記録済みです" check in `today.tsx`, since `entries.entries[today]` still exists).

- [ ] **Step 11: Commit**

```bash
git add store/entries.ts store/entries.test.ts store/useAppStore.ts store/useAppStore.test.ts app/settings.tsx
git commit -m "feat: add parent-only, PIN-gated record cancellation"
```

---

## Task 8: Remaining pure-function test gaps (3A test-scope closeout)

This task closes the last couple of edge cases the design's Failure-modes table calls out that aren't yet covered by a colocated test from an earlier task, and does a full-suite green check.

**Files:**
- Modify: `store/entries.test.ts`

**Interfaces:**
- Consumes: `computeAchievementStreak`, `cancelEntry`, `recordPunchIn` (all existing after Task 7).
- Produces: nothing new — test-only task.

- [ ] **Step 1: Write the failing test**

Add to `store/entries.test.ts`, inside the existing `describe('computeAchievementStreak', ...)` block (reuse its `buildOffSaturdaySchedule`/`punch` helpers already defined there):

```ts
  it('breaks the streak when an achieved day is later cancelled by a parent', () => {
    const schedule = buildOffSaturdaySchedule();
    let entries = createEmptyEntriesState();
    entries = punch(entries, '2024-01-01', '06:50:00');
    entries = punch(entries, '2024-01-02', '06:50:00');
    entries = punch(entries, '2024-01-03', '06:50:00');
    entries = cancelEntry(entries, '2024-01-02'); // cancel the middle day of what would be a 3-day streak

    expect(computeAchievementStreak(entries, schedule, '2024-01-03')).toBe(1);
  });
```

Add `cancelEntry` to the existing `import { ... } from './entries'` statement at the top of the file (it's likely already added by Task 7 — confirm rather than duplicate the import).

- [ ] **Step 2: Run it to verify it fails or passes**

```bash
npx jest store/entries.test.ts -t "breaks the streak when an achieved day is later cancelled"
```

Expected: PASS immediately — `computeAchievementStreak` already composes through `getDayCalendarStatus`, which already treats a cancelled entry as `no-record` (verified in Task 7's own tests). This step exists to make that composition explicit and regression-proof, not because new production code is needed. If it unexpectedly fails, that's a real regression — stop and investigate before continuing (do not weaken the test).

- [ ] **Step 3: Run the entire test suite**

```bash
npx jest
```

Expected: PASS, 0 failures, across every `*.test.ts` file (`store/entries.test.ts`, `store/schedule.test.ts`, `store/persistence.test.ts`, `store/pin.test.ts`, `store/useAppStore.test.ts`, `store/dateUtils.test.ts`, `app/calendar.test.ts`, `lib/messages.test.ts`, and Task 9's `lib/notifications.test.ts` if that task has already landed).

- [ ] **Step 4: Commit**

```bash
git add store/entries.test.ts
git commit -m "test: cover cancellation's effect on the achievement streak"
```

---

## Task 9 (optional, P3): Local reminder notifications

This task is explicitly optional per the spec ("任意"). Implement it last, after Tasks 1–8 are done and committed, and skip it entirely if time runs out — nothing else in this plan depends on it.

**Files:**
- Modify: `package.json` (add `expo-notifications`)
- Create: `lib/notifications.ts`
- Create: `lib/notifications.test.ts`
- Modify: `app/_layout.tsx` (wire scheduling as a store-subscription side effect)

**Interfaces:**
- Consumes: `getEffectiveRule` from `store/schedule.ts`; `WeeklyScheduleState`, `DateKey`, `DayOfWeek` from `store/types.ts`.
- Produces: `requestNotificationPermission(): Promise<boolean>`, `rescheduleAllReminders(schedule: WeeklyScheduleState, asOfDate: DateKey): Promise<void>`.

Deliberately **not** wired into `store/useAppStore.ts` — that module is covered by tests that mock only `./persistence`, and pulling a native notifications module into the store would force every existing store test to also mock `expo-notifications`. Keeping this as a UI-layer side effect (subscribed in `_layout.tsx`) avoids touching already-passing test files.

- [ ] **Step 1: Install the package**

```bash
npx expo install expo-notifications
```

- [ ] **Step 2: Write the failing tests**

Create `lib/notifications.test.ts`:

```ts
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly' },
}));

import * as Notifications from 'expo-notifications';
import { rescheduleAllReminders, requestNotificationPermission } from './notifications';
import { createInitialSchedule, addScheduleRule } from '../store/schedule';

const mocked = Notifications as jest.Mocked<typeof Notifications>;

describe('requestNotificationPermission', () => {
  it('returns true when permission is granted', async () => {
    mocked.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    expect(await requestNotificationPermission()).toBe(true);
  });

  it('returns false when permission is denied', async () => {
    mocked.requestPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
    expect(await requestNotificationPermission()).toBe(false);
  });
});

describe('rescheduleAllReminders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cancels existing reminders and schedules one per ON weekday, skipping OFF weekdays', async () => {
    let schedule = createInitialSchedule('2026-01-01'); // all 7 days ON at 07:00 by default
    schedule = addScheduleRule(schedule, {
      dayOfWeek: 6, // Saturday OFF
      enabled: false,
      targetTime: '07:00:00',
      effectiveFrom: '2026-01-01',
    });

    await rescheduleAllReminders(schedule, '2026-09-21');

    expect(mocked.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(6); // 7 days minus the OFF Saturday
  });

  it('maps Sunday (JS dayOfWeek 0) to Expo weekday 1', async () => {
    const schedule = createInitialSchedule('2026-01-01');
    await rescheduleAllReminders(schedule, '2026-09-21');

    const sundayCall = mocked.scheduleNotificationAsync.mock.calls.find(
      (call) => (call[0].trigger as any).weekday === 1
    );
    expect(sundayCall).toBeDefined();
    expect((sundayCall![0].trigger as any).hour).toBe(7);
    expect((sundayCall![0].trigger as any).minute).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npx jest lib/notifications.test.ts
```

Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 4: Implement `lib/notifications.ts`**

```ts
import * as Notifications from 'expo-notifications';
import { getEffectiveRule } from '../store/schedule';
import type { DateKey, DayOfWeek, WeeklyScheduleState } from '../store/types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function rescheduleAllReminders(schedule: WeeklyScheduleState, asOfDate: DateKey): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
    const rule = getEffectiveRule(schedule, dayOfWeek as DayOfWeek, asOfDate);
    if (!rule || !rule.enabled) continue;
    const [hour, minute] = rule.targetTime.split(':').map(Number);
    await Notifications.scheduleNotificationAsync({
      content: { title: '早起きくん', body: 'そろそろ起きる時間だよ!アプリを開いて打刻してね。' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: dayOfWeek + 1, // Expo: 1 = Sunday .. 7 = Saturday; JS Date.getDay(): 0 = Sunday
        hour,
        minute,
      } as any,
    });
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx jest lib/notifications.test.ts
```

Expected: PASS (all tests).

- [ ] **Step 6: Wire scheduling as a side effect in `app/_layout.tsx`**

```tsx
import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { useAppStore } from '../store/useAppStore';
import { getLocalDateKey } from '../store/dateUtils';
import { requestNotificationPermission, rescheduleAllReminders } from '../lib/notifications';

export default function RootLayout() {
  useEffect(() => {
    if (!useAppStore.getState().hydrated) {
      useAppStore.getState().hydrate();
    }
  }, []);

  useEffect(() => {
    requestNotificationPermission()
      .then((granted) => {
        if (!granted) return;
        return rescheduleAllReminders(useAppStore.getState().schedule, getLocalDateKey(new Date()));
      })
      .catch(() => {
        // Local reminders are optional (P3); a scheduling failure must never block the core app.
      });

    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      if (state.schedule === prevState.schedule) return;
      requestNotificationPermission()
        .then((granted) => {
          if (!granted) return;
          return rescheduleAllReminders(state.schedule, getLocalDateKey(new Date()));
        })
        .catch(() => {});
    });
    return unsubscribe;
  }, []);

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="today" options={{ title: '今日' }} />
      <Tabs.Screen name="calendar" options={{ title: 'カレンダー' }} />
      <Tabs.Screen name="settings" options={{ title: '設定' }} />
    </Tabs>
  );
}
```

- [ ] **Step 7: Manual QA (Expo Go, then dev client if needed)**

Run in Expo Go first per the spec's own fallback plan. Grant notification permission when prompted. Change a weekday's target time in Settings and confirm (via the device's scheduled-notifications debug UI, or simply waiting for the trigger) that a reminder fires at the new time. If local scheduled notifications don't behave as expected in Expo Go on your installed SDK, switch to an `expo-dev-client` build and re-test — this exact fallback is anticipated by the spec's Next Steps.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json lib/notifications.ts lib/notifications.test.ts app/_layout.tsx
git commit -m "feat: add optional local reminder notifications (expo-notifications)"
```

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** T8→Task 2, T9→Tasks 3+4, T10→Task 5, T11→Task 6, T12→Task 7, T13→Task 9, T14→Task 8 (plus the colocated tests added throughout Tasks 2/5/6/7/9). Every row of the spec's Implementation Tasks table (T8–T14) maps to a task above.
- **Bug found and fixed in scope:** Task 3 fixes a real pre-existing bug (the same-day lock ignoring `dayOfWeek`) that only becomes user-visible once Task 4's 7-row editor exists — fixing it here, before Task 4, rather than filing it as a follow-up.
- **Deliberately out of scope (unchanged from the spec's own "NOT in scope"):** AI-generated messages, Sunrise Island mascot animation, OS screen-time integration, accounts/cloud sync, JSON export/backup, automated E2E/UI tests, CI/CD.
- **Type/signature consistency check:** `computePointsBalance`, `cancelEntry`, `NoEntryToCancelError`, `selectEncouragementMessage`, `buildMarkedStatusesForMonth`, `requestNotificationPermission`, `rescheduleAllReminders` are each defined exactly once (Tasks 5/7/6/2/9 respectively) and referenced with matching names everywhere else in this plan.
