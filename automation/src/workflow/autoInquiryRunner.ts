import * as path from 'path';
import { lookup } from 'dns/promises';
import type { BrowserContext, Page } from 'playwright';
import type { AutomationConfig } from '../config';
import { createBrowserBundle } from '../browser/playwrightFactory';
import { gotoAndWait, waitForPostSubmitIdle } from '../browser/navigation';
import { collectContactLinks, exploreForm, REFUSAL_KEYWORDS } from '../forms/formExplorer';
import { fillForm } from '../forms/formFiller';
import { findFormDocument } from '../forms/formLocator';
import { detectAndSolveCaptchaImage, handleRecaptchaFree } from '../forms/captcha';
import { clickSubmitButton, handleConfirmationPage, simulateHumanInput } from '../forms/submission';
import { loadProfiles } from '../data/profilesRepository';
import { isExcluded, loadExclusionList } from '../data/exclusionList';
import { resolveBatch } from './batchScheduler';
import type { Logger } from '../logging/logger';
import type { Profile } from '../types/profile';
import type { Target } from '../types/target';
import type { TargetOutcome, ReasonCode } from '../types/outcome';

const dnsCache = new Map<string, boolean>();

class TargetTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Target processing timed out after ${timeoutMs} ms`);
    this.name = 'TargetTimeoutError';
  }
}

export async function runAutoInquiry(
  config: AutomationConfig,
  logger: Logger,
  logFilePath?: string,
): Promise<void> {
  logger.info('🚀 お問い合わせ送信プロセスを開始します');

  const profiles = loadProfiles(config.data.profilesJson);
  const profile = selectProfile(profiles);
  if (!profile) {
    logger.error('利用可能なプロフィールが存在しません');
    return;
  }
  const processedProfile: Profile = {
    ...profile,
    message: applyTemplate(profile.message, profile),
  };

  const exclusionList = loadExclusionList(config.data.excludeDomains);
  const batch = await resolveBatch(config.data.targetsCsv, {
    slotStart: config.slotStart,
    batchSize: config.batchSize,
    wrap: config.wrap,
  });

  if (batch.slot === null) {
    logger.warn('SLOT_START が無効なため、この実行をスキップします。');
    return;
  }

  if (batch.targets.length === 0) {
    logger.warn('対象スロットに処理すべきURLがありません。');
    return;
  }

  const targets = batch.targets.filter((target) => !isExcluded(target.url, exclusionList));
  if (targets.length === 0) {
    logger.warn('除外ドメイン適用後に対象URLが残りませんでした。');
    return;
  }

  logger.info(`📊 ターゲット数: ${targets.length}, プロフィール: ${processedProfile.name} (${processedProfile.company})`);

  const { browser, context } = await createBrowserBundle(config);
  const outcomes: TargetOutcome[] = [];

  try {
    for (const target of targets) {
      try {
        const outcome = await processTargetWithTimeout(context, target, processedProfile, config, logger);
        outcomes.push(outcome);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`💥 ターゲット処理中に例外が発生しました (${target.url}): ${message}`);
        outcomes.push({ target, success: false, reason: 'ERR_EXCEPTION', detail: message });
      }
    }
  } finally {
    await browser.close();
  }

  reportSummary(outcomes, logger, logFilePath);
}

async function processTargetWithTimeout(
  context: BrowserContext,
  target: Target,
  profile: Profile,
  config: AutomationConfig,
  logger: Logger,
): Promise<TargetOutcome> {
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(Math.min(config.waitTimeoutMs, config.targetTimeoutMs));
  page.setDefaultTimeout(Math.min(config.targetTimeoutMs, Math.max(config.waitTimeoutMs, 1_000)));

  const processingPromise = processTarget(page, target, profile, config, logger);
  let timer: NodeJS.Timeout | null = null;

  const timeoutPromise =
    config.targetTimeoutMs > 0
      ? new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            void page.close().catch(() => {});
            reject(new TargetTimeoutError(config.targetTimeoutMs));
          }, config.targetTimeoutMs);
        })
      : null;

  try {
    if (!timeoutPromise) {
      return await processingPromise;
    }
    return await Promise.race([processingPromise, timeoutPromise]);
  } catch (error) {
    if (error instanceof TargetTimeoutError) {
      logger.error(`⏱️ ターゲット処理タイムアウト (${target.url}) - ${error.timeoutMs}ms を超過`);
      return {
        target,
        success: false,
        reason: 'ERR_TIMEOUT',
        detail: `処理が ${error.timeoutMs}ms を超過しました`,
      };
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    void processingPromise.catch(() => {});
    await page.close().catch(() => {});
  }
}

async function processTarget(
  page: Page,
  target: Target,
  profile: Profile,
  config: AutomationConfig,
  logger: Logger,
): Promise<TargetOutcome> {
  logger.info(`🔄 ターゲット処理開始: ${target.url} (${target['企業名']})`);

  try {
    const dnsTimeoutMs = Math.min(10_000, Math.max(3_000, Math.floor(config.waitTimeoutMs * 0.75)));
    if (!(await ensureDnsResolvable(target.url, logger, dnsTimeoutMs))) {
      logger.warn(`🌐 DNS 解決に失敗したためスキップ: ${target.url}`);
      return { target, success: false, reason: 'ERR_EXCEPTION', detail: 'DNS resolution failed' };
    }

    await navigateWithRetry(page, target.url, config, logger);

    const exploreResult = await exploreForm(page);
    if (!exploreResult.success) {
      logger.warn(`❌ フォーム探索失敗: ${target.url} - ${exploreResult.message ?? 'unknown'}`);
      return { target, success: false, reason: 'ERR_NO_FORM', detail: exploreResult.message };
    }

    const pageContent = await page.content();
    if (containsRefusalKeyword(pageContent)) {
      logger.warn(`🚫 お断りキーワード検出のためスキップ: ${target.url}`);
      return { target, success: false, reason: 'SKIP_REFUSAL' };
    }

    if (!exploreResult.currentForm && exploreResult.contactLink) {
      const navigated = await navigateToContactPage(page, exploreResult.contactLink, target, config, logger);
      if (!navigated) {
        return { target, success: false, reason: 'ERR_CONTACT_PAGE_NO_FORM', detail: exploreResult.contactLink ?? '' };
      }
    }

    await disableBlockingDialogs(page);
    await fillForm(page, profile);
    const formContext = await findFormDocument(page);
    await detectAndSolveCaptchaImage(page, formContext, logger);
    await handleRecaptchaFree(page, logger);
    await auditFormInputs(page, logger);

    await simulateHumanInput(page);
    await clickSubmitButton(page);
    await waitForPostSubmitIdle(page, 10_000);
    await page.waitForTimeout(2_000);

    const confirmResult = await handleConfirmationPage(page);
    if (confirmResult.success) {
      logger.success(`✅ 送信成功: ${target.url} (${target['企業名']}) - ${confirmResult.message}`);
      return {
        target,
        success: true,
        reason: /成功|complete|thank|完了|受け付け/i.test(confirmResult.message) ? 'OK_SUCCESS_KEYWORD' : 'OK_CONFIRM_CLICKED',
        detail: confirmResult.message,
        finalUrl: page.url(),
      };
    }

    logger.warn(`❗ 送信失敗: ${target.url} (${target['企業名']}) - ${confirmResult.message}`);
    const reason: ReasonCode = /未入力|必須|required/i.test(confirmResult.message) ? 'ERR_REQUIRED_UNFILLED' : 'ERR_UNKNOWN';
    return {
      target,
      success: false,
      reason,
      detail: confirmResult.message,
      finalUrl: page.url(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isPageClosedError(message)) {
      logger.error(`💥 ターゲット処理エラー (${target.url}): ${message}`);
    }
    return { target, success: false, reason: 'ERR_EXCEPTION', detail: message };
  }
}

async function navigateToContactPage(
  page: Page,
  contactUrl: string,
  target: Target,
  config: AutomationConfig,
  logger: Logger,
): Promise<boolean> {
  logger.info(`🔗 コンタクトリンクへ遷移: ${contactUrl}`);
  try {
    await navigateWithRetry(page, contactUrl, config, logger);
  } catch (error) {
    logger.warn(
      `⚠️ コンタクトリンク遷移中にエラーが発生しました (${contactUrl}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }

  let result = await exploreForm(page);
  if (result.success && result.currentForm) return true;

  const currentUrl = page.url().replace(/\/$/, '');
  const candidates = (await collectContactLinks(page))
    .filter((href) => href.replace(/\/$/, '') !== currentUrl)
    .sort((a, b) => {
      try {
        const urlA = new URL(a);
        const urlB = new URL(b);
        const base = new URL(currentUrl);
        const sameOriginA = urlA.origin === base.origin ? 1 : 0;
        const sameOriginB = urlB.origin === base.origin ? 1 : 0;
        if (sameOriginA !== sameOriginB) return sameOriginB - sameOriginA;
        return urlB.pathname.length - urlA.pathname.length;
      } catch {
        return 0;
      }
    })
    .slice(0, 5);

  for (const href of candidates) {
    logger.info(`🔁 派生コンタクトリンク: ${href}`);
    try {
      await navigateWithRetry(page, href, config, logger);
    } catch (error) {
      logger.warn(
        `⚠️ 派生コンタクトリンク遷移に失敗しました (${href}): ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    result = await exploreForm(page);
    if (result.success && result.currentForm) {
      return true;
    }
  }

  logger.warn(`❌ コンタクトページでフォームが見つかりませんでした: ${target.url}`);
  return false;
}

async function disableBlockingDialogs(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.alert = () => undefined;
    window.confirm = () => true;
    window.prompt = () => null;
  });
}

function containsRefusalKeyword(content: string): boolean {
  return REFUSAL_KEYWORDS.some((keyword) => content.includes(keyword));
}

function isPageClosedError(message: string): boolean {
  return /Target closed|Execution context was destroyed|Navigation failed because page was closed|Page closed/i.test(message);
}

async function auditFormInputs(page: Page, logger: Logger): Promise<void> {
  logger.info('📝 フォーム入力状態を検証中...');
  const inputs = await page.locator('input, textarea, select').evaluateAll((elements) =>
    elements.map((element) => {
      const html = element as HTMLInputElement;
      const tagName = html.tagName;
      const type = html.type || 'text';
      const value = html.value || (html as unknown as HTMLTextAreaElement).value || '';
      const visible = (element as HTMLElement).offsetParent !== null;
      const disabled = html.disabled;
      const required = html.required;
      return {
        tagName,
        type,
        name: html.name || '',
        value,
        visible,
        disabled,
        required,
      };
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
    logger.warn(`⚠️ 未入力の必須フィールドが ${unfilledRequired.length} 個あります`);
    for (const field of unfilledRequired) {
      logger.warn(`  - ${field.tagName} (${field.type}): ${field.name}`);
    }
  }

  const submitButtons = await page
    .locator('input[type="submit"], button[type="submit"], button, input[type="image"]')
    .evaluateAll((buttons) =>
      buttons.map((element) => {
        const html = element as HTMLInputElement;
        const text = html.textContent?.trim() || html.value || '';
        const visible = (element as HTMLElement).offsetParent !== null;
        const disabled = html.disabled;
        return { text, visible, disabled };
      }),
    );

  const enabledButtons = submitButtons.filter((btn) => btn.visible && !btn.disabled);
  logger.info(`🖱️ 有効な送信ボタン数: ${enabledButtons.length}`);
}

function selectProfile(profiles: Profile[]): Profile | null {
  return profiles[0] ?? null;
}

function applyTemplate(message: string, profile: Profile): string {
  let result = message;
  const replacements: Record<string, string> = {
    '{{name}}': profile.name ?? '',
    '{{company}}': profile.company ?? '',
    '{{department}}': profile.department ?? '',
    '{{position}}': profile.position ?? '',
    '{{email}}': profile.email ?? '',
    '{{tel}}': profile.tel ?? '',
    '{{fullAddress}}': profile.fullAddress ?? '',
  };

  for (const [tag, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(tag, 'g'), value);
  }
  return result;
}

function reportSummary(outcomes: TargetOutcome[], logger: Logger, logFilePath?: string): void {
  logger.info('📦 処理サマリー');
  const successCount = outcomes.filter((outcome) => outcome.success).length;
  logger.info(`✅ 成功: ${successCount} / ${outcomes.length}`);
  for (const outcome of outcomes) {
    logger.log(
      `- [${outcome.success ? 'OK' : 'NG'}] ${outcome.target.url} (${outcome.target['企業名']}) reason=${outcome.reason}` +
        (outcome.finalUrl ? ` final=${outcome.finalUrl}` : '') +
        (outcome.detail ? ` detail=${outcome.detail}` : ''),
    );
  }

  if (logFilePath) {
    const relativePath = path.relative(process.cwd(), logFilePath);
    logger.info(`🗂️ ログファイル: ${relativePath}`);
  }
}

async function ensureDnsResolvable(url: string, logger: Logger, timeoutMs: number): Promise<boolean> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return true;
  }
  if (!hostname) return true;
  if (dnsCache.has(hostname)) {
    return dnsCache.get(hostname)!;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(Object.assign(new Error('DNS lookup timed out'), { code: 'DNS_TIMEOUT' }));
      }, timeoutMs);
      lookup(hostname)
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
    dnsCache.set(hostname, true);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { code?: string };
    if (err && (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN')) {
      dnsCache.set(hostname, false);
      logger.warn(`🌐 DNS 解決に失敗しました (host=${hostname}, code=${err.code})`);
      return false;
    }
    if (err && err.code === 'DNS_TIMEOUT') {
      dnsCache.set(hostname, false);
      logger.warn(`🌐 DNS 解決がタイムアウトしました (host=${hostname}, timeout=${timeoutMs}ms)`);
      return false;
    }
    logger.warn(`🌐 DNS 解決中にエラーが発生しましたが続行します (host=${hostname}, message=${err?.message ?? error})`);
    return true;
  }
}

async function navigateWithRetry(page: Page, url: string, config: AutomationConfig, logger: Logger): Promise<void> {
  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await gotoAndWait(page, url, config.waitTimeoutMs, config.pageLoadDelayMs);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (isNavigationInterrupted(message) || isTransientNetworkError(message)) {
        await cleanNavigationState(page);
        if (attempt < maxAttempts) {
          logger.warn(`⏳ ナビゲーション競合を検出したため再試行します (${url})`);
          await page.waitForTimeout(500);
          continue;
        }
      }
      throw error;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(String(lastError));
}

async function cleanNavigationState(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      try {
        window.stop();
      } catch {
        // ignore
      }
    })
    .catch(() => {});
  await page.waitForTimeout(200).catch(() => {});
}

function isNavigationInterrupted(message: string): boolean {
  return /is interrupted by another navigation/i.test(message);
}

function isTransientNetworkError(message: string): boolean {
  return /ERR_NAME_NOT_RESOLVED|chrome-error:\/\/chromewebdata/i.test(message);
}
