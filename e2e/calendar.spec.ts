import { test, expect } from './fixtures';
import { at, calendarDayTestId, OFFSET, DOW } from './dates';

test('the calendar distinguishes all four day states', async ({ page, freshApp, jumpTo }) => {
  await freshApp(at(OFFSET.MON, 6, 0));
  await page.getByTestId('punch-button').click(); // Mon: achieved

  await jumpTo(at(OFFSET.TUE, 7, 0)); // after the 06:30 target
  await page.getByTestId('punch-button').click(); // Tue: late

  await jumpTo(at(OFFSET.WED, 9, 0)); // Wed: left unpunched -> no-record

  await page.goto('/settings');
  await page.getByTestId('pin-input').fill('0000');
  await page.getByTestId('pin-confirm-button').click();
  await page.getByTestId(`schedule-enabled-${DOW.THU}`).click(); // Thu: turned OFF -> no-target
  await page.getByTestId(`schedule-save-${DOW.THU}`).click();
  await expect(page.getByTestId(`schedule-message-${DOW.THU}`)).toHaveText('保存しました');

  await page.goto('/calendar');
  await expect(page.getByTestId(calendarDayTestId(OFFSET.MON))).toHaveAttribute('aria-label', '達成 6:00');
  await expect(page.getByTestId(calendarDayTestId(OFFSET.MON))).toContainText('6:00');
  await expect(page.getByTestId(calendarDayTestId(OFFSET.TUE))).toHaveAttribute('aria-label', '未達成（遅刻） 7:00');
  await expect(page.getByTestId(calendarDayTestId(OFFSET.WED))).toHaveAttribute('aria-label', '未記録');
  await expect(page.getByTestId(calendarDayTestId(OFFSET.THU))).toHaveAttribute('aria-label', '目標なし');
});
