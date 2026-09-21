# Hayaoki Store Foundation (T1–T7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Saturday-scope foundation of 早起きくん (hayaoki-kun): the Expo/TypeScript project skeleton plus the pure data-model logic and minimal screens for T1 (types/duplicate-guard/second-precision judgement), T2 (confirm-before-UI-update persistence), T3 (corrupt-JSON-safe startup load), T4 (append-only weekly schedule history), T5 (parent-PIN gate + same-day goal lock), T6 (fresh-time re-fetch + foreground/interval re-evaluation), and T7 (achievement-streak calculation).

**Architecture:** A layered `store/` module: `types.ts` (shared shapes) → `dateUtils.ts` (local-time-safe date math, no UTC slicing) → `schedule.ts` (append-only weekly schedule with as-of-date resolution) → `entries.ts` (punch recording, duplicate guard, calendar-state derivation, streak calculation — all pure functions operating on plain state objects) → `persistence.ts` (AsyncStorage read/write with corrupt-JSON fallback) → `pin.ts` (parent PIN storage/verification) → `useAppStore.ts` (a Zustand store that wires the pure functions to persistence, updating in-memory state **only after** a write is confirmed — this is a deliberate deviation from Zustand's `persist` middleware, which writes to storage *after* already updating state; the spec's Constraints explicitly forbid that optimistic-UI pattern). Two minimal Expo Router screens (`app/today.tsx`, `app/settings.tsx`) exercise the store. Per the design's own testing-scope decision (3A), only the pure `store/*.ts` functions get automated unit tests; the two screens are verified manually.

**Tech Stack:** Expo (blank-typescript template) + TypeScript + Expo Router, Zustand (manual store, not `persist` middleware), `@react-native-async-storage/async-storage`, `jest-expo` for unit tests.

**Spec:** `docs/designs/hayaoki-app.md` (Status: APPROVED, VERDICT: CLEARED)

## Global Constraints

Copied verbatim from the spec's Constraints section; every task below implicitly inherits these:

- **Punch window**: 04:00:00–12:00:00 local time only; the punch-in control is disabled outside this window.
- **Achievement judgement**: punch time ≤ target time, compared down to the second.
- **No delete-and-repunch**: a recorded day can never be edited or re-punched by the child; only a parent, from Settings, can cancel a record back to "no record" (T12, out of scope for this plan — but the `Entry.cancelled` field is reserved for it now).
- **Per-weekday ON/OFF**: an OFF day disables the punch button and is fully excluded from calendar coloring, scoring, and streak counting (neither counted nor breaking).
- **Schedule change history**: target time / ON-off changes are appended with an `effectiveFrom` date, never overwritten; classifying a past date always uses the rule in effect *on that date*.
- **Settings protection**: schedule changes require a parent PIN; additionally, once today's punch is recorded, today's target time is locked from further edits.
- **Persistence guarantee**: a punch-in only updates in-memory/UI state after the AsyncStorage write is confirmed successful (no optimistic UI); a failed write shows a retry toast and leaves the UI at "not recorded."
- **Startup recovery**: if the persisted JSON fails to parse, fall back to an empty store instead of throwing.
- **Time freshness**: the current time is re-fetched immediately before punch-in (never a stale value from when the screen opened); button enabled/disabled state is re-evaluated on foreground resume and across date boundaries.
- **Streak definition**: an "achievement streak" counts consecutive ON-day achievements; OFF days are skipped (neither counted nor breaking); a late punch or no-record breaks the streak.
- **Target-time input range**: 04:00:00–12:00:00, matching the punch window (so "achieved" can never become trivially true).
- **Storage**: AsyncStorage only for the MVP; data loss on device loss/reset is an accepted risk.

---

## Task 1: Project scaffold, TypeScript, and test infra

**Files:**
- Create: `package.json`, `app.json`, `tsconfig.json`, `babel.config.js` (all via `create-expo-app`)
- Create: `app/_layout.tsx`, `app/index.tsx`
- Create: `jest.setup.js`
- Modify: `package.json` (add `zustand`, `@react-native-async-storage/async-storage`, `jest`, `jest-expo`, `@types/jest`; add `test` script and `jest` config)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a runnable Expo + TypeScript + Expo Router project, with `npm test` running `jest-expo`, for every later task to build on.

- [ ] **Step 1: Scaffold the Expo TypeScript project into the current directory**

```bash
npx create-expo-app@latest . --template blank-typescript
```

If it refuses because the directory isn't empty (it currently has `.claude/`, `CLAUDE.md`, `docs/`), scaffold into a temp folder and merge:

```bash
npx create-expo-app@latest ../hayaokikun-scaffold-tmp --template blank-typescript
shopt -s dotglob
mv ../hayaokikun-scaffold-tmp/* .
rmdir ../hayaokikun-scaffold-tmp
```

- [ ] **Step 2: Install runtime dependencies**

```bash
npx expo install @react-native-async-storage/async-storage
npm install zustand
```

- [ ] **Step 3: Install expo-router and its peer packages**

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
```

- [ ] **Step 4: Wire expo-router as the app entry point**

Edit `package.json`, change the `"main"` field:

```json
"main": "expo-router/entry"
```

Edit `app.json`, add a `scheme` (required by expo-router for deep linking) inside the `"expo"` object:

```json
"scheme": "hayaokikun"
```

- [ ] **Step 5: Create the root layout and index redirect**

Create `app/_layout.tsx`:

```typescript
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack />;
}
```

Create `app/index.tsx`:

```typescript
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/today" />;
}
```

- [ ] **Step 6: Install and configure jest-expo**

```bash
npm install --save-dev jest jest-expo @types/jest
```

Create `jest.setup.js`:

```javascript
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
```

Edit `package.json`, add:

```json
"scripts": {
  "test": "jest"
},
"jest": {
  "preset": "jest-expo",
  "setupFiles": ["<rootDir>/jest.setup.js"]
}
```

(Merge into the existing `"scripts"` block rather than replacing it — `create-expo-app` already added a `"start"` script.)

- [ ] **Step 7: Verify the scaffold builds and tests run**

```bash
npx tsc --noEmit
npx jest
```

Expected: `tsc` reports no errors; `jest` reports "No tests found" (exit code non-zero is fine here — there are no test files yet) without crashing on the AsyncStorage mock setup.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Expo TypeScript project with expo-router and jest-expo"
```

---

## Task 2: Shared types and local-time-safe date utilities

**Files:**
- Create: `store/types.ts`
- Create: `store/dateUtils.ts`
- Test: `store/dateUtils.test.ts`

