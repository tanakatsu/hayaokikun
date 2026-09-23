import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { MAX_TARGET_TIME, MIN_TARGET_TIME } from '../store/config';
import { getLocalDateKey, getLocalTimeOfDay, isWithinPunchWindow } from '../store/dateUtils';
import { getEffectiveRule } from '../store/schedule';
import { computeAchievementStreak, computePointsBalance, getDayCalendarStatus } from '../store/entries';
import { selectEncouragementMessage } from '../lib/messages';
import type { DayOfWeek } from '../store/types';

export default function TodayScreen() {
  const entries = useAppStore((s) => s.entries);
  const schedule = useAppStore((s) => s.schedule);
  const hydrated = useAppStore((s) => s.hydrated);
  const hydrate = useAppStore((s) => s.hydrate);
  const punchIn = useAppStore((s) => s.punchIn);
  const [canPunch, setCanPunch] = useState(false);
  const [reason, setReason] = useState('読み込み中です…');
  const isPunchingRef = useRef(false);

  const now = new Date();
  const today = getLocalDateKey(now);
  const todayLabel = now.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
  const points = hydrated ? computePointsBalance(entries, schedule) : 0;
  const streak = hydrated ? computeAchievementStreak(entries, schedule, today) : 0;
  const todayStatus = hydrated ? getDayCalendarStatus(entries, schedule, today) : 'no-record';
  const CHARACTER: Record<typeof todayStatus, string> = {
    achieved: '😄',
    late: '😥',
    'no-record': '😴',
    'no-target': '😌',
  };
  const encouragement = hydrated ? selectEncouragementMessage(entries, schedule, today) : null;

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
    const todayEntry = entries.entries[today];

    if (todayEntry && !todayEntry.cancelled) {
      setCanPunch(false);
      setReason('本日はすでに記録済みです');
    } else if (todayEntry && todayEntry.cancelled) {
      setCanPunch(false);
      setReason('本日の記録は取り消されました（再打刻はできません）');
    } else if (!rule || !rule.enabled) {
      setCanPunch(false);
      setReason('本日は目標が設定されていません');
    } else if (!isWithinPunchWindow(timeOfDay)) {
      setCanPunch(false);
      setReason(`打刻できるのは${MIN_TARGET_TIME.slice(0, 5)}〜${MAX_TARGET_TIME.slice(0, 5)}の間だけです`);
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
    if (!hydrated || isPunchingRef.current) return;
    isPunchingRef.current = true;
    try {
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
      if (!success) {
        // On success, don't call reevaluate() here: this closure's `entries`
        // is still the pre-punch snapshot (state hasn't re-rendered this
        // component yet), so it would immediately clobber the correct
        // post-punch disabled state with a stale "not punched yet" one. The
        // effect above already re-runs reevaluate() with fresh `entries` once
        // the store update flows through.
        reevaluate();
        if (useAppStore.getState().lastError !== 'already-punched') {
          setReason('記録に失敗しました。もう一度お試しください。');
        }
      }
    } finally {
      isPunchingRef.current = false;
    }
  }, [hydrated, schedule, punchIn, reevaluate]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <Text style={{ fontSize: 16, color: '#616161' }}>{todayLabel}</Text>
      <Text testID="status-character" accessibilityLabel={todayStatus} style={{ fontSize: 48 }}>
        {CHARACTER[todayStatus]}
      </Text>
      <Text testID="points-balance" style={{ fontSize: 18 }}>ポイント: {points}</Text>
      <Text testID="achievement-streak" style={{ fontSize: 14 }}>連続達成: {streak}日</Text>
      {encouragement ? (
        <Text testID="encouragement-message" style={{ fontSize: 14, textAlign: 'center' }}>
          {encouragement}
        </Text>
      ) : null}
      <Pressable
        testID="punch-button"
        onPress={handlePunch}
        disabled={!canPunch}
        style={{ padding: 24, borderRadius: 999, backgroundColor: canPunch ? '#4CAF50' : '#ccc' }}
      >
        <Text style={{ fontSize: 20, color: 'white' }}>起きたよ！</Text>
      </Pressable>
      {reason ? <Text testID="punch-reason">{reason}</Text> : null}
    </View>
  );
}
