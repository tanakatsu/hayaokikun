import { test, expect, expectDisabled, expectEnabled } from './fixtures';
import { at, OFFSET, DOW } from './dates';

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

test.describe('Settings - cancelling a record', () => {
  test('a parent can cancel a recorded punch after confirming, and it cannot be redone', async ({
    page,
    freshApp,
  }) => {
    await freshApp(at(OFFSET.MON, 6, 0));
    await page.getByTestId('punch-button').click();

    await page.goto('/settings');
    await page.getByTestId('pin-input').fill('0000');
    await page.getByTestId('pin-confirm-button').click();
    await expect(page.getByTestId('cancel-today-status')).toContainText('達成');

    // Both the confirm prompt and the success alert fire in quick succession
    // off this one click; a single persistent handler accepts whichever
    // shows up rather than racing to attach a fresh once() between them.
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByTestId('cancel-today-button').click();
    await expect(page.getByTestId('cancel-today-button')).toHaveCount(0);

    await page.goto('/today');
    await expectDisabled(page.getByTestId('punch-button'));
    await expect(page.getByTestId('punch-reason')).toHaveText('本日の記録は取り消されました（再打刻はできません）');
  });
});
