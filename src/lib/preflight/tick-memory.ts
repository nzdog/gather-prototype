/**
 * [[GTC-386]] (item 68) — the pre-flight's five ticks, remembered in this browser.
 *
 * Nigel's words, from his 14 Oct walk: *"Keep the ticks"*. Ruled 2026-10-15: "In this browser
 * (Recommended)" — on this device, per event, and per person (Q8: a co-host on the same laptop sees
 * none of the host's ticks, because a tick says "I looked" and Send is one act with no recall).
 * Another phone, another browser, a closed private window or cleared site data starts unticked.
 * Nothing goes to the server.
 *
 * WHAT IS STORED: for each ticked step, its number and a short fingerprint of what the step showed
 * when she ticked it. No name, no address, no message text, so a shared device holds nothing
 * personal. A settled step (invites only) is the event's, never stored.
 *
 * WHEN A TICK GOES (Q7): when what its step shows has changed somewhere other than this page since
 * she ticked it — the fingerprint no longer matches. Her own changes on the pre-flight keep the
 * tick, as before: the page fingerprints it again. Ready goes whenever any of steps 1 to 4 goes.
 *
 * STORAGE THAT REFUSES (a locked-down or private browser): every touch is inside a try. A failed
 * read is an empty memory and a failed write is a no; the page then behaves exactly as it did
 * before this ticket, ticks for the visit only.
 *
 * Pure, so the rules are pinned without a browser (`tests/walkthrough-batch16-test.tsx`, layer P).
 */

export type TickStep = 1 | 2 | 3 | 4 | 5;
/** A ticked step's fingerprint, by step. An absent step is not ticked. */
export type TickPrints = Partial<Record<TickStep, string>>;
/** The fingerprint each of steps 1 to 4 shows now; null while it is not known yet (step 4). */
export type CurrentPrints = Partial<Record<1 | 2 | 3 | 4, string | null>>;

/** The part of `Storage` this module uses, so a test can hand it a fake one. */
export interface TickStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Ready's tick shows no facts of its own; it stands while steps 1 to 4 stand. */
export const READY_PRINT = 'ready';

const PREFIX = 'gather:preflight-ticks:';
const VERSION = 1;
const STEPS: readonly TickStep[] = [1, 2, 3, 4, 5];

/** One key per event and per person looking (Q8). */
export function tickKey(eventId: string, viewerId: string): string {
  return `${PREFIX}${eventId}:${viewerId}`;
}

/** The browser's storage, or null where touching it throws. */
export function browserStore(): TickStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The stored ticks; anything missing, malformed or refused reads as none. */
export function readTicks(store: TickStore | null, key: string): TickPrints {
  if (!store) return {};
  try {
    const raw = store.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { v?: unknown; ticks?: Record<string, unknown> };
    if (parsed?.v !== VERSION || !parsed.ticks || typeof parsed.ticks !== 'object') return {};
    const out: TickPrints = {};
    for (const n of STEPS) {
      const print = parsed.ticks[String(n)];
      if (typeof print === 'string' && print.length > 0 && print.length <= 16) out[n] = print;
    }
    return out;
  } catch {
    return {};
  }
}

/** Stores the ticks (an empty set removes the entry). False when storage refused. */
export function writeTicks(store: TickStore | null, key: string, ticks: TickPrints): boolean {
  if (!store) return false;
  try {
    if (Object.keys(ticks).length === 0) store.removeItem(key);
    else store.setItem(key, JSON.stringify({ v: VERSION, ticks }));
    return true;
  } catch {
    return false;
  }
}

/** Removes the entry (after the press). Quiet when storage refuses. */
export function forgetTicks(store: TickStore | null, key: string): void {
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    // nothing to forget where nothing could be kept
  }
}

/** The value as JSON with every object's keys in order, so the same facts always read the same. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** A short fingerprint (32-bit FNV-1a, 8 hex characters). It cannot be read back into the facts. */
export function printOf(value: unknown): string {
  const text = canonical(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** What the pre-flight's own read carries, as far as steps 1 to 3 show it. */
interface PreflightFacts {
  event: { nudgePace: string | null };
  coverage: { unassignedItems: Array<{ id: string; name: string; critical: boolean }> };
  dietary: { status: string; requirements: readonly string[]; other?: string };
  households: Array<{
    id: string;
    label: string;
    littleCount: number;
    contactPersonEventId: string | null;
    resolvedContactPersonEventId: string | null;
    members: Array<{ personEventId: string; name: string; nudgeMark: string | null }>;
  }>;
  unhoused: Array<{ personEventId: string; name: string; nudgeMark: string | null }>;
}

const person = (m: { personEventId: string; name: string; nudgeMark: string | null }) => [
  m.personEventId,
  m.name,
  m.nudgeMark,
];

/**
 * Steps 1 to 3's fingerprints, each over what that step shows: the things with no owner and which
 * are critical; the dietary answer; the pace, each household's contact and every member's mark.
 * Step 4's comes from its own read (`printOf` over the message's data).
 */
export function preflightPrints(d: PreflightFacts): Record<1 | 2 | 3, string> {
  return {
    1: printOf(
      [...d.coverage.unassignedItems]
        .map((i) => [i.id, i.name, i.critical])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    ),
    2: printOf({
      status: d.dietary.status,
      requirements: [...d.dietary.requirements].sort(),
      other: d.dietary.other ?? '',
    }),
    3: printOf({
      pace: d.event.nudgePace,
      households: d.households.map((h) => [
        h.id,
        h.label,
        h.littleCount,
        h.contactPersonEventId,
        h.resolvedContactPersonEventId,
        h.members.map(person),
      ]),
      unhoused: d.unhoused.map(person),
    }),
  };
}

/**
 * The rule (Q7), as the page applies it on arrival: a stored tick for steps 1 to 4 stands while its
 * step is not settled and its fingerprint matches what the step shows now; one whose step is not
 * known yet (step 4, before its message arrives) stands until it is. Ready stands only while each
 * of steps 1 to 4 is settled or stands.
 */
export function standingTicks(
  stored: TickPrints,
  current: CurrentPrints,
  settled: Record<number, boolean>
): TickPrints {
  const out: TickPrints = {};
  for (const n of [1, 2, 3, 4] as const) {
    const print = stored[n];
    if (settled[n] || print === undefined) continue;
    const now = current[n];
    if (now === null || now === undefined || now === print) out[n] = print;
  }
  if (stored[5] !== undefined && ([1, 2, 3, 4] as const).every((n) => settled[n] || out[n])) {
    out[5] = stored[5];
  }
  return out;
}

/** Step 4, once its message arrives: the same print keeps it; another drops it, and Ready with it. */
export function settleStepFour(ticks: TickPrints, print: string): TickPrints {
  if (ticks[4] === undefined || ticks[4] === print) return ticks;
  const out = { ...ticks };
  delete out[4];
  delete out[5];
  return out;
}
