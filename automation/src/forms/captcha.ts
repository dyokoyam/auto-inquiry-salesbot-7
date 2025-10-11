import { createWorker } from 'tesseract.js';
import type { Frame, Locator, Page } from 'playwright';
import type { Logger } from '../logging/logger';
import type { FormContext } from './formLocator';

const CAPTCHA_SELECTORS = [
  'img[alt*="captcha" i]',
  'img[src*="captcha" i]',
  '.captcha img',
  '#captcha',
  '[id*="captcha" i] img',
];

const RECAPTCHA_IFRAME_SELECTOR = 'iframe[src*="recaptcha"]';
const RECAPTCHA_BADGE_SELECTOR = '.grecaptcha-badge, div[style*="grecaptcha-badge"]';
const RECAPTCHA_CHECKBOX_SELECTOR = '#recaptcha-anchor';

export async function detectAndSolveCaptchaImage(
  page: Page,
  context: FormContext | null | undefined,
  logger?: Logger,
): Promise<string | null> {
  const scope = context ?? page;
  for (const selector of CAPTCHA_SELECTORS) {
    const image = scope.locator(selector).first();
    if (!(await isVisible(image))) continue;

    logger?.info(`🧩 CAPTCHA 画像を検知: ${selector}`);
    const buffer = await image
      .screenshot({ type: 'png' })
      .catch((error: unknown) => {
        logger?.warn(`⚠️ CAPTCHA 画像の取得に失敗しました: ${String(error)}`);
        return null;
      });
    if (!buffer) continue;

    const solved = await solveCaptchaFree(Buffer.from(buffer), logger);
    if (!solved) {
      logger?.warn('⚠️ CAPTCHA OCR 解決に失敗しました');
      continue;
    }

    const input = scope.locator('input[name*="captcha" i], #captcha-input, input[id*="captcha" i]').first();
    if (!(await isVisible(input))) {
      logger?.warn('⚠️ CAPTCHA 入力フィールドが見つかりません');
      continue;
    }

    try {
      await input.fill(solved);
      logger?.info(`✅ CAPTCHA を自動入力しました: ${solved}`);
      return solved;
    } catch (error) {
      logger?.warn(`⚠️ CAPTCHA 入力に失敗しました: ${String(error)}`);
    }
  }

  return null;
}

export async function handleRecaptchaFree(page: Page, logger?: Logger): Promise<void> {
  try {
    const badge = page.locator(RECAPTCHA_BADGE_SELECTOR).first();
    const badgeVisible = await isVisible(badge);

    const iframeLocator = page.locator(RECAPTCHA_IFRAME_SELECTOR).first();
    const iframeVisible = await isVisible(iframeLocator);
    if (!iframeVisible || badgeVisible) return;

    logger?.info('🧩 reCAPTCHA を検知しました。無料オプションで処理します');

    try {
      const frame = await resolveFrame(page, iframeLocator);
      if (!frame) return;

      const checkbox = frame.locator(RECAPTCHA_CHECKBOX_SELECTOR);
      if (await isVisible(checkbox)) {
        await checkbox.click({ timeout: 5_000 }).catch(() => {});
        logger?.info('✅ reCAPTCHA チェックボックスを試行しました');
      }
    } catch (error) {
      logger?.warn(`⚠️ reCAPTCHA 操作に失敗しました: ${String(error)}`);
    }
  } catch (error) {
    logger?.warn(`⚠️ reCAPTCHA 検出処理でエラー: ${String(error)}`);
  }
}

async function solveCaptchaFree(image: Buffer, logger?: Logger): Promise<string | null> {
  try {
    const worker = await createWorker('eng');
    await worker.load();
    await worker.reinitialize('eng');
    const {
      data: { text },
    } = await worker.recognize(image);
    await worker.terminate();

    const cleaned = text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    logger?.info(`🧠 CAPTCHA OCR 結果: ${cleaned}`);
    return cleaned || null;
  } catch (error) {
    logger?.warn(`⚠️ CAPTCHA OCR でエラー: ${String(error)}`);
    return null;
  }
}

async function isVisible(locator: Locator): Promise<boolean> {
  return locator.isVisible().catch(() => false);
}

async function resolveFrame(page: Page, iframe: Locator): Promise<Frame | null> {
  const handle = await iframe.elementHandle().catch(() => null);
  if (!handle) return null;

  const frame = await handle.contentFrame();
  return frame ?? null;
}
