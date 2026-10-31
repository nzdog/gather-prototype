/**
 * [[GTC-435]] — an unsaved household, kept in this browser while she is away from the form.
 *
 * Found on production (30 Oct 2026): a tester typed a household with six children, left Moment 1
 * and came back, and every name was gone. The form held them only in memory. iPhone Safari never
 * asks "Leave site?", and moving between Moment 1's own screens never asks on any browser.
 *
 * The founder's rulings (31 Oct 2026): localStorage with a 7-day limit; a quiet line on every
 * restore ("Got it", "Discard"; "Carry on" for a saved household she was changing); a draft for a
 * household since removed is dropped silently; one for a household changed elsewhere is restored
 * anyway.
 *
 * WHERE: this browser's localStorage only. Nothing here is sent anywhere: no route reads it and no
 * request carries it. One entry per signed-in person, per event, per form:
 *   gather:household-draft:v1:<userId>:<eventId>:host          her own household's step
 *   gather:household-draft:v1:<userId>:<eventId>:new           "Save & add another household"
 *   gather:household-draft:v1:<userId>:<eventId>:edit:<id>     "Save changes" on a saved household
 * The value repeats its user, event and form, and every read checks them again, so a draft never
 * shows under another event or another person even if a key were mixed up.
 *
 * WHEN IT GOES: a good save of that form; Cancel or Discard; the form back to how it opened; a
 * page load with nobody signed in (so a sign-out clears every draft here) or with someone else
 * signed in (their drafts go, not just hide); 7 days after it was last written. Every storage call
 * is inside a try: a browser that refuses storage gets the form exactly as it was before.
 *
 * Pure (no React), so its rules are pinned without a browser (tests/household-save-test.tsx, D).
 */

/** The part of `Storage` used here, so a test can hand it a stand-in. */
export interface DraftStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The founder's words (31 Oct 2026, ruling 2). Change none without a ruling. */
export const DRAFT_KEEP_WORDS = {
  /** Above a form filled from a draft. */
  KEPT: 'We kept what you typed here earlier. It isn’t saved yet.',
  GOT_IT: 'Got it',
  DISCARD: 'Discard',
  CARRY_ON: 'Carry on',
} as const;

/** Above the new-household form, while a saved household has unsaved changes kept. */
export function changingWords(name: string): string {
  return `You were changing ${name}’s household and hadn’t saved.`;
}

export const DRAFT_PREFIX = 'gather:household-draft:';
export const DRAFT_VERSION = 1;
/** Ruling 1: seven days from the last write. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Which form a draft belongs to. */
export type DraftForm = 'host' | 'new' | `edit:${string}`;

export interface DraftPerson {
  name: string;
  email: string;
  phone: string;
}
export interface DraftRow extends DraftPerson {
  /** A saved member's row, kept so "Save changes" keeps who they are (edit drafts only). */
  personEventId?: string;
  adultRoled?: boolean;
}

/** Everything she can type or choose in the form (formSnapshot's fields, and the row order). */
export interface FormDraftState {
  name: string;
  email: string;
  phone: string;
  showPartner: boolean;
  partner: DraftPerson & { personEventId?: string };
  helpers: DraftRow[];
  showLittles: boolean;
  littleCount: number;
  guests: DraftRow[];
  /** The rows as shown, newest first: the partner, or a kid with a job or a guest by position. */
  order: Array<{ type: 'partner' | 'helper' | 'guest'; index: number }>;
  contactPersonEventId: string | null;
  hostingAlone: boolean;
  messagesMuted: boolean;
}

export interface StoredDraft {
  v: typeof DRAFT_VERSION;
  userId: string;
  eventId: string;
  form: DraftForm;
  savedAt: number;
  /** Edit drafts: the saved household's main contact when the changes began, for the line. */
  householdName?: string;
  state: FormDraftState;
}

const MAX_ROWS = 60;
const MAX_TEXT = 500;

export function draftKey(userId: string, eventId: string, form: DraftForm): string {
  return `${DRAFT_PREFIX}v${DRAFT_VERSION}:${userId}:${eventId}:${form}`;
}

/** This browser's localStorage, or null where touching it throws (or there is no window). */
export function browserDraftStore(): DraftStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_TEXT;
const isOptText = (v: unknown) => v === undefined || isText(v);

function isPerson(p: unknown): p is DraftPerson {
  const o = p as DraftPerson;
  return !!o && typeof o === 'object' && isText(o.name) && isText(o.email) && isText(o.phone);
}

function isRow(r: unknown): r is DraftRow {
  const o = r as DraftRow;
  return (
    isPerson(o) &&
    isOptText(o.personEventId) &&
    (o.adultRoled === undefined || typeof o.adultRoled === 'boolean')
  );
}

