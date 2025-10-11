import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { AutomationConfig } from '../config';

export interface BrowserBundle {
  browser: Browser;
  context: BrowserContext;
}

export async function createBrowserBundle(config: AutomationConfig): Promise<BrowserBundle> {
  const browser = await chromium.launch({
    headless: config.headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: config.userAgent,
    locale: config.locale,
    timezoneId: config.timezone,
  });

  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    } catch {
      // ignore
    }
  });

  return { browser, context };
}
