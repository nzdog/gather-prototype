import { DEMO_START_WORDS } from '@/lib/demo/start-limit';
import { datePairToSend, type DatePairValue } from '@/lib/events/date-pair';

/**
 * [[GTC-395]] item 3 — A SAMPLE'S OWN "CREATE YOUR EVENT" PAGE (founder, 20 Oct 2026: "Start the
 * demo on the setup screen where all details are entered. Have it pre filled.").
 *
 * The real page, `src/app/plan/new/page.tsx`, is the paying page and is not edited. The sample's
 * sibling, `src/app/demo/new/page.tsx`, looks like it and takes its words from here: the real page's
 * labels and heading, the Edit event box's venue labels, each proved equal to its own file by
 * test:demo-tweaks-2 (neither file can be imported for its words). The only new words are the line
 * under the heading and the button, the real page's phrasing minus the payment.
 *
 * Starting: the private sample exactly as the old /demo button started it (`POST /api/demo/session`
 * with start copy, unchanged, its notes and limits from `DEMO_START_WORDS`), then the page's event
 * name, dates and venue saved onto the new sample through the ordinary Edit event route, `GET` then
 * `PATCH /api/events/{id}`. That route writes a field the body leaves out as empty, so the whole
 * event is sent, the fields the Edit event box sends, with the page's values on top. No new route.
 */

/** From `src/app/plan/new/page.tsx` (not edited). */
export const CREATE_EVENT_WORDS = {
  HEADING: 'Create Your Event',
  EVENT_NAME: 'Event Name',
  YOUR_NAME: 'Your Name',
  EMAIL: 'Email',
  PHONE: 'Phone',
} as const;

/** From the Edit event box's venue step, `src/components/plan/EditEventModal.tsx` (not edited). */
export const VENUE_WORDS = {
  HEADING: 'Venue Details',
  NAME: 'Venue Name',
  START: 'Event Start Time',
  END: 'Event End Time',
} as const;

export const SAMPLE_EVENT_WORDS = {
  /** New: the real page's "Enter your event details and pay $25 to get started." minus the payment. */
  LINE: 'Enter your event details to get started.',
  /** New: the real page's "Pay & Create — $25" minus the payment. */
  BUTTON: 'Create',
  /** The old /demo button's working word (`src/app/demo/page.tsx` at demo-tweaks-good), moved here. */
  STARTING: 'Starting…',
  /** The Edit event box's own failure line, reused when the save after the start fails. */
  SAVE_FAILED: 'Failed to update event',
} as const;

/** The made-up details the page opens with. The host's three are shown locked: the sample ignores them. */
export const SAMPLE_DETAILS = {
  email: 'sam@example.com',
  phone: '021 123 4567',
  venueName: 'Riverside Park',
  venueTimingStart: '12:00pm',
  venueTimingEnd: '4:00pm',
} as const;

/** What the page saves onto the new sample: its editable fields. */
export interface SampleEventDetails {
  name: string;
  dates: DatePairValue;
  venueName: string;
  venueTimingStart: string;
  venueTimingEnd: string;
}

/** The fields the Edit event box sends (its form's own keys, `EditEventModal.tsx`). */
export const EDIT_EVENT_FIELDS = [
  'name',
  'startDate',
  'endDate',
  'occasionType',
  'occasionDescription',
  'guestCount',
  'guestCountConfidence',
  'guestCountMin',
  'guestCountMax',
  'dietaryStatus',
  'dietaryVegetarian',
  'dietaryVegan',
  'dietaryGlutenFree',
  'dietaryDairyFree',
  'dietaryAllergies',
  'venueName',
  'venueType',
  'venueKitchenAccess',
  'venueOvenCount',
  'venueStoretopBurners',
  'venueBbqAvailable',
  'venueTimingStart',
  'venueTimingEnd',
  'venueNotes',
] as const;

/** The whole event as the Edit event box would send it, with the page's values on top. */
export function editPayloadFor(
  event: Record<string, unknown>,
  details: SampleEventDetails
): Record<string, unknown> {
  const whole: Record<string, unknown> = {};
  for (const field of EDIT_EVENT_FIELDS) if (field in event) whole[field] = event[field];
  return {
    ...whole,
    name: details.name,
    ...datePairToSend(details.dates),
    venueName: details.venueName,
    venueTimingStart: details.venueTimingStart,
    venueTimingEnd: details.venueTimingEnd,
  };
}

/**
 * How a press of the button ends:
 *   - `opened`: the sample started and its details were saved; go to `href` (the setup page);
 *   - `saveError`: the sample started but the save failed; it still opens at `href`, with one line;
 *   - `refused`: no sample was started; one of the start notes, with its link where it has one.
 */
export type SampleStartOutcome =
  | { kind: 'opened'; href: string }
  | { kind: 'saveError'; href: string }
  | { kind: 'refused'; words: string; href?: string };

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Start the sample, then save the page's details onto it. Each request is made once, never retried. */
export async function startSampleWithDetails(
  details: SampleEventDetails,
  fetch: typeof globalThis.fetch = globalThis.fetch
): Promise<SampleStartOutcome> {
  try {
    const response = await fetch('/api/demo/session', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ start: 'copy' }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && typeof body.href === 'string') {
      const saved =
        typeof body.eventId === 'string' && (await saveDetails(body.eventId, details, fetch));
      return saved ? { kind: 'opened', href: body.href } : { kind: 'saveError', href: body.href };
    }
    if (response.status === 409) {
      // Signed in already: is it a sample she has open (W10), or a real account (W9)?
      const list = await fetch('/api/events')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const open = ((list?.events ?? []) as Array<{ id: string; isDemo?: boolean }>).find(
        (e) => e.isDemo === true
      );
      return open
        ? { kind: 'refused', words: DEMO_START_WORDS.ALREADY_OPEN, href: `/plan/${open.id}/setup` }
        : { kind: 'refused', words: DEMO_START_WORDS.SIGNED_IN };
    }
    if (response.status === 429 && typeof body.error === 'string') {
      return { kind: 'refused', words: body.error };
    }
    return { kind: 'refused', words: DEMO_START_WORDS.FAILED };
  } catch {
    return { kind: 'refused', words: DEMO_START_WORDS.FAILED };
  }
}

/** Read the new sample through the Edit event route, then write it back with the page's values. */
async function saveDetails(
  eventId: string,
  details: SampleEventDetails,
  fetch: typeof globalThis.fetch
): Promise<boolean> {
  try {
    const read = await fetch(`/api/events/${eventId}`);
    if (!read.ok) return false;
    const { event } = await read.json();
    if (!event || typeof event !== 'object') return false;
    const write = await fetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(editPayloadFor(event, details)),
    });
    return write.ok;
  } catch {
    return false;
  }
}
