import { isInternationalNumber, normalizePhoneNumber } from '@/lib/phone';
import { WORDS } from './types';

/**
 * [[GTC-448]] — the number check: the same two calls, in the same order, as the household form's
 * `validatePhone`, on the trimmed value. phone.ts is not changed, so this is exactly as strict as
 * the form and no stricter. A number that passes is returned in the +64 form; one that does not
 * is KEPT, as typed with its spaces collapsed, and flagged (W2 overseas, W3 anything else).
 */
export type PhoneCheck =
  | { kind: 'none' }
  | { kind: 'ok'; phone: string }
  | { kind: 'overseas' | 'malformed'; phone: string; problem: string };

export function checkPhone(raw: string): PhoneCheck {
  const value = raw.trim();
  if (!value) return { kind: 'none' };
  const asTyped = value.replace(/\s+/g, ' ');
  if (isInternationalNumber(value)) {
    return { kind: 'overseas', phone: asTyped, problem: WORDS.W2 };
  }
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return { kind: 'malformed', phone: asTyped, problem: WORDS.W3 };
  return { kind: 'ok', phone: normalized };
}
