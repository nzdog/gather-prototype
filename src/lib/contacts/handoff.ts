/**
 * [[GTC-460]] Stage 3, step 3c — THE HAND-OFF NOTE (rulings 12, 37 and 38; plan section 5).
 *
 * On the contacts page, "Add to this household" leaves ONE note in this tab's own storage and goes back
 * to the form she left. The form reads it once, after its saved draft has been put back, and puts that
 * person in. The note holds no name, no email and no number: only the version, who, which event, which
 * form, the contact's id and the time.
 *
 *   - five minutes, and gone when the tab closes (it is per-tab storage);
 *   - used once: it is removed BEFORE it is looked at, so it is gone even when it is then ignored; if it
 *     cannot be removed it is not used;
 *   - ignored quietly (nothing is said) when it is for another person, event or form, is older than
 *     five minutes, cannot be read, or names nobody. The form adds the cases only it can know: the
 *     contact is no longer in her list, or is already in a row of this form.
 * Clear on the contacts page drops it too (the store does that).
 */
import { HANDOFF_PREFIX, type ContactsStore } from '@/lib/contacts/store';

export const HANDOFF_VERSION = 1;
export const HANDOFF_TTL_MS = 5 * 60 * 1000;

/** Which form the note is for: her own household's step, a new household, or one being changed. */
export type HandoffForm = 'host' | 'new' | `edit:${string}`;

export function handoffKey(userId: string, eventId: string): string {
  return `${HANDOFF_PREFIX}v${HANDOFF_VERSION}:${userId}:${eventId}`;
}

type Note = { userId: string; eventId: string; form: string; contactId: string; now: number };

/** Leaves the note. False when the tab's storage will not take it. */
export function writeHandoff(tab: ContactsStore | null, n: Note): boolean {
  if (!tab || !n.userId || !n.eventId || !n.contactId) return false;
  try {
    tab.setItem(
      handoffKey(n.userId, n.eventId),
      JSON.stringify({
        v: HANDOFF_VERSION,
        userId: n.userId,
        eventId: n.eventId,
        form: n.form,
        contactId: n.contactId,
        at: n.now,
      })
    );
    return true;
  } catch {
    return false;
  }
}

function removeQuietly(tab: ContactsStore, key: string): boolean {
  try {
    tab.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Takes the note, once. The contact's id if it is for this person, event and form and is fresh, else null. */
export function takeHandoff(
  tab: ContactsStore | null,
  want: { userId: string | null; eventId: string; form: string; now: number }
): { contactId: string } | null {
  if (!tab || !want.userId) return null;
  const key = handoffKey(want.userId, want.eventId);
  let raw: string | null;
  try {
    raw = tab.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  if (!removeQuietly(tab, key)) return null;
  let n: Record<string, unknown>;
  try {
    n = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!n || typeof n !== 'object') return null;
  if (n.v !== HANDOFF_VERSION) return null;
  if (n.userId !== want.userId) return null;
  if (n.eventId !== want.eventId) return null;
  if (n.form !== want.form) return null;
  if (typeof n.contactId !== 'string' || n.contactId === '') return null;
  if (typeof n.at !== 'number') return null;
  const age = want.now - n.at;
  if (age < 0 || age > HANDOFF_TTL_MS) return null;
  return { contactId: n.contactId };
}
