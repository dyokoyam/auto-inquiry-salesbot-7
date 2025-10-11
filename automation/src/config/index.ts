import { resolveDataPath, resolveLogPath, getLogsDirectory } from './paths';

export interface DataConfig {
  directory: string;
  targetsCsv: string;
  profilesJson: string;
  excludeDomains: string;
}

export interface AutomationConfig {
  slotStart: string;
  batchSize: number;
  wrap: boolean;
  headless: boolean;
  userAgent: string;
  locale: string;
  timezone: string;
  waitTimeoutMs: number;
  pageLoadDelayMs: number;
  targetTimeoutMs: number;
  data: DataConfig;
  logsDirectory: string;
}

const DEFAULT_CONFIG: Omit<AutomationConfig, 'data' | 'logsDirectory'> = {
  slotStart: '2025-01-01T00:00:00Z',
  batchSize: 500,
  wrap: true,
  headless: true,
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'ja-JP',
  timezone: 'Asia/Tokyo',
  waitTimeoutMs: 15000,
  pageLoadDelayMs: 1000,
  targetTimeoutMs: 90_000,
};

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (/^(1|true|yes|on)$/i.test(raw)) return true;
  if (/^(0|false|no|off)$/i.test(raw)) return false;
  return fallback;
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readStringEnv(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim().length > 0 ? raw : fallback;
}

export function loadConfig(): AutomationConfig {
  const slotStart = readStringEnv('AUTO_INQUIRY_SLOT_START', DEFAULT_CONFIG.slotStart);
  const batchSize = Math.max(1, readNumberEnv('AUTO_INQUIRY_BATCH_SIZE', DEFAULT_CONFIG.batchSize));
  const wrap = readBooleanEnv('AUTO_INQUIRY_WRAP', DEFAULT_CONFIG.wrap);
  const headless = readBooleanEnv('AUTO_INQUIRY_HEADLESS', DEFAULT_CONFIG.headless);
  const userAgent = readStringEnv('AUTO_INQUIRY_USER_AGENT', DEFAULT_CONFIG.userAgent);
  const locale = readStringEnv('AUTO_INQUIRY_LOCALE', DEFAULT_CONFIG.locale);
  const timezone = readStringEnv('AUTO_INQUIRY_TIMEZONE', DEFAULT_CONFIG.timezone);
  const waitTimeoutMs = Math.max(1000, readNumberEnv('AUTO_INQUIRY_WAIT_TIMEOUT_MS', DEFAULT_CONFIG.waitTimeoutMs));
  const pageLoadDelayMs = Math.max(0, readNumberEnv('AUTO_INQUIRY_PAGE_LOAD_DELAY_MS', DEFAULT_CONFIG.pageLoadDelayMs));
  const targetTimeoutMs = Math.max(5_000, readNumberEnv('AUTO_INQUIRY_TARGET_TIMEOUT_MS', DEFAULT_CONFIG.targetTimeoutMs));

  const dataDirectory = resolveDataPath('.');

  return {
    slotStart,
    batchSize,
    wrap,
    headless,
    userAgent,
    locale,
    timezone,
    waitTimeoutMs,
    pageLoadDelayMs,
    targetTimeoutMs,
    data: {
      directory: dataDirectory,
      targetsCsv: resolveDataPath('targets.csv'),
      profilesJson: resolveDataPath('profiles.json'),
      excludeDomains: resolveDataPath('exclude-domains.txt'),
    },
    logsDirectory: getLogsDirectory(),
  };
}

export const CONFIG = loadConfig();

export function createLogFilePath(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolveLogPath(`run-${timestamp}.log`);
}
