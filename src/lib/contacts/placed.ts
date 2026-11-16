/**
 * [[GTC-460]] Stage 3, step 3d — PLACED: which of her contacts are already in a household of an event
 * (D13, rulings 40 and 156; plan section 6).
 *
 * When she saves a household that has people picked from her contacts, this browser remembers, per event,
 * which contact went into which household: the contact's id, the household's id, the name as saved, adult or
 * kid, and for a kid what she chose (tick, Decide later, or neither). It is written at the moment of the
 * save, after the save has come back good, and it is NEVER matched by email or by name: a person typed into
 * a household by hand is not known as placed.
 *
 * A remembered placement counts only while it still holds: the household must still be there and still have
 * a member of that name (capitals ignored). `holds` is the one rule. The two pages hold their households in
 * different shapes (the setup page its own converted list, the contacts page the raw reply of the server), so
 * each turns its list into the same simple one (`liteFromSaved`, `liteFromApi`) and `holds` reads only that.
 * Nothing about the contact but its id and the name as saved is ever written here.
 *
 * Storage only through the store it is handed; no server, no request. The key starts with the placement
 * prefix of `./store`, so Clear takes it and the draft sweep never can.
 */
import { PLACED_PREFIX, type ContactsStore } from '@/lib/contacts/store';

export const PLACED_VERSION = 1;
const MAX_PLACEMENTS = 2000;

/** One row of the form that came from a contact, as the form lists it at the press of Save. */
export type PickedRow = {
  contactId: string;
  name: string;
  role: 'adult' | 'kid';
  /** A kid only: ticked ('message'), Decide later ('later') or neither ('plain'). */
  outcome?: 'message' | 'later' | 'plain';
};
export type Placement = PickedRow & { householdId: string };

/** A household as the one rule reads it: its id, its main contact's name and its members' names. */
export type HouseholdLite = { id: string; mainName: string; memberNames: string[] };

export function placedKey(userId: string, eventId: string): string {
  return `${PLACED_PREFIX}v${PLACED_VERSION}:${userId}:${eventId}`;
}

const isText = (v: unknown): v is string => typeof v === 'string';

function clean(r: any): Placement | null {
  if (!r || typeof r !== 'object') return null;
  if (!isText(r.contactId) || r.contactId === '' || r.contactId.length > 100) return null;
  if (!isText(r.householdId) || r.householdId === '' || r.householdId.length > 100) return null;
  const name = isText(r.name) ? r.name.trim() : '';
  if (name === '' || name.length > 200) return null;
  if (r.role !== 'adult' && r.role !== 'kid') return null;
  if (
    r.outcome !== undefined &&
    r.outcome !== 'message' &&
    r.outcome !== 'later' &&
    r.outcome !== 'plain'
  ) {
    return null;
  }
  return {
    contactId: r.contactId,
    householdId: r.householdId,
    name,
    role: r.role,
    ...(r.outcome ? { outcome: r.outcome } : {}),
  };
}

/** What is remembered for this person and event. Never throws; anything unreadable reads as nothing. */
export function readPlaced(
  store: ContactsStore | null,
  userId: string | null,
  eventId: string
): Placement[] {
  if (!store || !userId) return [];
  try {
    const raw = store.getItem(placedKey(userId, eventId));
    if (raw === null) return [];
    const v = JSON.parse(raw);
    if (!v || v.v !== PLACED_VERSION || v.userId !== userId || v.eventId !== eventId) return [];
    if (!Array.isArray(v.placements)) return [];
    const out: Placement[] = [];
    for (const p of v.placements) {
      const c = clean(p);
      if (c) out.push(c);
    }
    return out.slice(-MAX_PLACEMENTS);
  } catch {
    return [];
  }
}

function write(
  store: ContactsStore,
  key: string,
  userId: string,
  eventId: string,
  list: Placement[]
): boolean {
  try {
    store.setItem(
      key,
      JSON.stringify({
        v: PLACED_VERSION,
        userId,
        eventId,
        placements: list.slice(-MAX_PLACEMENTS),
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Remembers the picked rows of one good save. A contact placed again replaces its earlier record (one place
 * at a time). False when the browser will not keep it (what was remembered is then as it was); true when
 * there was nothing to remember.
 */
export function recordPlacements(
  store: ContactsStore | null,
  userId: string | null,
  eventId: string,
  householdId: string,
  rows: PickedRow[]
): boolean {
  if (!userId || !eventId || !householdId) return false;
  if (rows.length === 0) return true;
  if (!store) return false;
  const added = rows
    .map((r) => clean({ ...r, householdId }))
    .filter((p): p is Placement => p !== null);
  if (added.length === 0) return true;
  const key = placedKey(userId, eventId);
  const old = readPlaced(store, userId, eventId);
  const ids = new Set(added.map((p) => p.contactId));
  const kept = old.filter((p) => !ids.has(p.contactId));
  return write(store, key, userId, eventId, [...kept, ...added]);
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const same = (a: string, b: string) => norm(a) === norm(b);

/** THE rule: the household, if the placement still holds (it is there and still has a member of that name). */
export function holds(p: Placement, households: HouseholdLite[]): HouseholdLite | null {
  const h = households.find((x) => x.id === p.householdId);
  if (!h) return null;
  return h.memberNames.some((n) => same(n, p.name)) ? h : null;
}

/** Her placements that still hold, by contact id (a later record of a contact wins). */
export function livePlacements(
  placements: Placement[],
  households: HouseholdLite[]
): Map<string, { placement: Placement; household: HouseholdLite }> {
  const live = new Map<string, { placement: Placement; household: HouseholdLite }>();
  for (const p of placements) {
    const h = holds(p, households);
    if (h) live.set(p.contactId, { placement: p, household: h });
  }
  return live;
}

/** The contacts page's list: the raw `households` the server sends (members with their person and role). */
export function liteFromApi(raw: unknown): HouseholdLite[] {
  if (!Array.isArray(raw)) return [];
  const out: HouseholdLite[] = [];
  for (const h of raw) {
    const o = h as { id?: unknown; members?: unknown } | null;
    if (!o || typeof o !== 'object' || !isText(o.id) || !Array.isArray(o.members)) continue;
    const members = o.members as any[];
    const names = members
      .map((m) => m?.person?.name)
      .filter((n): n is string => isText(n) && n.trim() !== '');
    const main = members.find((m) => m?.householdRole === 'PRIMARY_CONTACT')?.person?.name;
    out.push({
      id: o.id,
      mainName: isText(main) && main.trim() !== '' ? main.trim() : (names[0] ?? ''),
      memberNames: names,
    });
  }
  return out;
}

/** The setup page's list: its own converted households (the main contact, a partner, kids with jobs, guests). */
export function liteFromSaved(
  list: Array<{
    id: string;
    primaryContact: { name: string };
    partner?: { name: string };
    helpers: Array<{ name: string }>;
    guests: Array<{ name: string }>;
  }>
): HouseholdLite[] {
  return list.map((h) => ({
    id: h.id,
    mainName: h.primaryContact.name,
    memberNames: [
      h.primaryContact.name,
      ...(h.partner ? [h.partner.name] : []),
      ...h.helpers.map((x) => x.name),
      ...h.guests.map((x) => x.name),
    ],
  }));
}
