import { test, expect, expectDisabled, expectEnabled } from './fixtures';
import { at, OFFSET, DOW, dateKey, calendarDayTestId } from './dates';

test.describe('Settings - PIN protection', () => {
  test('the schedule editor stays hidden behind a wrong PIN, and opens on the right one', async ({
    page,
    freshApp,
  }) => {
    await freshApp(at(OFFSET.MON, 9, 0), '/settings');

    await page.getByTestId('pin-input').fill('9999');
    await page.getByTestId('pin-confirm-button').click();
    await expect(page.getByTestId('pin-message')).toHaveText('PINが違います');
    await expect(page.getByTestId(`schedule-row-${DOW.MON}`)).toHaveCount(0);

    await page.getByTestId('pin-input').fill('0000');
    await page.getByTestId('pin-confirm-button').click();
    await expect(page.getByTestId(`schedule-row-${DOW.MON}`)).toBeVisible();
  });

  test('the lock button returns to the PIN screen, requiring re-entry to unlock again', async ({
    page,
    freshApp,
  }) => {
    await freshApp(at(OFFSET.MON, 9, 0), '/settings');

    await page.getByTestId('pin-input').fill('0000');
    await page.getByTestId('pin-confirm-button').click();
    await expect(page.getByTestId(`schedule-row-${DOW.MON}`)).toBeVisible();

    await page.getByTestId('lock-button').click();
    await expect(page.getByTestId('pin-input')).toBeVisible();
    await expect(page.getByTestId(`schedule-row-${DOW.MON}`)).toHaveCount(0);

    await page.getByTestId('pin-input').fill('0000');
    await page.getByTestId('pin-confirm-button').click();
    await expect(page.getByTestId(`schedule-row-${DOW.MON}`)).toBeVisible();
  });
});

test.describe('Settings - same-day target lock', () => {
  test("locks only today's weekday row after punching in, leaving other days editable", async ({
    page,
    freshApp,
  }) => {
    await freshApp(at(OFFSET.MON, 6, 0));
    await page.getByTestId('punch-button').click();
    await expectDisabled(page.getByTestId('punch-button'));

    await page.goto('/settings');
    await page.getByTestId('pin-input').fill('0000');
    await page.getByTestId('pin-confirm-button').click();

    // The Switch's testID lands on a wrapper div; the actual disabled state
    // is on the native checkbox input react-native-web renders inside it.
    await expect(page.getByTestId(`schedule-enabled-${DOW.MON}`).locator('input')).toBeDisabled();
    await expectDisabled(page.getByTestId(`schedule-save-${DOW.MON}`));
    // A previously-shipped bug locked every row once today was punched, not
    // just today's own weekday — guard against that regressing.
    await expect(page.getByTestId(`schedule-enabled-${DOW.TUE}`).locator('input')).toBeEnabled();
    await expectEnabled(page.getByTestId(`schedule-save-${DOW.TUE}`));
  });
});

test.describe('Settings - schedule changes are not retroactive', () => {
  test("turning a weekday OFF today doesn't reclassify that weekday's already-past, unpunched days", async ({
    page,
    freshApp,
    jumpTo,
  }) => {
    await freshApp(at(OFFSET.MON, 9, 0)); // Monday passes with no punch
    await jumpTo(at(OFFSET.WED, 9, 0)); // two days later, still Monday's entry doesn't exist

    await page.goto('/settings');
    await page.getByTestId('pin-input').fill('0000');
    await page.getByTestId('pin-confirm-button').click();
    await page.getByTestId(`schedule-enabled-${DOW.MON}`).click(); // turn Monday OFF, effective today (Wed)
    await page.getByTestId(`schedule-save-${DOW.MON}`).click();
    await expect(page.getByTestId(`schedule-message-${DOW.MON}`)).toHaveText('保存しました');

    await page.goto('/calendar');
    await expect(page.getByTestId(`calendar-day-2026-09-21`)).toHaveAttribute('aria-label', '未記録');
  });
});

