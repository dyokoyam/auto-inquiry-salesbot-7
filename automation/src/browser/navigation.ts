import type { Page } from 'playwright';

export async function gotoAndWait(page: Page, url: string, waitTimeout: number, delay: number, cooldown = 500): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: waitTimeout });
  const networkIdleTimeout = Math.max(1000, Math.min(waitTimeout, 5000));
  await page.waitForLoadState('networkidle', { timeout: networkIdleTimeout }).catch(() => {});
  if (delay > 0) await page.waitForTimeout(delay);
  if (cooldown > 0) await page.waitForTimeout(cooldown);
}

export async function waitForPostSubmitIdle(page: Page, timeout: number): Promise<void> {
  try {
    await Promise.race([
      page.waitForLoadState('networkidle', { timeout }),
      page.waitForURL(/(thanks|complete|completed|done|finish|finished|sent|success|ok)/i, { timeout }),
    ]);
  } catch {
    // ignore timeout
  }
  await page.waitForTimeout(2_000).catch(() => {});
}
