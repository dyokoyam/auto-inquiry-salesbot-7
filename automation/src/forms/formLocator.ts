import type { FrameLocator, Locator, Page } from 'playwright';

export type FormContext = Page | FrameLocator;

export async function findFormDocument(page: Page): Promise<FormContext | null> {
  try {
    const hasTextarea = (await page.locator('textarea').count()) > 0;
    const hasFormFields = (await page.locator('form input, form textarea, form select').count()) > 0;
    if (hasTextarea || hasFormFields) {
      return page;
    }
  } catch (error) {
    console.warn('Main document probing error:', error);
  }

  const iframes = page.locator('iframe');
  const iframeCount = await iframes.count();
  for (let i = 0; i < iframeCount; i++) {
    try {
      const frame = page.frameLocator(`iframe:nth-of-type(${i + 1})`);
      const iframeHasTextarea = (await frame.locator('textarea').count()) > 0;
      const iframeHasFormFields = (await frame.locator('form input, form textarea, form select').count()) > 0;
      if (iframeHasTextarea || iframeHasFormFields) {
        return frame;
      }
    } catch (iframeError) {
      console.warn('Cannot access iframe:', iframeError);
    }
  }

  return null;
}

export async function findActiveForm(pageOrFrame: FormContext): Promise<Locator | null> {
  try {
    const firstVisibleTextarea = pageOrFrame.locator('textarea').first();
    if (await firstVisibleTextarea.isVisible().catch(() => false)) {
      const parentForm = firstVisibleTextarea.locator('xpath=ancestor::form[1]').first();
      if ((await parentForm.count()) > 0 && (await parentForm.isVisible().catch(() => false))) {
        return parentForm;
      }
    }

    const forms = pageOrFrame.locator('form');
    const formCount = await forms.count();
    let bestForm: Locator | null = null;
    let bestScore = -1;
    for (let i = 0; i < formCount; i++) {
      const form = forms.nth(i);
      const inputs = form.locator('input, textarea, select');
      const visibleCount = await inputs
        .evaluateAll((elements: Element[]) => {
          return elements.filter((el) => {
            const style = window.getComputedStyle(el as HTMLElement);
            const visible =
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              (((el as HTMLElement).offsetWidth ?? 0) > 0 ||
                ((el as HTMLElement).offsetHeight ?? 0) > 0 ||
                style.position === 'fixed');
            return visible;
          }).length;
        })
        .catch(() => 0);
      if (visibleCount > bestScore) {
        bestScore = visibleCount;
        bestForm = form;
      }
    }
    if (bestForm && bestScore > 0) return bestForm;
  } catch (_) {}
  return null;
}

