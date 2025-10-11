import * as fs from 'fs';

export function loadExclusionList(filePath: string): Set<string> {
  const set = new Set<string>();
  try {
    if (!fs.existsSync(filePath)) return set;
    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      if (!trimmed || trimmed.startsWith('#')) continue;
      set.add(trimmed);
    }
  } catch {
    // ignore failures
  }
  return set;
}

export function isExcluded(url: string, exclusionList: Set<string>): boolean {
  if (exclusionList.size === 0) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (exclusionList.has(host)) return true;
    for (const domain of exclusionList) {
      if (host.endsWith(`.${domain}`)) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}
