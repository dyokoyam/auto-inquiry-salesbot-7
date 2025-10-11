import type { Locator, Page } from 'playwright';
import { EXCLUDE_SUBMIT_KEYWORDS, SUBMIT_KEYWORDS } from './fieldKeywords';
import { findActiveForm, findFormDocument } from './formLocator';

export async function clickSubmitButton(page: Page): Promise<void> {
  const formDocument = await findFormDocument(page);
  if (!formDocument) {
    console.warn('フォームドキュメントが見つからないため送信ボタンを探せません');
    return;
  }

  const activeForm = await findActiveForm(formDocument);
  const scope: { locator(selector: string): Locator; evaluate?: any } = (activeForm ?? formDocument) as any;

  const textKeywords = [...SUBMIT_KEYWORDS.text];
  const confirmFirst = ['確認', '確 認', '確　認'];
  const sendWords = textKeywords.filter((t) => !confirmFirst.includes(t));
  const ordered = [...confirmFirst, ...sendWords];

  for (const text of ordered) {
    const elements = scope.locator('button, input[type="button"], span, a').filter({ hasText: text });
    const count = await elements.count();
    for (let i = 0; i < count; i++) {
      const el = elements.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      try {
        await (el as any).scrollIntoViewIfNeeded?.();
      } catch (_) {}
      try {
        await el.click({ timeout: 10_000 });
      } catch {
        try {
          await el.click({ timeout: 10_000, force: true });
        } catch {
          continue;
        }
      }
      return;
    }
  }

  const valueSelectors = [
    ...SUBMIT_KEYWORDS.value.map((v) => `input[value*="${v}"]`),
    ...SUBMIT_KEYWORDS.alt.map((v) => `input[alt*="${v}"]`),
  ];
  for (const selector of valueSelectors) {
    const els = scope.locator(selector);
    const count = await els.count();
    for (let i = 0; i < count; i++) {
      const el = els.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const disabled = await el.getAttribute('disabled');
      if (disabled !== null) continue;
      try {
        await (el as any).scrollIntoViewIfNeeded?.();
      } catch (_) {}
      try {
        await el.click({ timeout: 10_000 });
      } catch {
        try {
          await el.click({ timeout: 10_000, force: true });
        } catch {
          continue;
        }
      }
      return;
    }
  }

  const anchorSelectors = ['a[role="button"]', 'a[href*="confirm"]', 'a[href*="send"]', 'a[href*="submit"]'];
  for (const selector of anchorSelectors) {
    const els = scope.locator(selector);
    const count = await els.count();
    for (let i = 0; i < count; i++) {
      const el = els.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const text = (await el.textContent())?.trim() || '';
      if (EXCLUDE_SUBMIT_KEYWORDS.some((k) => text.includes(k))) continue;
      try {
        await (el as any).scrollIntoViewIfNeeded?.();
      } catch (_) {}
      try {
        await el.click({ timeout: 10_000 });
      } catch {
        try {
          await el.click({ timeout: 10_000, force: true });
        } catch {
          continue;
        }
      }
      return;
    }
  }

  const genericSelectors = ['input[type="submit"]', 'button[type="submit"]', 'input[type="image"]'];
  for (const selector of genericSelectors) {
    const els = scope.locator(selector);
    const count = await els.count();
    for (let i = 0; i < count; i++) {
      const el = els.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const disabled = await el.getAttribute('disabled');
      if (disabled !== null) continue;
      const text =
        (await el.textContent())?.trim() ||
        (await el.getAttribute('value')) ||
        (await el.getAttribute('alt')) ||
        '';
      if (EXCLUDE_SUBMIT_KEYWORDS.some((k) => (text || '').includes(k))) continue;
      try {
        await (el as any).scrollIntoViewIfNeeded?.();
      } catch (_) {}
      try {
        await el.click({ timeout: 10_000 });
      } catch {
        try {
          await el.click({ timeout: 10_000, force: true });
        } catch {
          continue;
        }
      }
      return;
    }
  }

  try {
    const submitted = await (scope as any).evaluate((node: Element) => {
      const form = node.closest ? node.closest('form') : null;
      if (form && typeof (form as HTMLFormElement).submit === 'function') {
        (form as HTMLFormElement).submit();
        return true;
      }
      const forms = Array.from(document.getElementsByTagName('form')) as HTMLFormElement[];
      if (forms.length > 0) {
        forms[forms.length - 1].submit();
        return true;
      }
      return false;
    });
    if (submitted) {
      return;
    }
  } catch (_) {}

  console.warn('有効な送信ボタンが見つかりませんでした');
}

