import type { Page } from 'playwright';
import type { Profile as RunnerProfile } from '../types/profile';
import { AGREE_KEYWORDS, FIELD_KEYWORDS } from './fieldKeywords';
import { getProfileValue, identifyFieldType, type FormProfile } from './fieldMapper';
import { findFormDocument, type FormContext } from './formLocator';

export async function fillForm(page: Page, profile: RunnerProfile): Promise<void> {
  const normalizedProfile: FormProfile = {
    name: profile.name ?? '',
    company: profile.company ?? '',
    department: profile.department ?? '',
    position: profile.position ?? '',
    email: profile.email ?? '',
    tel: profile.tel ?? '',
    fullAddress: profile.fullAddress ?? '',
    message: profile.message ?? '',
  };

  for (const [key, value] of Object.entries(profile)) {
    if (!(key in normalizedProfile) && typeof value === 'string') {
      normalizedProfile[key] = value;
    }
  }

  await fillFormInternal(page, normalizedProfile);
}

async function fillFormInternal(page: Page, profile: FormProfile): Promise<void> {
  const formDocument = await findFormDocument(page);
  if (!formDocument) {
    console.warn('問い合わせフォームが見つかりませんでした');
    return;
  }

  await fillMessageField(formDocument, profile);
  await fillLabelledFields(formDocument, profile);
  await fillKeywordFields(formDocument, profile);
  await fillConfirmationFields(formDocument, profile);
  await handleSelects(formDocument, profile);
  await handleRadios(formDocument);
  await handleAgreeCheckboxes(formDocument);
  await handleSplitTelephone(formDocument, profile);
  await handleSplitZip(formDocument, profile);
  await fillEmptyRequiredFields(formDocument);
  await logSampledInputs(formDocument);
}

async function fillMessageField(formDocument: FormContext, profile: FormProfile): Promise<void> {
  const textareaSelectors = [
    'textarea[name*="message"]',
    'textarea[name*="inquiry"]',
    'textarea[name*="comment"]',
    'textarea',
  ];

  for (const selector of textareaSelectors) {
    const element = formDocument.locator(selector).first();
    if (await element.isVisible()) {
      await element.fill(profile.message || 'お問い合わせ内容です。');
      try {
        await (element as any).dispatchEvent('input');
        await (element as any).dispatchEvent('change');
        await (element as any).blur();
      } catch (_) {}
      break;
    }
  }
}

async function fillLabelledFields(formDocument: FormContext, profile: FormProfile): Promise<void> {
  const labels = formDocument.locator('label');
  const labelCount = await labels.count();

  for (let i = 0; i < labelCount; i++) {
    const label = labels.nth(i);
    const labelText = await label.textContent();
    if (!labelText) continue;

    const fieldType = identifyFieldType(labelText);
    if (!fieldType) continue;

    const input = label.locator('+ input, + textarea, + select').first();
    if (!(await input.isVisible())) continue;

    const value = getProfileValue(profile, fieldType);
    if (!value) continue;

    const tagName = await input.evaluate((el: Element) => el.tagName);
    if (tagName !== 'SELECT') {
      const current = (await (input as any).inputValue().catch(() => '')) || '';
      if (current.trim().length > 0) continue;

      const nameAttr = (await input.getAttribute('name')) || '';
      if (fieldType === 'fullAddress' && /mail/i.test(nameAttr)) continue;
    }

    if (tagName === 'SELECT') {
      try {
        await (input as any).selectOption({ label: value });
      } catch {
        try {
          await (input as any).selectOption({ value });
        } catch (_) {}
      }
    } else {
      await input.fill(value);
    }
    try {
      await (input as any).dispatchEvent('input');
      await (input as any).dispatchEvent('change');
      await (input as any).blur();
    } catch (_) {}
  }
}

async function fillKeywordFields(formDocument: FormContext, profile: FormProfile): Promise<void> {
  for (const [fieldType, keywords] of Object.entries(FIELD_KEYWORDS)) {
    for (const keyword of keywords) {
      const selector = `input[name*="${keyword}"], textarea[name*="${keyword}"], select[name*="${keyword}"]`;
      const element = formDocument.locator(selector).first();
      if (!(await element.isVisible())) continue;

      const value = getProfileValue(profile, fieldType);
      if (!value) continue;

      const tagName = await element.evaluate((el: Element) => el.tagName);
      if (tagName !== 'SELECT') {
        const current = (await (element as any).inputValue().catch(() => '')) || '';
        if (current.trim().length > 0) continue;

        const nameAttr = (await element.getAttribute('name')) || '';
        if (fieldType === 'fullAddress' && /mail/i.test(nameAttr)) continue;
      }

      if (tagName === 'SELECT') {
        try {
          await (element as any).selectOption({ label: value });
        } catch {
          try {
            await (element as any).selectOption({ value });
          } catch (_) {}
        }
      } else {
        await element.fill(value);
      }
      try {
        await (element as any).dispatchEvent('input');
        await (element as any).dispatchEvent('change');
        await (element as any).blur();
      } catch (_) {}
    }
  }
}

async function fillConfirmationFields(formDocument: FormContext, profile: FormProfile): Promise<void> {
  const confirmEmailSelectors = [
    'input[name*="confirm"][type="email"]',
    'input[name*="email-confirm"]',
    'input[name*="mail-confirm"]',
    'input[name*="メール確認"]',
  ];
  for (const sel of confirmEmailSelectors) {
    const el = formDocument.locator(sel).first();
    if (await el.isVisible()) {
      try {
        await el.fill(profile.email || '');
      } catch (_) {}
    }
  }

  const confirmTelSelectors = [
    'input[name*="tel-confirm"]',
    'input[name*="phone-confirm"]',
    'input[name*="電話確認"]',
  ];
  for (const sel of confirmTelSelectors) {
    const el = formDocument.locator(sel).first();
    if (await el.isVisible()) {
      try {
        await el.fill(profile.tel || '');
      } catch (_) {}
    }
  }
}

