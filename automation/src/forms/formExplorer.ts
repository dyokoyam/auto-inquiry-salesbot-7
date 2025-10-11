import type { Frame, Page } from 'playwright';
import type { ExploreResult } from '../types/outcome';

export const REFUSAL_KEYWORDS = ['\u9060\u616e', '\u304a\u65ad\u308a', '\u7981\u6b62', '\u63a7\u3048', '\u55b6\u696d\u4e0d\u53ef'];

type LocatorHost = Pick<Page, 'locator'> | Pick<Frame, 'locator'>;

function isVisible(locator: ReturnType<Page['locator']>): Promise<boolean> {
  return locator.isVisible().catch(() => false);
}

async function hasFormElements(host: LocatorHost): Promise<boolean> {
  const textareaCount = await host.locator('textarea').count();
  if (textareaCount > 0) return true;
  const inputCount = await host.locator('form input, form select, form textarea').count();
  return inputCount > 2;
}

export async function exploreForm(page: Page): Promise<ExploreResult> {
  await page.waitForTimeout(1_000);

  if (await hasFormElements(page)) {
    const textareaVisible = await isVisible(page.locator('textarea').first());
    const fieldVisible = await isVisible(page.locator('form input, form select, form textarea').first());
    if (textareaVisible || fieldVisible) {
      return { success: true, currentForm: true, contactLink: null };
    }
  }

  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    try {
      if (await hasFormElements(frame)) {
        const textareaVisible = await frame.locator('textarea').first().isVisible().catch(() => false);
        const fieldVisible = await frame
          .locator('form input, form select, form textarea')
          .first()
          .isVisible()
          .catch(() => false);
        if (textareaVisible || fieldVisible) {
          return { success: true, currentForm: true, contactLink: null };
        }
      }
    } catch {
      // ignore iframe access errors
    }
  }

  const links = await collectContactLinks(page);
  if (links.length > 0) {
    const currentUrl = page.url().replace(/\/$/, '');
    for (let i = links.length - 1; i >= 0; i--) {
      const link = links[i];
      if (link !== currentUrl) {
        return {
          success: true,
          currentForm: false,
          contactLink: link,
        };
      }
    }
  }

  return {
    success: false,
    currentForm: false,
    contactLink: null,
    message: '問い合わせフォームが見つかりませんでした',
  };
}

export async function collectContactLinks(page: Page): Promise<string[]> {
  const results = new Set<string>();
  const linkLocator = page.locator('a[href]');
  const linkCount = await linkLocator.count();
  const currentUrl = page.url();

  for (let i = 0; i < linkCount; i++) {
    const handle = linkLocator.nth(i);
    const href = await handle.getAttribute('href');
    if (!href) continue;

    const text = (await handle.innerText().catch(() => '')) || '';
    const normalizedHref = href.trim();

    if (!containsContactKeyword(normalizedHref) && !containsContactKeyword(text)) {
      continue;
    }

    try {
      const absolute = new URL(normalizedHref, currentUrl).toString().replace(/\/$/, '');
      results.add(absolute);
    } catch {
      continue;
    }
  }

  return Array.from(results);
}

function containsContactKeyword(value: string): boolean {
  if (!value) return false;
  return /(inquiry|inq|contact|support|\u554f\u3044\u5408|\u304a\u554f\u3044\u5408\u308f\u305b|\u554f\u3044\u5408\u305b|\u304a\u554f\u3044\u5408\u308f\u305b)/i.test(value);
}
