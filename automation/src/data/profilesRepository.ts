import * as fs from 'fs';
import type { Profile } from '../types/profile';

export function loadProfiles(filePath: string): Profile[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error(`profiles.json must contain an array but got ${typeof data}`);
  }
  return data.map((entry, index) => normaliseProfile(entry, index));
}

function normaliseProfile(entry: any, index: number): Profile {
  if (typeof entry !== 'object' || entry === null) {
    throw new Error(`Profile at index ${index} must be an object`);
  }
  const name = String(entry.name ?? '').trim();
  const company = String(entry.company ?? '').trim();
  const email = String(entry.email ?? '').trim();
  const message = String(entry.message ?? '').trim();
  if (!name || !company || !email || !message) {
    throw new Error(`Profile at index ${index} is missing required fields`);
  }

  const profile: Profile = {
    name,
    company,
    email,
    message,
  };

  const optionalKeys: Array<keyof Profile> = [
    'department',
    'position',
    'tel',
    'fullAddress',
  ];

  for (const key of optionalKeys) {
    const value = entry[key];
    if (typeof value === 'string') {
      profile[key] = value;
    }
  }

  for (const [key, value] of Object.entries(entry)) {
    if (typeof value === 'string' && !(key in profile)) {
      profile[key] = value;
    }
  }

  return profile;
}