**Interfaces:**
- Consumes: Task 1's project scaffold only.
- Produces: `DateKey`, `TimeOfDay`, `DayOfWeek`, `ScheduleRule`, `WeeklyScheduleState`, `Entry`, `EntriesState`, `EntryStatus` types; `getLocalDateKey(d: Date): DateKey`, `getLocalTimeOfDay(d: Date): TimeOfDay`, `dateKeyToDayOfWeek(date: DateKey): DayOfWeek`, `addDaysToDateKey(date: DateKey, delta: number): DateKey`, `isWithinPunchWindow(t: TimeOfDay): boolean`.

- [ ] **Step 1: Write `store/types.ts`**

```typescript
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // matches Date.getDay(): 0 = Sunday

export type DateKey = string; // "YYYY-MM-DD", zero-padded, local calendar date

export type TimeOfDay = string; // "HH:MM:SS", zero-padded, 24-hour local time

export interface ScheduleRule {
  dayOfWeek: DayOfWeek;
  enabled: boolean;
  targetTime: TimeOfDay; // only meaningful when enabled === true
  effectiveFrom: DateKey; // inclusive start date this rule applies from
}

export interface WeeklyScheduleState {
  rules: ScheduleRule[]; // append-only; never mutate or remove existing entries
}

export type EntryStatus = 'achieved' | 'late';

export interface Entry {
  date: DateKey;
  punchedAtEpochMs: number;
  punchedAtLocalTime: TimeOfDay;
  targetTimeSnapshot: TimeOfDay; // the target time in effect at punch time, frozen forever
  status: EntryStatus;
  cancelled: boolean; // set by the parent-only cancel flow (T12); always false when recorded
}

export interface EntriesState {
  entries: Record<DateKey, Entry>; // at most one Entry per date
}
```

- [ ] **Step 2: Write the failing tests for `store/dateUtils.ts`**

Create `store/dateUtils.test.ts`:

```typescript
import {
  addDaysToDateKey,
  dateKeyToDayOfWeek,
  getLocalDateKey,
  getLocalTimeOfDay,
  isWithinPunchWindow,
} from './dateUtils';

describe('getLocalDateKey', () => {
  it('formats year, month, and day with zero-padding from local getters', () => {
    const d = new Date(2026, 8, 21, 23, 30, 0); // Sept 21, 2026, 23:30 local
    expect(getLocalDateKey(d)).toBe('2026-09-21');
  });

  it('zero-pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5, 0, 0, 0); // Jan 5, 2026
    expect(getLocalDateKey(d)).toBe('2026-01-05');
  });
});

describe('getLocalTimeOfDay', () => {
  it('formats hours, minutes, and seconds with zero-padding', () => {
    const d = new Date(2026, 8, 21, 6, 5, 9);
    expect(getLocalTimeOfDay(d)).toBe('06:05:09');
  });
});

describe('dateKeyToDayOfWeek', () => {
  it('resolves a known Monday', () => {
    expect(dateKeyToDayOfWeek('2024-01-01')).toBe(1); // 2024-01-01 was a Monday
  });

  it('resolves a known Sunday', () => {
    expect(dateKeyToDayOfWeek('2024-01-07')).toBe(0);
  });
});

describe('addDaysToDateKey', () => {
  it('crosses a month boundary', () => {
    expect(addDaysToDateKey('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses a year boundary', () => {
    expect(addDaysToDateKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('subtracts days across a month boundary in a non-leap February', () => {
    expect(addDaysToDateKey('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('isWithinPunchWindow', () => {
  it('accepts the boundaries 04:00:00 and 12:00:00 inclusive', () => {
    expect(isWithinPunchWindow('04:00:00')).toBe(true);
    expect(isWithinPunchWindow('12:00:00')).toBe(true);
  });

  it('rejects times just outside the window', () => {
    expect(isWithinPunchWindow('03:59:59')).toBe(false);
    expect(isWithinPunchWindow('12:00:01')).toBe(false);
  });

  it('accepts a time in the middle of the window', () => {
    expect(isWithinPunchWindow('07:30:00')).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npx jest store/dateUtils.test.ts
```

Expected: FAIL — `Cannot find module './dateUtils'`.

- [ ] **Step 4: Write `store/dateUtils.ts`**

```typescript
import type { DateKey, DayOfWeek, TimeOfDay } from './types';

function pad(n: number, width: number): string {
  return n.toString().padStart(width, '0');
}

// Uses local getters (never toISOString/UTC slicing), because a UTC-based
// slice shifts the calendar day near midnight in any non-UTC timezone.
export function getLocalDateKey(d: Date): DateKey {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

export function getLocalTimeOfDay(d: Date): TimeOfDay {
  return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}`;
}

export function dateKeyToDayOfWeek(date: DateKey): DayOfWeek {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() as DayOfWeek;
}

export function addDaysToDateKey(date: DateKey, delta: number): DateKey {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return getLocalDateKey(dt);
}

export function isWithinPunchWindow(timeOfDay: TimeOfDay): boolean {
  return timeOfDay >= '04:00:00' && timeOfDay <= '12:00:00';
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx jest store/dateUtils.test.ts
```

Expected: PASS, all 10 tests green.

- [ ] **Step 6: Commit**

```bash
git add store/types.ts store/dateUtils.ts store/dateUtils.test.ts
git commit -m "feat: add shared types and local-time-safe date utilities"
```

---

## Task 3: Weekly schedule with append-only history

**Files:**
- Create: `store/schedule.ts`
- Test: `store/schedule.test.ts`

**Interfaces:**
- Consumes: types from Task 2 (`DateKey`, `DayOfWeek`, `ScheduleRule`, `TimeOfDay`, `WeeklyScheduleState`).
- Produces: `MIN_TARGET_TIME`, `MAX_TARGET_TIME`, `DEFAULT_TARGET_TIME` constants; `InvalidTargetTimeError`; `createInitialSchedule(effectiveFrom: DateKey): WeeklyScheduleState`; `isValidTargetTime(time: TimeOfDay): boolean`; `getEffectiveRule(schedule, dayOfWeek, onDate): ScheduleRule | undefined`; `addScheduleRule(schedule, rule): WeeklyScheduleState`.

- [ ] **Step 1: Write the failing tests**

Create `store/schedule.test.ts`:

```typescript
import {
  InvalidTargetTimeError,
  addScheduleRule,
  createInitialSchedule,
  getEffectiveRule,
  isValidTargetTime,
} from './schedule';
import type { WeeklyScheduleState } from './types';

describe('createInitialSchedule', () => {
  it('creates one enabled rule per weekday at the default target time', () => {
    const schedule = createInitialSchedule('2026-01-01');
    expect(schedule.rules).toHaveLength(7);
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
      const rule = schedule.rules.find((r) => r.dayOfWeek === dayOfWeek);
      expect(rule).toEqual({
        dayOfWeek,
        enabled: true,
        targetTime: '07:00:00',
        effectiveFrom: '2026-01-01',
      });
    }
  });
});

