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
