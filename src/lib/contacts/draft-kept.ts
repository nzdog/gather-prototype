/**
 * [[GTC-470]] (amendment A11, the founder's ruling 2 of plan 2) — "IS A DRAFT KEPT?"
 *
 * The one place the contacts files name the household form's draft module (GTC-435), and only to ask a
 * yes-or-no question: is a draft kept in this browser for this person's new-household form of this event?
 * It answers true or false. It never returns what was typed, and it never writes or removes.
 *
 * The form's own reader is used, so the answer is the one the form would act on: a draft counts only if it
 * is hers, for this event and this form, well-formed and under seven days old. That reader also removes a
 * stale or malformed entry as it goes, so it is handed a view of the storage that can be read and cannot be
 * written to or removed from: "never removes" holds by how it is built, not by hope.
 */
import { browserDraftStore, readDraft, type DraftStore } from '@/lib/households/form-draft';

/** The same storage, readable, with nothing that changes it. */
function readOnly(store: DraftStore): DraftStore {
  return {
    get length() {
      return store.length;
    },
    key: (index) => store.key(index),
    getItem: (key) => store.getItem(key),
    setItem: () => {},
    removeItem: () => {},
  };
}

export function newHouseholdDraftKept(userId: string | null, eventId: string | null): boolean {
  if (!userId || !eventId) return false;
  try {
    const store = browserDraftStore();
    return store ? readDraft(readOnly(store), userId, eventId, 'new') !== null : false;
  } catch {
    return false;
  }
}
