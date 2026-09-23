import { test, expect, expectDisabled } from './fixtures';
import { at, OFFSET, DOW } from './dates';

test.describe('Achievement streak & encouragement messages', () => {
  test('the streak skips an OFF day without breaking, and 3-day/7-day messages trigger', async ({
    page,
    freshApp,
    jumpTo,
  }) => {
    await freshApp(at(OFFSET.MON, 9, 0), '/settings');
    await page.getByTestId('pin-input').fill('0000');
    await page.getByTestId('pin-confirm-button').click();
    await page.getByTestId(`schedule-enabled-${DOW.SAT}`).click(); // Saturday OFF from today
    await page.getByTestId(`schedule-save-${DOW.SAT}`).click();
    await expect(page.getByTestId(`schedule-message-${DOW.SAT}`)).toHaveText('保存しました');

    await jumpTo(at(OFFSET.MON, 6, 0)); // back into the punch window, same day (still on /settings)
    await page.goto('/today');
    await page.getByTestId('punch-button').click(); // Mon: 1st ever achievement
    await expect(page.getByTestId('encouragement-message')).toHaveText('はじめての早起き達成、やったね!🎉');

    await jumpTo(at(OFFSET.TUE, 6, 0));
    await page.getByTestId('punch-button').click(); // streak 2

    await jumpTo(at(OFFSET.WED, 6, 0));
    await page.getByTestId('punch-button').click(); // streak 3
    await expect(page.getByTestId('achievement-streak')).toHaveText('連続達成: 3日');
    await expect(page.getByTestId('encouragement-message')).toHaveText('3日連続達成中!すごい!');

    await jumpTo(at(OFFSET.THU, 6, 0));
    await page.getByTestId('punch-button').click(); // streak 4

    await jumpTo(at(OFFSET.FRI, 6, 0));
    await page.getByTestId('punch-button').click(); // streak 5

    await jumpTo(at(OFFSET.SAT, 9, 0));
    await expectDisabled(page.getByTestId('punch-button')); // OFF day
    await expect(page.getByTestId('achievement-streak')).toHaveText('連続達成: 5日'); // unchanged, not broken

    await jumpTo(at(OFFSET.SUN, 6, 0));
    await page.getByTestId('punch-button').click(); // streak 6 (Sat skipped, not counted)
    await expect(page.getByTestId('achievement-streak')).toHaveText('連続達成: 6日');

    await jumpTo(at(OFFSET.MON2, 6, 0));
    await page.getByTestId('punch-button').click(); // streak 7
    await expect(page.getByTestId('achievement-streak')).toHaveText('連続達成: 7日');
    await expect(page.getByTestId('encouragement-message')).toHaveText('7日連続達成!早起き名人だね!');
  });

  test('a late punch breaks the streak and shows the "streak broken" message', async ({ page, freshApp, jumpTo }) => {
    await freshApp(at(OFFSET.MON, 6, 0));
    await page.getByTestId('punch-button').click(); // streak 1

    await jumpTo(at(OFFSET.TUE, 6, 0));
    await page.getByTestId('punch-button').click(); // streak 2

    await jumpTo(at(OFFSET.WED, 7, 0)); // after the target
    await page.getByTestId('punch-button').click();
    await expect(page.getByTestId('achievement-streak')).toHaveText('連続達成: 0日');
    await expect(page.getByTestId('encouragement-message')).toHaveText('連続記録はここまで。また今日から積み重ねよう!');
  });

  test('an unpunched day breaks the streak, with no encouragement message shown', async ({
    page,
    freshApp,
    jumpTo,
  }) => {
    await freshApp(at(OFFSET.MON, 6, 0));
    await page.getByTestId('punch-button').click(); // streak 1

    await jumpTo(at(OFFSET.TUE, 9, 0)); // never punch Tuesday
    await expect(page.getByTestId('achievement-streak')).toHaveText('連続達成: 0日');
    await expect(page.getByTestId('encouragement-message')).toHaveCount(0);
  });

  test('the first-ever punch being late shows the "first miss" message', async ({ page, freshApp }) => {
    await freshApp(at(OFFSET.MON, 7, 0)); // after the 06:30 target, still inside the window
    await page.getByTestId('punch-button').click();
    await expect(page.getByTestId('encouragement-message')).toHaveText('今日はちょっと遅かったね。また明日がんばろう!');
  });
});
