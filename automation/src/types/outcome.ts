import type { Target } from './target';

export type ReasonCode =
  | 'OK_SUCCESS_KEYWORD'
  | 'OK_NO_FORM_UI'
  | 'OK_CONFIRM_CLICKED'
  | 'SKIP_REFUSAL'
  | 'ERR_NO_FORM'
  | 'ERR_CONTACT_PAGE_NO_FORM'
  | 'ERR_NO_SUBMIT'
  | 'ERR_REQUIRED_UNFILLED'
  | 'ERR_TIMEOUT'
  | 'ERR_EXCEPTION'
  | 'ERR_UNKNOWN';

export interface ExploreResult {
  success: boolean;
  currentForm: boolean;
  contactLink: string | null;
  message?: string;
}

export interface TargetOutcome {
  target: Target;
  success: boolean;
  reason: ReasonCode;
  detail?: string;
  finalUrl?: string;
}
