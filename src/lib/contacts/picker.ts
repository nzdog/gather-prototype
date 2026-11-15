/**
 * [[GTC-460]] Stage 3, step 3b — THE PHONE'S OWN CONTACT PICKER (ruling 158).
 *
 * Chrome on an Android phone can show the phone's own contact chooser to a page. It is not there on
 * an iPhone or a laptop, and it works only in a top-level secure page, inside a tap. So:
 *   - `pickerAvailable` says whether it is there, and never throws. Where it is not, the page draws
 *     nothing about it at all: no button, no greyed button, no sentence.
 *   - `pickPeople` asks for names, emails and numbers, several at once. The ask is made at once, in
 *     the same turn as the tap: nothing is waited for before it, or the browser refuses it.
 *   - It ends one of three ways: people picked; cancelled (an empty list, which says nothing); or
 *     failed (a refusal, an error of any kind, or something that is not a list).
 *
 * THE PICKER'S USE ON A REAL ANDROID PHONE IS UNPROVEN. Everything here is proved against a pretend
 * picker (`tests/contacts-picker-test.ts`); nothing has touched a real phone, its own permission
 * sheet, or the data a real phone returns (ruling 158).
 */
import type { ReadResult } from '@/lib/contact-import/types';
import { readPicked } from '@/lib/contacts/read-picked';

export const PICK_PROPERTIES = ['name', 'email', 'tel'];
export const PICK_OPTIONS = { multiple: true };

/** The parts of the browser's window this needs. */
export type PickerEnv = {
  navigator: {
    contacts: { select: (properties: string[], options: { multiple: boolean }) => unknown };
  };
};

export type PickEnd =
  | { kind: 'picked'; read: ReadResult }
  | { kind: 'cancelled' }
  | { kind: 'failed' };

/** There only when the browser has a contacts chooser, its manager, and the page is secure. */
export function pickerAvailable(env: unknown): boolean {
  try {
    const e = env as {
      navigator?: { contacts?: { select?: unknown } } | null;
      ContactsManager?: unknown;
      isSecureContext?: unknown;
    } | null;
    const select = e?.navigator?.contacts?.select;
    return typeof select === 'function' && !!e?.ContactsManager && e.isSecureContext === true;
  } catch {
    return false;
  }
}

/** Asks the phone for contacts. Call it inside the tap's handler, with no wait before it. */
export async function pickPeople(env: PickerEnv, newId?: () => string): Promise<PickEnd> {
  let pending: unknown;
  try {
    pending = env.navigator.contacts.select(PICK_PROPERTIES, PICK_OPTIONS);
  } catch {
    return { kind: 'failed' };
  }
  let results: unknown;
  try {
    results = await pending;
  } catch {
    return { kind: 'failed' };
  }
  if (!Array.isArray(results)) return { kind: 'failed' };
  if (results.length === 0) return { kind: 'cancelled' };
  return { kind: 'picked', read: readPicked(results, newId) };
}