/** True only for a state this form can put back as it was. */
export function isDraftState(s: unknown): s is FormDraftState {
  const o = s as FormDraftState;
  if (!o || typeof o !== 'object') return false;
  if (!isText(o.name) || !isText(o.email) || !isText(o.phone)) return false;
  if (typeof o.showPartner !== 'boolean' || !isPerson(o.partner)) return false;
  if (!isOptText(o.partner.personEventId)) return false;
  if (!Array.isArray(o.helpers) || o.helpers.length > MAX_ROWS || !o.helpers.every(isRow))
    return false;
  if (!Array.isArray(o.guests) || o.guests.length > MAX_ROWS || !o.guests.every(isRow))
    return false;
  if (typeof o.showLittles !== 'boolean') return false;
  if (!Number.isInteger(o.littleCount) || o.littleCount < 1 || o.littleCount > 20) return false;
  if (!(o.contactPersonEventId === null || isText(o.contactPersonEventId))) return false;
  if (typeof o.hostingAlone !== 'boolean' || typeof o.messagesMuted !== 'boolean') return false;
  if (!Array.isArray(o.order) || o.order.length > MAX_ROWS * 2 + 1) return false;
  return o.order.every((e) => {
    if (!e || !Number.isInteger(e.index) || e.index < 0) return false;
    if (e.type === 'partner') return e.index === 0;
    if (e.type === 'helper') return e.index < o.helpers.length;
    if (e.type === 'guest') return e.index < o.guests.length;
    return false;
  });
}

function parse(raw: string | null): StoredDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as StoredDraft;
    if (!d || typeof d !== 'object' || d.v !== DRAFT_VERSION) return null;
    if (!isText(d.userId) || !isText(d.eventId) || !isText(d.form)) return null;
    if (typeof d.savedAt !== 'number' || !Number.isFinite(d.savedAt)) return null;
    if (!isOptText(d.householdName) || !isDraftState(d.state)) return null;
    return d;
  } catch {
    return null;
  }
}

const fresh = (d: StoredDraft, now: number) =>
  d.savedAt <= now + 60_000 && now - d.savedAt <= DRAFT_MAX_AGE_MS;

function remove(store: DraftStore, key: string) {
  try {
    store.removeItem(key);
  } catch {
    // Storage refused: nothing more to do.
  }
}

/**
 * The draft for this person, event and form, or null. A stored value that is not exactly theirs
 * (another person, event or form inside it), malformed, of another version or too old is removed.
 */
export function readDraft(
  store: DraftStore | null,
  userId: string,
  eventId: string,
  form: DraftForm,
  now = Date.now()
): StoredDraft | null {
  if (!store) return null;
  const key = draftKey(userId, eventId, form);
  let raw: string | null = null;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const d = parse(raw);
  if (!d || d.userId !== userId || d.eventId !== eventId || d.form !== form || !fresh(d, now)) {
    remove(store, key);
    return null;
  }
  return d;
}

/** Keeps what is typed. False when storage refused. */
export function writeDraft(
  store: DraftStore | null,
  userId: string,
  eventId: string,
  form: DraftForm,
  state: FormDraftState,
  householdName?: string,
  now = Date.now()
): boolean {
  if (!store) return false;
  const d: StoredDraft = {
    v: DRAFT_VERSION,
    userId,
    eventId,
    form,
    savedAt: now,
    ...(householdName !== undefined ? { householdName } : {}),
    state,
  };
  try {
    store.setItem(draftKey(userId, eventId, form), JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function removeDraft(
  store: DraftStore | null,
  userId: string,
  eventId: string,
  form: DraftForm
): void {
  if (store) remove(store, draftKey(userId, eventId, form));
}

function draftKeys(store: DraftStore): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(DRAFT_PREFIX)) keys.push(k);
    }
  } catch {
    return [];
  }
  return keys;
}

/**
 * The most recently written draft of a saved household on this event, for the "You were
 * changing" line, or null.
 */
export function latestEditDraft(
  store: DraftStore | null,
  userId: string,
  eventId: string,
  now = Date.now()
): { householdId: string; draft: StoredDraft } | null {
  if (!store) return null;
  const head = `${DRAFT_PREFIX}v${DRAFT_VERSION}:${userId}:${eventId}:edit:`;
  let best: { householdId: string; draft: StoredDraft } | null = null;
  for (const k of draftKeys(store)) {
    if (!k.startsWith(head)) continue;
    const householdId = k.slice(head.length);
    const d = readDraft(store, userId, eventId, `edit:${householdId}`, now);
    if (d && (!best || d.savedAt > best.draft.savedAt)) best = { householdId, draft: d };
  }
  return best;
}

/**
 * Run on every page load. With nobody signed in, every household draft in this browser goes
 * (after a sign-out, an expired session, or a sign-out elsewhere). With someone signed in, every
 * draft that is not theirs goes, and so does any of theirs that is too old or malformed.
 * Returns how many went.
 */
export function sweepDrafts(
  store: DraftStore | null,
  userId: string | null,
  now = Date.now()
): number {
  if (!store) return 0;
  const mine = userId ? `${DRAFT_PREFIX}v${DRAFT_VERSION}:${userId}:` : null;
  let gone = 0;
  for (const k of draftKeys(store)) {
    let keep = false;
    if (mine && k.startsWith(mine)) {
      let raw: string | null = null;
      try {
        raw = store.getItem(k);
      } catch {
        raw = null;
      }
      const d = parse(raw);
      keep = !!d && d.userId === userId && k === draftKey(d.userId, d.eventId, d.form);
      keep = keep && fresh(d as StoredDraft, now);
    }
    if (!keep) {
      remove(store, k);
      gone++;
    }
  }
  return gone;
}
