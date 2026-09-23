import { test, expect, expectDisabled } from './fixtures';
import { at, OFFSET, DOW } from './dates';

test.describe('Today screen - punching in', () => {
  test('punching within the window before the target time is recorded as achieved', async ({ page, freshApp }) => {
    await freshApp(at(OFFSET.MON, 6, 0)); // 06:00, before the default 06:30 target
    await page.getByTestId('punch-button').click();

    await expect(page.getByTestId('status-character')).toHaveAttribute('aria-label', 'achieved');
    await expect(page.getByTestId('points-balance')).toHaveText('ポイント: 1');
    await expect(page.getByTestId('achievement-streak')).toHaveText('連続達成: 1日');
    await expectDisabled(page.getByTestId('punch-button'));
  });

  test('the punch button is disabled outside the 05:00-08:00 window, with a reason shown', async ({
    page,
    freshApp,
  }) => {
    await freshApp(at(OFFSET.MON, 4, 59, 59));
    await expectDisabled(page.getByTestId('punch-button'));
    await expect(page.getByTestId('punch-reason')).toContainText('05:00');

    await freshApp(at(OFFSET.MON, 8, 0, 1));
    await expectDisabled(page.getByTestId('punch-button'));
    await expect(page.getByTestId('punch-reason')).toContainText('05:00');
  });

  test('a second punch on the same day is blocked (duplicate guard)', async ({ page, freshApp }) => {
    await freshApp(at(OFFSET.MON, 6, 0));
    await page.getByTestId('punch-button').click();
    await expectDisabled(page.getByTestId('punch-button'));

    // A disabled Pressable can't be clicked again through the UI at all —
    // this *is* the duplicate guard, enforced at the interaction layer.
    await expect(page.getByTestId('punch-reason')).toHaveText('本日はすでに記録済みです');
  });

  test('punching after the target time is recorded as late and breaks the streak', async ({
    page,
    freshApp,
    jumpTo,
  }) => {
    await freshApp(at(OFFSET.MON, 6, 0));
    await page.getByTestId('punch-button').click();
    await expect(page.getByTestId('points-balance')).toHaveText('ポイント: 1');

    await jumpTo(at(OFFSET.TUE, 7, 0)); // after the 06:30 target, still inside the window
    await page.getByTestId('punch-button').click();

    await expect(page.getByTestId('status-character')).toHaveAttribute('aria-label', 'late');
    await expect(page.getByTestId('points-balance')).toHaveText('ポイント: 1'); // unchanged
    await expect(page.getByTestId('achievement-streak')).toHaveText('連続達成: 0日');
  });
});

test.describe('Today screen - OFF weekday', () => {
  test('the punch button is disabled on a day turned OFF', async ({ page, freshApp }) => {
    await freshApp(at(OFFSET.MON, 6, 0), '/settings');
    await page.getByTestId('pin-input').fill('0000');
    await page.getByTestId('pin-confirm-button').click();
    await page.getByTestId(`schedule-enabled-${DOW.MON}`).click();
    await page.getByTestId(`schedule-save-${DOW.MON}`).click();
    await expect(page.getByTestId(`schedule-message-${DOW.MON}`)).toHaveText('保存しました');

    await page.goto('/today');
    await expectDisabled(page.getByTestId('punch-button'));
    await expect(page.getByTestId('punch-reason')).toHaveText('本日は目標が設定されていません');
  });
});