export async function handleConfirmationPage(page: Page): Promise<{ success: boolean; message: string }> {
  try {
    await page.waitForTimeout(1_000);

    const formDocument = await findFormDocument(page);
    const finalUrlNow = page.url();
    const successUrlPattern = /(thanks|complete|completed|done|finish|finished|sent|success|ok)/i;
    const successTextPattern =
      /(ありがとうございました|送信完了|送信しました|受付完了|受け付けました|ありがとう|complete|success|thank|done)/i;
    const failurePattern = /(エラー|失敗|error|invalid|必須|未入力|もう一度|再入力|入力してください|不正)/i;
    const searchPattern = /(\/?\?s=|\/?search|[?&]s=)/i;

    if (!formDocument) {
      const content = await page.content();
      if (failurePattern.test(content) || searchPattern.test(finalUrlNow)) {
        return { success: false, message: '送信失敗を確認（エラー/検索を検知）' };
      }
      if (successTextPattern.test(content) || successUrlPattern.test(finalUrlNow)) {
        return { success: true, message: '送信成功を確認（成功キーワード/URL検知）' };
      }
      const ajaxResult = await waitForAjaxSubmissionResult(page, 12_000);
      if (ajaxResult) return ajaxResult;
      const hasFormUi =
        (await page.locator('form, textarea, input[type="submit"], button[type="submit"]').count()) > 0;
      if (!hasFormUi) {
        return { success: false, message: '確認UI不在かつ成功根拠不足（失敗扱い）' };
      }
    }

    const currentPageContent = await page.content();
    const isConfirmationPage =
      /確認(画面|ページ)?|確認へ|内容確認|最終確認/i.test(currentPageContent) && !successTextPattern.test(currentPageContent);

    if (!isConfirmationPage && formDocument) {
      const textareas = formDocument.locator('textarea');
      const textareaCount = await textareas.count();
      if (textareaCount > 0) {
        const ajaxResult = await waitForAjaxSubmissionResult(page, 12_000);
        if (ajaxResult) return ajaxResult;
        return { success: false, message: '送信後もフォームが残存（失敗の可能性）' };
      }
    }

    const submitButtons = await collectSubmitButtons(formDocument);

    if (submitButtons.length === 0) {
      const content = await page.content();
      const finalUrl = page.url();
      if (successTextPattern.test(content) || successUrlPattern.test(finalUrl)) {
        return { success: true, message: '送信成功を確認（ボタン無/成功兆候）' };
      }
      const ajaxResult = await waitForAjaxSubmissionResult(page, 12_000);
      if (ajaxResult) return ajaxResult;
      return { success: false, message: '確認ボタン不在で成功兆候なし（失敗）' };
    }

    const targetButton = submitButtons[submitButtons.length - 1];
    try {
      await (targetButton as any).scrollIntoViewIfNeeded?.();
    } catch (_) {}
    try {
      await (targetButton as any).click({ timeout: 10_000 });
    } catch {
      await (targetButton as any).click({ timeout: 10_000, force: true });
    }

    await page.waitForTimeout(5_000);

    const finalUrl = page.url();

    const finalPageContent = await page.content();
    if (failurePattern.test(finalPageContent) || searchPattern.test(finalUrl)) {
      return { success: false, message: '送信失敗を確認（エラー/検索を検知）' };
    }
    if (successTextPattern.test(finalPageContent) || successUrlPattern.test(finalUrl)) {
      return { success: true, message: '送信成功を確認（成功キーワード/URL検知）' };
    }
    const ajaxResult = await waitForAjaxSubmissionResult(page, 8_000);
    if (ajaxResult) return ajaxResult;
    return { success: false, message: '最終検証で成功根拠なし（失敗扱い）' };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `確認画面処理エラー: ${errorMessage}`,
    };
  }
}

export async function simulateHumanInput(page: Page, min = 1_000, max = 4_000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await page.waitForTimeout(delay);
}

// Retain audit helper from refactor for logging parity; optional usage by runner.
export async function auditFormInputs(
  page: Page,
  logger: { info(message: string): void; warn(message: string): void },
): Promise<void> {
  logger.info('📝 フォーム入力状態を検証中...');
  const inputs = await page.locator('input, textarea, select').evaluateAll((elements) =>
    elements.map((element) => {
      const html = element as HTMLInputElement;
      const tagName = html.tagName;
      const type = html.type || 'text';
      const name = html.name || '';
      const value = html.value || (html as unknown as HTMLTextAreaElement).value || '';
      const visible = (element as HTMLElement).offsetParent !== null;
      const disabled = html.disabled;
      const required = html.required;
      return { tagName, type, name, value, visible, disabled, required };
    }),
  );

  const unfilledRequired = inputs.filter(
    (input) =>
      input.visible &&
      !input.disabled &&
      input.required &&
      (input.type === 'text' || input.type === 'email' || input.type === 'tel' || input.tagName === 'TEXTAREA') &&
      input.value.trim() === '',
  );

  if (unfilledRequired.length > 0) {
    logger.warn(`⚠️ 未入力必須フィールドが ${unfilledRequired.length} 個あります`);
    for (const field of unfilledRequired) {
      logger.warn(`  - ${field.tagName} (${field.type}): ${field.name}`);
    }
  }
}