describe('isValidTargetTime', () => {
  it('accepts the boundaries', () => {
    expect(isValidTargetTime('04:00:00')).toBe(true);
    expect(isValidTargetTime('12:00:00')).toBe(true);
  });

  it('rejects times outside the boundaries', () => {
    expect(isValidTargetTime('03:59:59')).toBe(false);
    expect(isValidTargetTime('12:00:01')).toBe(false);
  });
});

describe('addScheduleRule', () => {
  it('rejects an enabled rule with an out-of-range target time', () => {
    const schedule = createInitialSchedule('2026-01-01');
    expect(() =>
      addScheduleRule(schedule, {
        dayOfWeek: 6,
        enabled: true,
        targetTime: '13:00:00',
        effectiveFrom: '2026-06-01',
      })
    ).toThrow(InvalidTargetTimeError);
  });

  it('does not validate target time for a disabled rule', () => {
    const schedule = createInitialSchedule('2026-01-01');
    expect(() =>
      addScheduleRule(schedule, {
        dayOfWeek: 6,
        enabled: false,
        targetTime: '13:00:00',
        effectiveFrom: '2026-06-01',
      })
    ).not.toThrow();
  });

  it('appends without mutating the original schedule object', () => {
    const schedule = createInitialSchedule('2026-01-01');
    const next = addScheduleRule(schedule, {
      dayOfWeek: 6,
      enabled: false,
      targetTime: '07:00:00',
      effectiveFrom: '2026-06-01',
    });
    expect(schedule.rules).toHaveLength(7);
    expect(next.rules).toHaveLength(8);
  });
});

