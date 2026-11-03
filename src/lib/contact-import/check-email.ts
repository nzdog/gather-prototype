import { WORDS } from './types';

/**
 * [[GTC-448]] — the email check: trim, then the household form's own rule
 * (`validateEmail` in Moment1InputForm.tsx, and the same pattern the household routes use).
 * An email is stored trimmed and lower-cased; a failing one is kept that way and flagged (W1)
 * rather than dropped.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailCheck =
  | { kind: 'none' }
  | { kind: 'ok'; email: string }
  | { kind: 'bad'; email: string; problem: string };

export function checkEmail(raw: string): EmailCheck {
  const value = raw.trim();
  if (!value) return { kind: 'none' };
  const email = value.toLowerCase();
  if (!EMAIL_PATTERN.test(value)) return { kind: 'bad', email, problem: WORDS.W1 };
  return { kind: 'ok', email };
}
