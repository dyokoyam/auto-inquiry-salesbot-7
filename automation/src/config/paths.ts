import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');

function ensureDirectoryExists(targetPath: string): void {
  try {
    fs.mkdirSync(targetPath, { recursive: true });
  } catch {
    // ignore mkdir races
  }
}

export function getProjectRoot(): string {
  return PROJECT_ROOT;
}

export function getDataDirectory(): string {
  return DATA_DIR;
}

export function getLogsDirectory(): string {
  ensureDirectoryExists(LOGS_DIR);
  return LOGS_DIR;
}

export function resolveDataPath(relative: string): string {
  return path.join(DATA_DIR, relative);
}

export function resolveLogPath(filename: string): string {
  const logsDir = getLogsDirectory();
  return path.join(logsDir, filename);
}