describe('getEffectiveRule', () => {
  let schedule: WeeklyScheduleState;

  beforeEach(() => {
    schedule = createInitialSchedule('2024-01-01');
    schedule = addScheduleRule(schedule, {
      dayOfWeek: 6, // Saturday
      enabled: false,
      targetTime: '07:00:00',
      effectiveFrom: '2024-06-01',
    });
  });

  it('uses the original rule for a date before the change', () => {
    const rule = getEffectiveRule(schedule, 6, '2024-05-15');
    expect(rule?.enabled).toBe(true);
  });

  it('uses the new rule for a date on or after the change', () => {
    const rule = getEffectiveRule(schedule, 6, '2024-06-01');
    expect(rule?.enabled).toBe(false);
    const later = getEffectiveRule(schedule, 6, '2024-12-31');
    expect(later?.enabled).toBe(false);
  });

  it('returns undefined when no rule exists yet for that date', () => {
    expect(getEffectiveRule(schedule, 6, '2023-12-31')).toBeUndefined();
  });

  it('prefers the later-added rule when two rules share the same effectiveFrom', () => {
    let s = createInitialSchedule('2024-01-01'); // Saturday enabled, effectiveFrom 2024-01-01
    s = addScheduleRule(s, {
      dayOfWeek: 6,
      enabled: false,
      targetTime: '07:00:00',
      effectiveFrom: '2024-01-01', // same-day correction
    });
    expect(getEffectiveRule(s, 6, '2024-01-01')?.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest store/schedule.test.ts
```

Expected: FAIL — `Cannot find module './schedule'`.

- [ ] **Step 3: Write `store/schedule.ts`**

```typescript
import type { DateKey, DayOfWeek, ScheduleRule, TimeOfDay, WeeklyScheduleState } from './types';

export const MIN_TARGET_TIME: TimeOfDay = '04:00:00';
export const MAX_TARGET_TIME: TimeOfDay = '12:00:00';
export const DEFAULT_TARGET_TIME: TimeOfDay = '07:00:00';

export class InvalidTargetTimeError extends Error {}

export function isValidTargetTime(time: TimeOfDay): boolean {
  return time >= MIN_TARGET_TIME && time <= MAX_TARGET_TIME;
}

export function createInitialSchedule(effectiveFrom: DateKey): WeeklyScheduleState {
  const rules: ScheduleRule[] = [];
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
    rules.push({
      dayOfWeek: dayOfWeek as DayOfWeek,
      enabled: true,
      targetTime: DEFAULT_TARGET_TIME,
      effectiveFrom,
    });
  }
  return { rules };
}

// Rules are append-only (never overwritten) so that reclassifying a past
// date always reflects the setting that was in effect back then.
export function addScheduleRule(
  schedule: WeeklyScheduleState,
  rule: ScheduleRule
): WeeklyScheduleState {
  if (rule.enabled && !isValidTargetTime(rule.targetTime)) {
    throw new InvalidTargetTimeError(
      `targetTime ${rule.targetTime} is outside ${MIN_TARGET_TIME}-${MAX_TARGET_TIME}`
    );
  }
  return { rules: [...schedule.rules, rule] };
}

export function getEffectiveRule(
  schedule: WeeklyScheduleState,
  dayOfWeek: DayOfWeek,
  onDate: DateKey
): ScheduleRule | undefined {
  const candidates = schedule.rules.filter(
    (r) => r.dayOfWeek === dayOfWeek && r.effectiveFrom <= onDate
  );
  if (candidates.length === 0) return undefined;
  // >= (not >) so that among same-effectiveFrom rules, the later-appended
  // one (a same-day correction) wins.
  return candidates.reduce((latest, r) => (r.effectiveFrom >= latest.effectiveFrom ? r : latest));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest store/schedule.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add store/schedule.ts store/schedule.test.ts
git commit -m "feat: add weekly schedule with append-only change history"
```

---

## Task 4: Punch recording, duplicate guard, and calendar-state derivation

**Files:**
- Create: `store/entries.ts`
- Test: `store/entries.test.ts`

**Interfaces:**
- Consumes: types from Task 2; `dateKeyToDayOfWeek` from Task 2; `getEffectiveRule` from Task 3.
- Produces: `createEmptyEntriesState(): EntriesState`; `DuplicatePunchError`; `computeEntryStatus(punchedAtLocalTime, targetTime): EntryStatus`; `recordPunchIn(state, date, punchedAtEpochMs, punchedAtLocalTime, targetTimeSnapshot): EntriesState`; `getDayCalendarStatus(entries, schedule, date): 'achieved' | 'late' | 'no-record' | 'no-target'`.

- [ ] **Step 1: Write the failing tests**

Create `store/entries.test.ts`:

```typescript
import { addScheduleRule, createInitialSchedule } from './schedule';
import {
  DuplicatePunchError,
  computeEntryStatus,
  createEmptyEntriesState,
  getDayCalendarStatus,
  recordPunchIn,
} from './entries';
import type { DayOfWeek } from './types';

describe('computeEntryStatus', () => {
  it('is achieved when punched exactly at the target second', () => {
    expect(computeEntryStatus('07:00:00', '07:00:00')).toBe('achieved');
  });

  it('is achieved when punched one second early', () => {
    expect(computeEntryStatus('06:59:59', '07:00:00')).toBe('achieved');
  });

  it('is late when punched one second after the target', () => {
    expect(computeEntryStatus('07:00:01', '07:00:00')).toBe('late');
  });
});

describe('recordPunchIn', () => {
  it('records a new entry with the given snapshot and computed status', () => {
    const state = createEmptyEntriesState();
    const next = recordPunchIn(state, '2026-09-21', 1000, '06:50:00', '07:00:00');
    expect(next.entries['2026-09-21']).toEqual({
      date: '2026-09-21',
      punchedAtEpochMs: 1000,
      punchedAtLocalTime: '06:50:00',
      targetTimeSnapshot: '07:00:00',
      status: 'achieved',
      cancelled: false,
    });
  });

  it('rejects a second punch on the same date', () => {
    const state = createEmptyEntriesState();
    const next = recordPunchIn(state, '2026-09-21', 1000, '06:50:00', '07:00:00');
    expect(() => recordPunchIn(next, '2026-09-21', 2000, '06:55:00', '07:00:00')).toThrow(
      DuplicatePunchError
    );
  });

  it('does not mutate the input state', () => {
    const state = createEmptyEntriesState();
    recordPunchIn(state, '2026-09-21', 1000, '06:50:00', '07:00:00');
    expect(state.entries['2026-09-21']).toBeUndefined();
  });
});

describe('getDayCalendarStatus', () => {
  it('is no-target when the day is disabled', () => {
    const schedule = createInitialSchedule('2026-01-01');
    // Disable whatever weekday 2026-09-21 actually falls on, rather than
    // relying on a memorized (and error-prone) 2026 weekday lookup.
    const dayOfWeek = new Date(2026, 8, 21).getDay() as DayOfWeek;
    const disabledSchedule = addScheduleRule(schedule, {
      dayOfWeek,
      enabled: false,
      targetTime: '07:00:00',
      effectiveFrom: '2026-01-01',
    });
    expect(getDayCalendarStatus(createEmptyEntriesState(), disabledSchedule, '2026-09-21')).toBe(
      'no-target'
    );
  });

  it('is no-record when the day is enabled but has no entry', () => {
    const schedule = createInitialSchedule('2026-01-01');
    expect(getDayCalendarStatus(createEmptyEntriesState(), schedule, '2026-09-21')).toBe(
      'no-record'
    );
  });

  it('is achieved or late based on the recorded entry', () => {
    const schedule = createInitialSchedule('2026-01-01');
    const achieved = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1, '06:50:00', '07:00:00');
    expect(getDayCalendarStatus(achieved, schedule, '2026-09-21')).toBe('achieved');

    const late = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1, '07:10:00', '07:00:00');
    expect(getDayCalendarStatus(late, schedule, '2026-09-21')).toBe('late');
  });

  it('is no-record when the recorded entry was cancelled by a parent', () => {
    const schedule = createInitialSchedule('2026-01-01');
    const recorded = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1, '06:50:00', '07:00:00');
    // Cancellation itself is implemented in T12; this only checks that
    // getDayCalendarStatus already honors the flag the Entry type carries.
    const cancelled = {
      entries: { ...recorded.entries, '2026-09-21': { ...recorded.entries['2026-09-21'], cancelled: true } },
    };
    expect(getDayCalendarStatus(cancelled, schedule, '2026-09-21')).toBe('no-record');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest store/entries.test.ts
```

Expected: FAIL — `Cannot find module './entries'`.

- [ ] **Step 3: Write `store/entries.ts`**

```typescript
import type { DateKey, Entry, EntriesState, EntryStatus, TimeOfDay, WeeklyScheduleState } from './types';
import { dateKeyToDayOfWeek } from './dateUtils';
import { getEffectiveRule } from './schedule';

export function createEmptyEntriesState(): EntriesState {
  return { entries: {} };
}

export class DuplicatePunchError extends Error {}

// String comparison is valid here because both operands are zero-padded
// "HH:MM:SS" of equal width, so lexicographic order matches chronological order.
export function computeEntryStatus(punchedAtLocalTime: TimeOfDay, targetTime: TimeOfDay): EntryStatus {
  return punchedAtLocalTime <= targetTime ? 'achieved' : 'late';
}

export function recordPunchIn(
  state: EntriesState,
  date: DateKey,
  punchedAtEpochMs: number,
  punchedAtLocalTime: TimeOfDay,
  targetTimeSnapshot: TimeOfDay
): EntriesState {
  if (state.entries[date]) {
    throw new DuplicatePunchError(`Entry for ${date} already exists`);
  }
  const entry: Entry = {
    date,
    punchedAtEpochMs,
    punchedAtLocalTime,
    targetTimeSnapshot,
    status: computeEntryStatus(punchedAtLocalTime, targetTimeSnapshot),
    cancelled: false,
  };
  return { entries: { ...state.entries, [date]: entry } };
}

export function getDayCalendarStatus(
  entries: EntriesState,
  schedule: WeeklyScheduleState,
  date: DateKey
): 'achieved' | 'late' | 'no-record' | 'no-target' {
  const rule = getEffectiveRule(schedule, dateKeyToDayOfWeek(date), date);
  if (!rule || !rule.enabled) return 'no-target';
  const entry = entries.entries[date];
  if (!entry || entry.cancelled) return 'no-record';
  return entry.status;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest store/entries.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add store/entries.ts store/entries.test.ts
git commit -m "feat: add punch recording with duplicate guard and calendar-state derivation"
```

---

## Task 5: Achievement streak and same-day schedule lock

**Files:**
- Modify: `store/entries.ts` (append `computeAchievementStreak`, `isScheduleEditLockedForDate`)
- Modify: `store/entries.test.ts` (append tests)

**Interfaces:**
- Consumes: `getDayCalendarStatus`, `EntriesState` from this file; `addDaysToDateKey` from Task 2.
- Produces: `computeAchievementStreak(entries, schedule, asOfDate): number`; `isScheduleEditLockedForDate(entries, date): boolean`.

- [ ] **Step 1: Write the failing tests**

First, update the two import lines at the top of `store/entries.test.ts` (added in Task 4) to include the new names — do not add second, duplicate import statements from the same modules:

```typescript
import { addScheduleRule, createInitialSchedule } from './schedule';
import {
  DuplicatePunchError,
  computeAchievementStreak,
  computeEntryStatus,
  createEmptyEntriesState,
  getDayCalendarStatus,
  isScheduleEditLockedForDate,
  recordPunchIn,
} from './entries';
```

Then append the new `describe` blocks below the existing ones in `store/entries.test.ts`:

```typescript
describe('computeAchievementStreak', () => {
  // 2024-01-01 is a known Monday; Saturday (dayOfWeek 6) is turned OFF from day one.
  function buildOffSaturdaySchedule() {
    let schedule = createInitialSchedule('2024-01-01');
    schedule = addScheduleRule(schedule, {
      dayOfWeek: 6,
      enabled: false,
      targetTime: '07:00:00',
      effectiveFrom: '2024-01-01',
    });
    return schedule;
  }

  function punch(entries: ReturnType<typeof createEmptyEntriesState>, date: string, localTime: string) {
    return recordPunchIn(entries, date, new Date(`${date}T${localTime}`).getTime(), localTime, '07:00:00');
  }

  it('counts consecutive achieved ON-days and skips an OFF day without breaking', () => {
    const schedule = buildOffSaturdaySchedule();
    let entries = createEmptyEntriesState();
    // Mon 01-01 .. Fri 01-05 achieved, Sat 01-06 is OFF (no entry), Sun 01-07 and Mon 01-08 achieved.
    entries = punch(entries, '2024-01-01', '06:50:00');
    entries = punch(entries, '2024-01-02', '06:50:00');
    entries = punch(entries, '2024-01-03', '06:50:00');
    entries = punch(entries, '2024-01-04', '06:50:00');
    entries = punch(entries, '2024-01-05', '06:50:00');
    entries = punch(entries, '2024-01-07', '06:50:00');
    entries = punch(entries, '2024-01-08', '06:50:00');

    expect(computeAchievementStreak(entries, schedule, '2024-01-08')).toBe(7);
  });

  it('breaks the streak on a late punch', () => {
    const schedule = buildOffSaturdaySchedule();
    let entries = createEmptyEntriesState();
    entries = punch(entries, '2024-01-01', '06:50:00');
    entries = punch(entries, '2024-01-02', '06:50:00');
    entries = punch(entries, '2024-01-03', '06:50:00');
    entries = punch(entries, '2024-01-04', '07:10:00'); // late
    entries = punch(entries, '2024-01-05', '06:50:00');
    entries = punch(entries, '2024-01-07', '06:50:00');
    entries = punch(entries, '2024-01-08', '06:50:00');

    expect(computeAchievementStreak(entries, schedule, '2024-01-08')).toBe(3);
  });

  it('breaks the streak on a missing (no-record) day', () => {
    const schedule = buildOffSaturdaySchedule();
    let entries = createEmptyEntriesState();
    entries = punch(entries, '2024-01-01', '06:50:00');
    entries = punch(entries, '2024-01-02', '06:50:00');
    entries = punch(entries, '2024-01-03', '06:50:00');
    // 01-04 intentionally has no entry
    entries = punch(entries, '2024-01-05', '06:50:00');
    entries = punch(entries, '2024-01-07', '06:50:00');
    entries = punch(entries, '2024-01-08', '06:50:00');

    expect(computeAchievementStreak(entries, schedule, '2024-01-08')).toBe(3);
  });
});

describe('isScheduleEditLockedForDate', () => {
  it('is locked once a punch is recorded for that date', () => {
    const entries = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1, '06:50:00', '07:00:00');
    expect(isScheduleEditLockedForDate(entries, '2026-09-21')).toBe(true);
  });

  it('is unlocked when no punch has been recorded for that date', () => {
    expect(isScheduleEditLockedForDate(createEmptyEntriesState(), '2026-09-21')).toBe(false);
  });

  it('is unlocked when the recorded punch was cancelled', () => {
    const recorded = recordPunchIn(createEmptyEntriesState(), '2026-09-21', 1, '06:50:00', '07:00:00');
    const cancelled = {
      entries: { ...recorded.entries, '2026-09-21': { ...recorded.entries['2026-09-21'], cancelled: true } },
    };
    expect(isScheduleEditLockedForDate(cancelled, '2026-09-21')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest store/entries.test.ts
```

Expected: FAIL — `computeAchievementStreak`/`isScheduleEditLockedForDate` are not exported.

- [ ] **Step 3: Append the implementations to `store/entries.ts`**

```typescript
import { addDaysToDateKey } from './dateUtils';

// Defensive cap so a schedule with no history yet (or a huge gap) can't
// spin forever; ~10 years of daily lookback is far beyond any real pilot.
const MAX_STREAK_LOOKBACK_DAYS = 3650;

export function computeAchievementStreak(
  entries: EntriesState,
  schedule: WeeklyScheduleState,
  asOfDate: DateKey
): number {
  let streak = 0;
  let cursor = asOfDate;
  for (let i = 0; i < MAX_STREAK_LOOKBACK_DAYS; i++) {
    const status = getDayCalendarStatus(entries, schedule, cursor);
    if (status === 'no-target') {
      cursor = addDaysToDateKey(cursor, -1);
      continue;
    }
    if (status === 'achieved') {
      streak += 1;
      cursor = addDaysToDateKey(cursor, -1);
      continue;
    }
    break; // 'late' or 'no-record' breaks the streak
  }
  return streak;
}

export function isScheduleEditLockedForDate(entries: EntriesState, date: DateKey): boolean {
  const entry = entries.entries[date];
  return Boolean(entry && !entry.cancelled);
}
```

(Add the `addDaysToDateKey` import to the existing import line from `./dateUtils` at the top of the file rather than duplicating the import statement.)

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest store/entries.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add store/entries.ts store/entries.test.ts
git commit -m "feat: add achievement streak calculation and same-day schedule lock"
```

---

## Task 6: AsyncStorage persistence with corrupt-JSON fallback

**Files:**
- Create: `store/persistence.ts`
- Test: `store/persistence.test.ts`

**Interfaces:**
- Consumes: types from Task 2; `createInitialSchedule` from Task 3; `@react-native-async-storage/async-storage`.
- Produces: `ENTRIES_STORAGE_KEY`, `SCHEDULE_STORAGE_KEY`; `saveEntriesState(state): Promise<void>`; `loadEntriesState(): Promise<EntriesState>`; `saveScheduleState(state): Promise<void>`; `loadScheduleState(fallbackEffectiveFrom: DateKey): Promise<WeeklyScheduleState>`.

- [ ] **Step 1: Write the failing tests**

Create `store/persistence.test.ts`:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createInitialSchedule } from './schedule';
import {
  ENTRIES_STORAGE_KEY,
  SCHEDULE_STORAGE_KEY,
  loadEntriesState,
  loadScheduleState,
  saveEntriesState,
  saveScheduleState,
} from './persistence';

describe('persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('round-trips entries state through save and load', async () => {
    const state = {
      entries: {
        '2026-09-21': {
          date: '2026-09-21',
          punchedAtEpochMs: 1,
          punchedAtLocalTime: '06:50:00',
          targetTimeSnapshot: '07:00:00',
          status: 'achieved' as const,
          cancelled: false,
        },
      },
    };
    await saveEntriesState(state);
    expect(await loadEntriesState()).toEqual(state);
  });

  it('returns an empty entries store when nothing was ever saved', async () => {
    expect(await loadEntriesState()).toEqual({ entries: {} });
  });

  it('falls back to an empty entries store when the saved JSON is corrupt', async () => {
    await AsyncStorage.setItem(ENTRIES_STORAGE_KEY, '{not valid json');
    expect(await loadEntriesState()).toEqual({ entries: {} });
  });

  it('falls back to an empty entries store when the saved shape is wrong', async () => {
    await AsyncStorage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify({ foo: 'bar' }));
    expect(await loadEntriesState()).toEqual({ entries: {} });
  });

  it('round-trips schedule state through save and load', async () => {
    const state = createInitialSchedule('2026-09-21');
    await saveScheduleState(state);
    expect(await loadScheduleState('2099-01-01')).toEqual(state);
  });

  it('falls back to a fresh default schedule when the saved JSON is corrupt', async () => {
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, '{not valid json');
    expect(await loadScheduleState('2026-09-21')).toEqual(createInitialSchedule('2026-09-21'));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest store/persistence.test.ts
```

Expected: FAIL — `Cannot find module './persistence'`.

- [ ] **Step 3: Write `store/persistence.ts`**

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DateKey, EntriesState, WeeklyScheduleState } from './types';
import { createInitialSchedule } from './schedule';

export const ENTRIES_STORAGE_KEY = 'hayaoki:entries:v1';
export const SCHEDULE_STORAGE_KEY = 'hayaoki:schedule:v1';

export async function saveEntriesState(state: EntriesState): Promise<void> {
  await AsyncStorage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify(state));
}

export async function saveScheduleState(state: WeeklyScheduleState): Promise<void> {
  await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(state));
}

export async function loadEntriesState(): Promise<EntriesState> {
  const raw = await AsyncStorage.getItem(ENTRIES_STORAGE_KEY);
  if (raw === null) return { entries: {} };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.entries !== 'object') {
      return { entries: {} };
    }
    return parsed as EntriesState;
  } catch {
    // Corrupt JSON (e.g. an app-kill mid-write): prefer an empty store over crashing.
    return { entries: {} };
  }
}

export async function loadScheduleState(fallbackEffectiveFrom: DateKey): Promise<WeeklyScheduleState> {
  const raw = await AsyncStorage.getItem(SCHEDULE_STORAGE_KEY);
  if (raw === null) return createInitialSchedule(fallbackEffectiveFrom);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rules)) {
      return createInitialSchedule(fallbackEffectiveFrom);
    }
    return parsed as WeeklyScheduleState;
  } catch {
    return createInitialSchedule(fallbackEffectiveFrom);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest store/persistence.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add store/persistence.ts store/persistence.test.ts
git commit -m "feat: add AsyncStorage persistence with corrupt-JSON fallback"
```

---

## Task 7: Parent PIN storage and verification

**Files:**
- Create: `store/pin.ts`
- Test: `store/pin.test.ts`

**Interfaces:**
- Consumes: `@react-native-async-storage/async-storage`.
- Produces: `getStoredPin(): Promise<string>`; `setStoredPin(pin: string): Promise<void>`; `verifyPin(candidate: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing tests**

Create `store/pin.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest store/pin.test.ts
```

Expected: FAIL — `Cannot find module './pin'`.

- [ ] **Step 3: Write `store/pin.ts`**

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest store/pin.test.ts
```

Expected: PASS, both tests green.

- [ ] **Step 5: Commit**

```bash
git add store/pin.ts store/pin.test.ts
git commit -m "feat: add parent PIN storage and verification"
```

---

## Task 8: App store — confirm-before-update persistence wiring

**Files:**
- Create: `store/useAppStore.ts`
- Test: `store/useAppStore.test.ts`

**Interfaces:**
- Consumes: `createEmptyEntriesState`, `recordPunchIn`, `DuplicatePunchError` from Task 4; `createInitialSchedule`, `addScheduleRule` from Task 3; `getLocalDateKey` from Task 2; `isScheduleEditLockedForDate` from Task 5; `saveEntriesState`, `saveScheduleState`, `loadEntriesState`, `loadScheduleState` from Task 6.
- Produces: `createAppStore()` (a factory returning a fresh Zustand store, used both by the app singleton and by tests to avoid shared state), `useAppStore` (the app-wide singleton instance), with shape `{ entries, schedule, hydrated, lastError, hydrate(): Promise<void>, punchIn(date, punchedAtEpochMs, punchedAtLocalTime, targetTimeSnapshot): Promise<boolean>, addScheduleRuleAndPersist(rule): Promise<boolean> }`.

- [ ] **Step 1: Write the failing tests**

Create `store/useAppStore.test.ts`:

```typescript
jest.mock('./persistence');

import { createEmptyEntriesState } from './entries';
import { createInitialSchedule } from './schedule';
import * as persistence from './persistence';
import { createAppStore } from './useAppStore';

const mockedPersistence = persistence as jest.Mocked<typeof persistence>;

describe('useAppStore punchIn', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedPersistence.loadEntriesState.mockResolvedValue(createEmptyEntriesState());
    mockedPersistence.loadScheduleState.mockResolvedValue(createInitialSchedule('2026-01-01'));
  });

  it('does not update entries state when persistence fails (no optimistic UI)', async () => {
    mockedPersistence.saveEntriesState.mockRejectedValue(new Error('disk full'));
    const store = createAppStore();
    await store.getState().hydrate();

    const success = await store.getState().punchIn('2026-09-21', 1234567890000, '06:55:00', '07:00:00');

    expect(success).toBe(false);
    expect(store.getState().entries.entries['2026-09-21']).toBeUndefined();
    expect(store.getState().lastError).toBe('save-failed');
  });

  it('updates entries state only after persistence succeeds', async () => {
    mockedPersistence.saveEntriesState.mockResolvedValue(undefined);
    const store = createAppStore();
    await store.getState().hydrate();

    const success = await store.getState().punchIn('2026-09-21', 1234567890000, '06:55:00', '07:00:00');

    expect(success).toBe(true);
    expect(store.getState().entries.entries['2026-09-21'].status).toBe('achieved');
  });

  it('rejects a second punch on the same date without touching persistence again', async () => {
    mockedPersistence.saveEntriesState.mockResolvedValue(undefined);
    const store = createAppStore();
    await store.getState().hydrate();
    await store.getState().punchIn('2026-09-21', 1000, '06:55:00', '07:00:00');

    const success = await store.getState().punchIn('2026-09-21', 2000, '06:56:00', '07:00:00');

    expect(success).toBe(false);
    expect(store.getState().lastError).toBe('already-punched');
    expect(mockedPersistence.saveEntriesState).toHaveBeenCalledTimes(1);
  });
});

describe('useAppStore addScheduleRuleAndPersist', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedPersistence.loadEntriesState.mockResolvedValue(createEmptyEntriesState());
    mockedPersistence.loadScheduleState.mockResolvedValue(createInitialSchedule('2026-01-01'));
    mockedPersistence.saveScheduleState.mockResolvedValue(undefined);
  });

  it('blocks a change to today once today is already punched', async () => {
    mockedPersistence.saveEntriesState.mockResolvedValue(undefined);
    const store = createAppStore();
    await store.getState().hydrate();
    await store.getState().punchIn('2026-09-21', 1000, '06:55:00', '07:00:00');

    const success = await store.getState().addScheduleRuleAndPersist({
      dayOfWeek: 1,
      enabled: true,
      targetTime: '08:00:00',
      effectiveFrom: '2026-09-21',
    });

    expect(success).toBe(false);
    expect(mockedPersistence.saveScheduleState).not.toHaveBeenCalled();
  });

  it('allows a change to a future date even if today is punched', async () => {
    mockedPersistence.saveEntriesState.mockResolvedValue(undefined);
    const store = createAppStore();
    await store.getState().hydrate();
    await store.getState().punchIn('2026-09-21', 1000, '06:55:00', '07:00:00');

    const success = await store.getState().addScheduleRuleAndPersist({
      dayOfWeek: 1,
      enabled: true,
      targetTime: '08:00:00',
      effectiveFrom: '2026-09-22',
    });

    expect(success).toBe(true);
    expect(mockedPersistence.saveScheduleState).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest store/useAppStore.test.ts
```

Expected: FAIL — `Cannot find module './useAppStore'`.

- [ ] **Step 3: Write `store/useAppStore.ts`**

```typescript
import { create } from 'zustand';
import type { EntriesState, ScheduleRule, WeeklyScheduleState, DateKey, TimeOfDay } from './types';
import { createEmptyEntriesState, recordPunchIn, DuplicatePunchError, isScheduleEditLockedForDate } from './entries';
import { createInitialSchedule, addScheduleRule } from './schedule';
import { getLocalDateKey } from './dateUtils';
import { loadEntriesState, loadScheduleState, saveEntriesState, saveScheduleState } from './persistence';

type LastError = null | 'save-failed' | 'already-punched' | 'schedule-locked-today';

interface AppStoreState {
  entries: EntriesState;
  schedule: WeeklyScheduleState;
  hydrated: boolean;
  lastError: LastError;
  hydrate: () => Promise<void>;
  punchIn: (
    date: DateKey,
    punchedAtEpochMs: number,
    punchedAtLocalTime: TimeOfDay,
    targetTimeSnapshot: TimeOfDay
  ) => Promise<boolean>;
  addScheduleRuleAndPersist: (rule: ScheduleRule) => Promise<boolean>;
}

export function createAppStore() {
  return create<AppStoreState>((set, get) => ({
    entries: createEmptyEntriesState(),
    schedule: createInitialSchedule(getLocalDateKey(new Date())),
    hydrated: false,
    lastError: null,

    hydrate: async () => {
      const today = getLocalDateKey(new Date());
      const [entries, schedule] = await Promise.all([loadEntriesState(), loadScheduleState(today)]);
      set({ entries, schedule, hydrated: true });
    },

    punchIn: async (date, punchedAtEpochMs, punchedAtLocalTime, targetTimeSnapshot) => {
      let next: EntriesState;
      try {
        next = recordPunchIn(get().entries, date, punchedAtEpochMs, punchedAtLocalTime, targetTimeSnapshot);
      } catch (e) {
        if (e instanceof DuplicatePunchError) {
          set({ lastError: 'already-punched' });
          return false;
        }
        throw e;
      }
      try {
        await saveEntriesState(next);
      } catch {
        // Persistence failed: leave in-memory state untouched, so the UI
        // stays at "not recorded" instead of updating optimistically.
        set({ lastError: 'save-failed' });
        return false;
      }
      set({ entries: next, lastError: null });
      return true;
    },

    addScheduleRuleAndPersist: async (rule) => {
      const today = getLocalDateKey(new Date());
      if (rule.effectiveFrom === today && isScheduleEditLockedForDate(get().entries, today)) {
        set({ lastError: 'schedule-locked-today' });
        return false;
      }
      const next = addScheduleRule(get().schedule, rule);
      await saveScheduleState(next);
      set({ schedule: next, lastError: null });
      return true;
    },
  }));
}

export const useAppStore = createAppStore();
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest store/useAppStore.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Run the full test suite**

```bash
npx jest
npx tsc --noEmit
```

Expected: all test files pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add store/useAppStore.ts store/useAppStore.test.ts
git commit -m "feat: add app store with confirm-before-update persistence and same-day lock enforcement"
```

---

## Task 9: Today screen — fresh-time punch-in with foreground/interval re-evaluation

**Files:**
- Create: `app/today.tsx`

**Interfaces:**
- Consumes: `useAppStore` from Task 8; `getLocalDateKey`, `getLocalTimeOfDay`, `isWithinPunchWindow` from Task 2; `getEffectiveRule` from Task 3; `DayOfWeek` type from Task 2.
- No automated test (per the design's 3A decision, UI screens are verified manually).

- [ ] **Step 1: Write `app/today.tsx`**

```typescript
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { getLocalDateKey, getLocalTimeOfDay, isWithinPunchWindow } from '../store/dateUtils';
import { getEffectiveRule } from '../store/schedule';
import type { DayOfWeek } from '../store/types';

export default function TodayScreen() {
  const entries = useAppStore((s) => s.entries);
  const schedule = useAppStore((s) => s.schedule);
  const hydrated = useAppStore((s) => s.hydrated);
  const hydrate = useAppStore((s) => s.hydrate);
  const punchIn = useAppStore((s) => s.punchIn);
  const [canPunch, setCanPunch] = useState(false);
  const [reason, setReason] = useState('読み込み中です…');

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  const reevaluate = useCallback(() => {
    if (!hydrated) {
      setCanPunch(false);
      setReason('読み込み中です…');
      return;
    }
    const now = new Date();
    const today = getLocalDateKey(now);
    const timeOfDay = getLocalTimeOfDay(now);
    const dayOfWeek = now.getDay() as DayOfWeek;
    const rule = getEffectiveRule(schedule, dayOfWeek, today);
    const alreadyPunched = Boolean(entries.entries[today]);

    if (alreadyPunched) {
      setCanPunch(false);
      setReason('本日はすでに記録済みです');
    } else if (!rule || !rule.enabled) {
      setCanPunch(false);
      setReason('本日は目標が設定されていません');
    } else if (!isWithinPunchWindow(timeOfDay)) {
      setCanPunch(false);
      setReason('打刻できるのは04:00〜12:00の間だけです');
    } else {
      setCanPunch(true);
      setReason('');
    }
  }, [entries, schedule, hydrated]);

  useEffect(() => {
    reevaluate();
  }, [reevaluate]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') reevaluate();
    });
    return () => subscription.remove();
  }, [reevaluate]);

  useEffect(() => {
    // Catches the punch-window and date-boundary crossings even if the app
    // is left open in the foreground without ever backgrounding.
    const interval = setInterval(reevaluate, 30000);
    return () => clearInterval(interval);
  }, [reevaluate]);

  const handlePunch = useCallback(async () => {
    if (!hydrated) return;
    // Re-fetch the current time right before punching, never a stale value
    // captured when the screen first opened.
    const now = new Date();
    const today = getLocalDateKey(now);
    const timeOfDay = getLocalTimeOfDay(now);
    const dayOfWeek = now.getDay() as DayOfWeek;
    const rule = getEffectiveRule(schedule, dayOfWeek, today);
    if (!rule || !rule.enabled || !isWithinPunchWindow(timeOfDay)) {
      reevaluate();
      return;
    }
    const success = await punchIn(today, now.getTime(), timeOfDay, rule.targetTime);
    reevaluate();
    if (!success) {
      setReason('記録に失敗しました。もう一度お試しください。');
    }
  }, [hydrated, schedule, punchIn, reevaluate]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <Pressable
        onPress={handlePunch}
        disabled={!canPunch}
        style={{ padding: 24, borderRadius: 999, backgroundColor: canPunch ? '#4CAF50' : '#ccc' }}
      >
        <Text style={{ fontSize: 20, color: 'white' }}>起きたよ！</Text>
      </Pressable>
      {reason ? <Text>{reason}</Text> : null}
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual QA**

```bash
npx expo start
```

Open the app on a simulator/device or in Expo Go. Verify:
- Outside 04:00–12:00 local time, the button is disabled and shows the punch-window reason.
- Inside the window, pressing the button records the punch and immediately disables the button with "本日はすでに記録済みです".
- Backgrounding and resuming the app re-evaluates the button (e.g. simulate crossing 12:00 by changing the device clock, then resume from background).

- [ ] **Step 4: Commit**

```bash
git add app/today.tsx
git commit -m "feat: add Today screen with fresh-time punch-in and foreground re-evaluation"
```

---

## Task 10: Settings screen — parent PIN gate and same-day lock

**Files:**
- Create: `app/settings.tsx`

**Interfaces:**
- Consumes: `useAppStore` (`entries`, `addScheduleRuleAndPersist`) from Task 8; `verifyPin` from Task 7; `isScheduleEditLockedForDate` from Task 5; `isValidTargetTime` from Task 3; `getLocalDateKey` from Task 2; `DayOfWeek` type from Task 2.
- No automated test (manual QA per the design's 3A decision). T9 (later, out of this plan's scope) will replace this single-row form with the full 7-day native-time-picker grid.

- [ ] **Step 1: Write `app/settings.tsx`**

```typescript
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
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual QA**

```bash
npx expo start
```

Navigate to `/settings`. Verify:
- The target-time field is inaccessible until the correct PIN (default `0000`) is entered; a wrong PIN shows "PINが違います".
- Before today's punch is recorded, the field is editable and saving persists (re-open the app / check via the Today screen's disabled reason after changing today's target below the current time).
- After punching in via the Today screen, returning to Settings shows the field disabled with "本日は打刻済みのため編集できません", and saving is blocked.
- Entering a target time outside 04:00:00–12:00:00 shows the range-validation message and does not save.

- [ ] **Step 4: Commit**

```bash
git add app/settings.tsx
git commit -m "feat: add Settings screen with parent PIN gate and same-day schedule lock"
```

---

## Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

```bash
npx jest
```

Expected: every test file from Tasks 2–8 passes (dateUtils, schedule, entries, persistence, pin, useAppStore).

- [ ] **Step 2: Type-check the whole project**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Walk the design's Success Criteria for T1–T7**

Using `npx expo start`, manually confirm each item that this plan's scope covers:
- Duplicate punch-in on the same day is rejected (T1).
- A punch exactly at or before the target second is "achieved"; one second after is "late" (T1).
- Killing the app after a failed AsyncStorage write leaves the day "not recorded," with a retry toast/message shown (T2).
- Corrupting the stored JSON (e.g. via a debug menu or manually editing AsyncStorage in a dev tool) does not crash the app on next launch; it starts with an empty history instead (T3).
- Turning a weekday OFF today does not change the classification of that weekday's *past* dates (T4).
- Schedule changes require the parent PIN, and today's target time cannot be changed after today's punch (T5).
- Backgrounding and resuming the app (or waiting through a punch-window boundary) re-evaluates the punch button without requiring a manual refresh (T6).
- An OFF day between two achieved days does not reset the achievement streak; a late punch or a missed day does (T7).

- [ ] **Step 4: Commit any final fixes found during manual QA, then tag the milestone**

```bash
git add -A
git commit -m "chore: complete T1-T7 store foundation verification pass"
```

(Only if Step 3 required fixes — if everything already passed, there is nothing to commit here.)
