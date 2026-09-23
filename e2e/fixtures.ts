import { test as base, expect, type Locator, type Page } from '@playwright/test';

type Fixtures = {
  // Installs a fake clock fixed at `at`, then navigates to `path`. Must be
  // used instead of a bare page.goto(): the store's initial state (and the
  // 04:00-12:00 window checks) call `new Date()` the moment the app's JS
  // first runs, so the clock has to be faked before that bundle executes.
  freshApp: (at: Date, path?: string) => Promise<void>;
  // Jumps the fake clock forward without firing any timers in between (a
  // real app would just be closed overnight), then reloads so the app
  // re-mounts and re-evaluates everything against the new "now".
  jumpTo: (at: Date) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  freshApp: async ({ page }, use) => {
    await use(async (at: Date, path: string = '/today') => {
      // setFixedTime freezes Date entirely (no real-time ticking, no fake
      // timers) — page.clock.install()'s clock keeps advancing in real
      // time, which flakily carries a time-of-day check like the 05:00
      // window edge past its boundary while a test is still running.
      await page.clock.setFixedTime(at);
      await page.goto(path);
    });
  },
  jumpTo: async ({ page }, use) => {
    await use(async (at: Date) => {
      await page.clock.setFixedTime(at);
      await page.reload();
    });
  },
});

export { expect };

export async function acceptNextDialog(page: Page): Promise<void> {
  page.once('dialog', (dialog) => dialog.accept());
}

// react-native-web renders `disabled` as `aria-disabled` on a plain <div>
// (no button/input role), which Playwright's built-in toBeDisabled() /
// toBeEnabled() matchers don't recognize — they only special-case elements
// with a native disabled IDL property or a widget role. Assert the
// attribute directly instead.
export async function expectDisabled(locator: Locator): Promise<void> {
  await expect(locator).toHaveAttribute('aria-disabled', 'true');
}

export async function expectEnabled(locator: Locator): Promise<void> {
  await expect(locator).not.toHaveAttribute('aria-disabled', 'true');
}
