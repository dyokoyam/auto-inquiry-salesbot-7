import { FIELD_KEYWORDS } from './fieldKeywords';

export interface FormProfile {
  name: string;
  company: string;
  department: string;
  position: string;
  email: string;
  tel: string;
  fullAddress: string;
  [key: string]: string | undefined;
}

export type ProfileFieldType = keyof typeof FIELD_KEYWORDS;

export function identifyFieldType(labelText: string): ProfileFieldType | null {
  for (const [type, keywords] of Object.entries(FIELD_KEYWORDS)) {
    if (keywords.some((keyword) => labelText.includes(keyword))) {
      return type as ProfileFieldType;
    }
  }
  return null;
}

export function getProfileValue(profile: FormProfile, fieldType: string): string {
  switch (fieldType) {
    case 'name':
      return profile.name || '';
    case 'company':
      return profile.company || '';
    case 'department':
      return profile.department || '';
    case 'position':
      return profile.position || '';
    case 'email':
      return profile.email || '';
    case 'tel':
      return profile.tel || '';
    case 'fax':
      return (profile as any).fax || '';
    case 'zip':
      return (profile as any).zip || '';
    case 'pref':
      return (profile as any).pref || '';
    case 'city':
      return (profile as any).city || '';
    case 'address':
      return (profile as any).address || '';
    case 'building':
      return (profile as any).building || '';
    case 'fullAddress':
      return profile.fullAddress || '';
    case 'url':
      return (profile as any).url || '';
    case 'subject':
      return (profile as any).subject || '';
    case 'industry':
      return (profile as any).industry || '';
    case 'member':
      return (profile as any).member || '';
    default:
      return '';
  }
}