async function collectSubmitButtons(formDocument: Awaited<ReturnType<typeof findFormDocument>>): Promise<Locator[]> {
  if (!formDocument) return [];

  const textButtons = formDocument.locator('span, button');
  const textButtonCount = await textButtons.count();
  const textSubmitButtons: Locator[] = [];
  for (let i = 0; i < textButtonCount; i++) {
    const button = textButtons.nth(i);
    const buttonText = await button.innerText();
    if (
      buttonText &&
      (buttonText.includes('送信') ||
        buttonText.includes('送 信') ||
        buttonText.includes('送　信') ||
        buttonText.includes('はい') ||
        buttonText.includes('OK') ||
        buttonText.includes('同意する') ||
        buttonText.includes('続行'))
    ) {
      textSubmitButtons.push(button);
    }
  }

  const inputButtons = formDocument.locator('input[type="submit"], input[type="button"]');
  const inputButtonCount = await inputButtons.count();
  const inputSubmitButtons: Locator[] = [];
  for (let i = 0; i < inputButtonCount; i++) {
    const button = inputButtons.nth(i);
    const buttonValue = await button.getAttribute('value');
    if (
      buttonValue &&
      (buttonValue.includes('送信') ||
        buttonValue.includes('送 信') ||
        buttonValue.includes('送　信') ||
        buttonValue.includes('問い合わせ') ||
        buttonValue.includes('問合') ||
        buttonValue.includes('はい') ||
        buttonValue.includes('OK') ||
        buttonValue.includes('同意する') ||
        buttonValue.includes('続行'))
    ) {
      inputSubmitButtons.push(button);
    }
  }

  const imageButtons = formDocument.locator('input[type="image"]');
  const imageButtonCount = await imageButtons.count();
  const imageSubmitButtons: Locator[] = [];
  for (let i = 0; i < imageButtonCount; i++) {
    const button = imageButtons.nth(i);
    const buttonAlt = await button.getAttribute('alt');
    if (
      buttonAlt &&
      (buttonAlt.includes('送信') ||
        buttonAlt.includes('確認') ||
        buttonAlt.includes('はい') ||
        buttonAlt.includes('OK') ||
        buttonAlt.includes('同意する') ||
        buttonAlt.includes('続行'))
    ) {
      imageSubmitButtons.push(button);
    }
  }

  return [...textSubmitButtons, ...imageSubmitButtons, ...inputSubmitButtons];
}

async function waitForAjaxSubmissionResult(
  page: Page,
  timeoutMs: number,
): Promise<{ success: boolean; message: string } | null> {
  const successSelectors = [
    '.wpcf7 form.sent',
    '.wpcf7-mail-sent-ok',
    '.wpcf7 .wpcf7-response-output.wpcf7-mail-sent-ok',
    '.wpforms-confirmation-container',
    '.wpforms-confirmation-scroll',
    '.nf-response-msg',
    '.ninja-forms-success-msg',
    '.nf-form-cont .nf-response-msg',
  ];
  const failureSelectors = [
    '.wpcf7 form.invalid',
    '.wpcf7-not-valid',
    '.wpcf7 .wpcf7-response-output.wpcf7-validation-errors',
    '.wpforms-error',
    '.wpforms-error-container',
    '.nf-error',
    '.ninja-forms-error-msg',
  ];
  const successTextPattern =
    /(ありがとうございました|送信完了|送信しました|受付完了|受け付けました|ありがとう|complete|success|thank|done)/i;
  const failureTextPattern =
    /(エラー|失敗|error|invalid|必須|未入力|もう一度|再入力|入力してください|不正)/i;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const foundSuccess = await page.evaluate(({ sels, re }: { sels: string[]; re: string }) => {
        const success = sels.some((sel) => document.querySelector(sel));
        if (success) return true;
        const txt = document.body?.innerText || '';
        return new RegExp(re, 'i').test(txt);
      }, { sels: successSelectors, re: successTextPattern.source });
      if (foundSuccess) {
        return { success: true, message: 'AJAX成功UIを検知' };
      }
      const foundFailure = await page.evaluate(({ sels, re }: { sels: string[]; re: string }) => {
        const failure = sels.some((sel) => document.querySelector(sel));
        if (failure) return true;
        const txt = document.body?.innerText || '';
        return new RegExp(re, 'i').test(txt);
      }, { sels: failureSelectors, re: failureTextPattern.source });
      if (foundFailure) {
        return { success: false, message: 'AJAX失敗UIを検知' };
      }
    } catch {}
    await page.waitForTimeout(300);
  }
  return null;
}