async function handleSelects(formDocument: FormContext, profile: FormProfile): Promise<void> {
  const selects = formDocument.locator('select');
  const selectCount = await selects.count();
  for (let i = 0; i < selectCount; i++) {
    const select = selects.nth(i);
    if (!(await select.isVisible())) continue;
    try {
      const options = select.locator('option');
      const optionCount = await options.count();
      let selected = false;
      const pref = (profile as any).pref;
      if (pref) {
        for (let j = 0; j < optionCount; j++) {
          const text = (await options.nth(j).textContent()) || '';
          if (text.trim() === pref) {
            await select.selectOption({ index: j });
            selected = true;
            break;
          }
        }
      }
      if (!selected && optionCount > 0) {
        await select.selectOption({ index: optionCount - 1 });
      }
      try {
        await (select as any).dispatchEvent('input');
        await (select as any).dispatchEvent('change');
        await (select as any).blur();
      } catch (_) {}
    } catch (_) {}
  }
}

async function handleRadios(formDocument: FormContext): Promise<void> {
  const radios = formDocument.locator('input[type="radio"]');
  const radioCount = await radios.count();
  const pickedRadioNames = new Set<string>();
  for (let i = 0; i < radioCount; i++) {
    const radio = radios.nth(i);
    if (!(await radio.isVisible())) continue;
    const name = (await radio.getAttribute('name')) || '';
    if (pickedRadioNames.has(name)) continue;
    try {
      await radio.check({ timeout: 1000 });
    } catch (_) {}
    pickedRadioNames.add(name);
  }
}

async function handleAgreeCheckboxes(formDocument: FormContext): Promise<void> {
  const checkboxes = formDocument.locator('input[type="checkbox"]');
  const checkboxCount = await checkboxes.count();
  for (let i = 0; i < checkboxCount; i++) {
    const checkbox = checkboxes.nth(i);
    if (!(await checkbox.isVisible())) continue;

    try {
      const id = await checkbox.getAttribute('id');
      let labelText = '';
      if (id) {
        const label = formDocument.locator(`label[for="${id}"]`).first();
        if (await label.isVisible()) {
          labelText = (await label.textContent()) || '';
        }
      }
      if (!labelText) {
        const parentLabel = checkbox.locator('xpath=ancestor::label[1]').first();
        if (await parentLabel.isVisible()) {
          labelText = (await parentLabel.textContent()) || '';
        }
      }
      if (AGREE_KEYWORDS.some((k) => labelText.includes(k))) {
        try {
          await checkbox.check({ timeout: 1000 });
        } catch (_) {}
      }
    } catch (_) {}
  }
}

async function handleSplitTelephone(formDocument: FormContext, profile: FormProfile): Promise<void> {
  try {
    const telCandidates = formDocument.locator(
      'input[type="tel"][name*="tel"], input[type="text"][name*="tel"], input[type="tel"][name*="電話"], input[type="text"][name*="電話"]',
    );
    const telCount = await telCandidates.count();
    if (telCount >= 2 && telCount <= 4 && (profile as any).tel) {
      const digits = ((profile as any).tel as string).replace(/[^0-9]/g, '');
      const guessParts = ((profile as any).tel as string).split(/[^0-9]+/).filter((p: string) => p.length > 0);
      const parts = guessParts.length >= 2 ? guessParts : [digits];
      for (let i = 0; i < telCount; i++) {
        const el = telCandidates.nth(i);
        const toFill = parts[i] || '';
        if (!toFill) continue;
        try {
          await el.fill(toFill);
        } catch (_) {}
      }
    }
  } catch (_) {}
}

async function handleSplitZip(formDocument: FormContext, profile: FormProfile): Promise<void> {
  try {
    const zipCandidates = formDocument.locator('input[type="text"][name*="zip"], input[type="text"][name*="郵便"]');
    const zipCount = await zipCandidates.count();
    if (zipCount >= 2 && (profile as any).zip) {
      const parts = ((profile as any).zip as string).split(/[^0-9]+/).filter((p: string) => p.length > 0);
      for (let i = 0; i < zipCount; i++) {
        const el = zipCandidates.nth(i);
        const toFill = parts[i] || '';
        if (!toFill) continue;
        try {
          await el.fill(toFill);
        } catch (_) {}
      }
    }
  } catch (_) {}
}

async function fillEmptyRequiredFields(formDocument: FormContext): Promise<void> {
  const textInputs = formDocument.locator('input[type="text"], input:not([type]), textarea');
  const textCount = await textInputs.count();
  for (let i = 0; i < textCount; i++) {
    const input = textInputs.nth(i);
    if (!(await input.isVisible())) continue;
    const current = await input.inputValue();
    if (current.trim() !== '') continue;
    try {
      await input.fill('—');
    } catch (_) {}
    try {
      await (input as any).dispatchEvent('input');
      await (input as any).dispatchEvent('change');
      await (input as any).blur();
    } catch (_) {}
  }
}

async function logSampledInputs(formDocument: FormContext): Promise<void> {
  const inputElements = formDocument.locator('input, textarea');
  const inputCount = await inputElements.count();

  for (let i = 0; i < Math.min(inputCount, 10); i++) {
    const element = inputElements.nth(i);
    if (!(await element.isVisible())) continue;

    const tagName = await element.evaluate((el: Element) => el.tagName);
    const type = (await element.getAttribute('type')) || 'text';
    const name = (await element.getAttribute('name')) || '';
    const value = await element.inputValue();

    if (value.trim() === '') continue;

  }
}