test.describe('Settings - correcting recent records', () => {
  async function unlockSettings(page: import('@playwright/test').Page) {
    await page.goto('/settings');
    await page.getByTestId('pin-input').fill('0000');
    await page.getByTestId('pin-confirm-button').click();
  }

  test('a parent can cancel a recorded punch after confirming, and the child cannot re-punch', async ({
    page,
    freshApp,
  }) => {
    await freshApp(at(OFFSET.MON, 6, 0));
    await page.getByTestId('punch-button').click();

    await unlockSettings(page);
    await expect(page.getByTestId(`recent-status-${dateKey(OFFSET.MON)}`)).toContainText('達成');

    page.on('dialog', (dialog) => dialog.accept());
    await page.getByTestId(`recent-cancel-${dateKey(OFFSET.MON)}`).click();
    await expect(page.getByTestId(`recent-status-${dateKey(OFFSET.MON)}`)).toHaveText('取り消し済み');
    await expect(page.getByTestId(`recent-cancel-${dateKey(OFFSET.MON)}`)).toHaveCount(0);

    await page.goto('/today');
    await expectDisabled(page.getByTestId('punch-button'));
    await expect(page.getByTestId('punch-reason')).toHaveText('本日の記録は取り消されました（再打刻はできません）');
  });

  test('a forgotten day can be added and shows up as achieved on the calendar', async ({
    page,
    freshApp,
    jumpTo,
  }) => {
    // The schedule starts on the first launch, so launch on Monday first.
    await freshApp(at(OFFSET.MON, 9, 0));
    await jumpTo(at(OFFSET.TUE, 9, 0)); // Monday passed with no punch
    await unlockSettings(page);
    await expect(page.getByTestId(`recent-status-${dateKey(OFFSET.MON)}`)).toHaveText('未記録');

    page.on('dialog', (dialog) => dialog.accept());
    await page.getByTestId(`recent-time-${dateKey(OFFSET.MON)}`).fill('06:20');
    await page.getByTestId(`recent-save-${dateKey(OFFSET.MON)}`).click();
    await expect(page.getByTestId(`recent-message-${dateKey(OFFSET.MON)}`)).toHaveText('記録しました');
    await expect(page.getByTestId(`recent-status-${dateKey(OFFSET.MON)}`)).toHaveText('達成 06:20');
    await expect(page.getByTestId(`recent-note-${dateKey(OFFSET.MON)}`)).toHaveText('親が追加');

    await page.goto('/calendar');
    await expect(page.getByTestId(calendarDayTestId(OFFSET.MON))).toHaveAttribute('aria-label', '達成 6:20');
  });

  test("editing a late punch keeps the child's original time and flips it to achieved", async ({
    page,
    freshApp,
    jumpTo,
  }) => {
    await freshApp(at(OFFSET.MON, 6, 45)); // default target is 06:30, so this is late
    await page.getByTestId('punch-button').click();
    await jumpTo(at(OFFSET.MON, 9, 0));

    await unlockSettings(page);
    await expect(page.getByTestId(`recent-status-${dateKey(OFFSET.MON)}`)).toHaveText('未達成（遅刻） 06:45');

    page.on('dialog', (dialog) => dialog.accept());
    await page.getByTestId(`recent-time-${dateKey(OFFSET.MON)}`).fill('06:25');
    await page.getByTestId(`recent-save-${dateKey(OFFSET.MON)}`).click();
    await expect(page.getByTestId(`recent-status-${dateKey(OFFSET.MON)}`)).toHaveText('達成 06:25');
    await expect(page.getByTestId(`recent-note-${dateKey(OFFSET.MON)}`)).toHaveText('親が修正（元 06:45）');
  });

  test('a cancelled record comes back when a time is entered again', async ({ page, freshApp, jumpTo }) => {
    await freshApp(at(OFFSET.MON, 6, 0));
    await page.getByTestId('punch-button').click();
    await jumpTo(at(OFFSET.TUE, 9, 0));

    await unlockSettings(page);
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByTestId(`recent-cancel-${dateKey(OFFSET.MON)}`).click();
    await expect(page.getByTestId(`recent-status-${dateKey(OFFSET.MON)}`)).toHaveText('取り消し済み');

    await page.getByTestId(`recent-save-${dateKey(OFFSET.MON)}`).click();
    await expect(page.getByTestId(`recent-status-${dateKey(OFFSET.MON)}`)).toHaveText('達成 06:00');
  });

  test('a time later than now is rejected for today', async ({ page, freshApp }) => {
    await freshApp(at(OFFSET.MON, 6, 0));
    await unlockSettings(page);

    page.on('dialog', (dialog) => dialog.accept());
    await page.getByTestId(`recent-time-${dateKey(OFFSET.MON)}`).fill('06:20');
    await page.getByTestId(`recent-save-${dateKey(OFFSET.MON)}`).click();
    await expect(page.getByTestId(`recent-message-${dateKey(OFFSET.MON)}`)).toContainText('現在より前の時刻');
    await expect(page.getByTestId(`recent-status-${dateKey(OFFSET.MON)}`)).toHaveText('未記録');
  });
});
