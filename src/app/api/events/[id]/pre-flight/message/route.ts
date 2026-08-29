// GET   /api/events/[id]/pre-flight/message — the ingredients for step 4
// PATCH /api/events/[id]/pre-flight/message — stores the host's movement 1
//
// GTC-187 (H2) — the ingredients for step 4 of the pre-flight, "the message, shown".
// GTC-260 — the read and the write of `Event.askAuthorLine`, the column GTC-259 added
// and deliberately left unwired.
//
// THIS ROUTE COMPOSES NOTHING. It returns event facts, the host's name and one row per
// recipient; the screen calls `composeAsk` in `src/lib/messages/ask-register.ts` itself.
// That is deliberate and is the same arrangement GTC-188 made for the nudge clock: the
// composer is client-safe precisely so the screen renders the message the send will
// produce rather than a server-rendered picture of it, and so the host's edit to movement 1
// re-composes live through the same function the dispatch path (GTC-189) will call. A
// server-side copy of the composition here would be the second definition those two are
// designed not to have.
//
// NOTHING HERE SENDS, and nothing here issues a token. `ensureEventTokens` runs at the
// transition to CONFIRMING (`transitionToConfirming` in src/lib/workflow.ts) and again at
// the press, which is GTC-189's.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { MESSAGEABLE_PERSON_EVENT } from '@/lib/eligibility/child-exclusion';
import { buildTokenUrl } from '@/lib/tokens';
import { HOST_NAME_FALLBACK } from '@/lib/messages/ask-register';

/** Stands in for a guest link on an event whose participant tokens have not been issued
 *  yet. Deliberately not a plausible URL — the screen must not read as if it had one. */
const LINK_PENDING = '[link issued at the press]';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        startDate: true,
        venueName: true,
        occasionDescription: true,
        hostId: true,
        askAuthorLine: true,
        host: { select: { id: true, name: true, userId: true } },
      },
    });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    /*
     * THE HOST EXCLUSION — the same three identity paths the auto-assign route resolves,
     * and for the same reason: whoever the host is, they are not a recipient of their own
     * ask. See the THE HOST EXCLUSION comment in
     * `src/app/api/events/[id]/people/auto-assign/route.ts` for the full reasoning,
     * including why this is resolved POSITIVELY and excluded by id rather than written as a
     * negation (SQL three-valued logic empties the list on nullable `userId`).
     *
     * NOT EXTRACTED INTO A SHARED HELPER. The original reason was that [[GTC-256]] might
     * delete the need for the three paths entirely by giving the host one identity.
     * ⚠ THAT REASON IS DISCHARGED, AND THE ANSWER IS NO — GTC-256 open question 4, closed
     * 2026-08-29. Ruling 10 makes path 1 resolve on every new event, but path 3 still
     * catches a row the other two cannot: `POST /api/auth/verify`'s claim branch sets
     * `person.userId` UNCONDITIONALLY and `Person.userId` carries only an index, so one
     * human can end up as two Person rows sharing one User — proven against the database,
     * not inferred. All three paths stay. Whether they are now extracted is a live
     * question and is [[GTC-263]]'s, not this file's.
     *
     * ⚠ AND THE CLAIM THAT USED TO SIT HERE — "on a Moment-flow event this finds nothing"
     * — IS FALSE SINCE GTC-256 phase 2. The host is captured with her own `PersonEvent`
     * pointing at `Event.hostId`'s existing Person (Rulings 1, 8, 10), so path 1 resolves
     * and `hostIdentityResolved` is true. It still finds nothing on the events that
     * predate phase 2, which keep no host row under Ruling 12 (no backfill) — those are
     * where `hostIdentityResolved` goes false and the screen says so rather than hiding
     * it.
     */
    const hostUserId = event.host?.userId ?? null;
    const hostMemberships = await prisma.personEvent.findMany({
      where: {
        eventId,
        OR: [
          { personId: event.hostId },
          { role: 'HOST' },
          ...(hostUserId ? [{ person: { userId: hostUserId } }] : []),
        ],
      },
      select: { id: true },
    });
    const hostPersonEventIds = hostMemberships.map((m) => m.id);

    const people = await prisma.personEvent.findMany({
      where: {
        eventId,
        id: { notIn: hostPersonEventIds },
        // Moment 4 §10.6 is absolute: a CHILD is never a recipient of a system message,
        // whatever contact details their record carries.
        ...MESSAGEABLE_PERSON_EVENT,
      },
      select: {
        id: true,
        personId: true,
        householdId: true,
        person: { select: { id: true, name: true, email: true, phoneNumber: true } },
      },
      orderBy: { person: { name: 'asc' } },
    });

    const personIds = people.map((p) => p.personId);

    // Item NAMES only (decision 1). Quantity, drop-off location and timing are deliberately
    // not selected: the message names the items, the tap page carries their logistics, and
    // a field that is never read cannot leak into a template.
    const assignments = await prisma.assignment.findMany({
      where: { personId: { in: personIds }, item: { team: { eventId } } },
      select: { personId: true, item: { select: { name: true } } },
      orderBy: { item: { name: 'asc' } },
    });

    const itemNamesByPerson = new Map<string, string[]>();
    for (const a of assignments) {
      const list = itemNamesByPerson.get(a.personId) ?? [];
      list.push(a.item.name);
      itemNamesByPerson.set(a.personId, list);
    }

    const tokens = await prisma.accessToken.findMany({
      where: { eventId, scope: 'PARTICIPANT', personId: { in: personIds } },
      select: { personId: true, token: true },
    });
    const tokenByPerson = new Map(tokens.map((t) => [t.personId, t.token]));
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';

    const recipients = people.map((p) => {
      const token = tokenByPerson.get(p.personId) ?? null;
      return {
        personEventId: p.id,
        personId: p.personId,
        name: p.person.name,
        itemNames: itemNamesByPerson.get(p.personId) ?? [],
        link: token ? buildTokenUrl(baseUrl, 'PARTICIPANT', token) : LINK_PENDING,
        linkReady: token !== null,
        // Which carriers this person could be reached on. WHICH ONE IS USED is dispatch's
        // (GTC-189); decision 5 makes the body identical either way, so this only tells the
        // host whether a subject line is in play.
        hasEmail: !!p.person.email,
        hasPhone: !!p.person.phoneNumber,
      };
    });

    return NextResponse.json({
      event: {
        name: event.name,
        startDate: event.startDate,
        venueName: event.venueName,
        occasionDescription: event.occasionDescription,
      },
      // ⚠ PROVISIONAL when `hostIdentityResolved` is false — [[GTC-256]]: "the from-whom of
      // a send has two candidate rows and no rule distinguishing them". `Event.host` is
      // taken as the from-whom because it is the only candidate that is definitionally the
      // host; the other candidate is indistinguishable from a guest.
      hostName: event.host?.name?.trim() || HOST_NAME_FALLBACK,
      hostIdentityResolved: hostPersonEventIds.length > 0,
      // The host's stored movement 1 (GTC-187 decision 2, "stored, not ephemeral"), read
      // from the column GTC-259 added. NULL means she never wrote one, and the screen falls
      // through to `draftAuthorLine` — which is what every event does until she does.
      //
      // The field keeps the COMPOSER's name here because that is what it feeds: the screen
      // hands it straight to `composeAsk`'s `storedAuthorLine` parameter. The PATCH below
      // speaks the COLUMN's name, `askAuthorLine`, because that is what it writes.
      storedAuthorLine: event.askAuthorLine,
      recipients,
    });
  } catch (error) {
    console.error('Error assembling pre-flight message:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PATCH — stores the host's movement 1. GTC-260.
 *
 *   { askAuthorLine: string | null }  →  Event.askAuthorLine
 *
 * ONE VALUE, LAST WRITE WINS (GTC-187, 2026-08-29). An edit at mini-send time overwrites;
 * no per-send version lives on the column. What each recipient actually received is a
 * different record and is GTC-189's to decide.
 *
 * ⚠ THREE STATES, AND THIS HANDLER'S JOB IS TO KEEP THEM DISTINCT (founder ruling,
 * 2026-08-29). NULL and `''` are different facts:
 *
 *   null   →  never authored        →  composition falls through to the generated draft
 *   ''     →  deliberately no line  →  the bare greeting, "Hi Rob,", and NO draft
 *   value  →  her words             →  "Hi Rob - <value>"
 *
 * The read is `storedAuthorLine ?? draftAuthorLine(event)`, and `??` falls through on null
 * but not on `''` — one expression, all three states, no branching needed downstream.
 *
 * ⚠ DO NOT COLLAPSE `''` TO NULL. An earlier rule the same day required exactly that, on the
 * grounds that a stored `''` suppresses the draft. It does — but suppressing the draft is the
 * point, not the bug. `authorLineFor`'s own comment already treats the blank case as
 * deliberate ("hers to cut to nothing"), and Hinge §5 makes the handover the load-bearing
 * beat, not movement 1's length: a host sending to sixty people, or re-sending after she has
 * said her piece, must be able to decline to speak without Gather's words standing in for
 * hers. The superseded rule is kept in prisma/schema.prisma and GTC-259 with its reason.
 *
 * WHITESPACE-ONLY NORMALISES TO `''`, NOT TO NULL. `authorLineFor` trims before deciding, so
 * `'   '` composes identically to `''` — storing it verbatim would be a fourth spelling of
 * the third state. Values are stored trimmed. The column therefore holds exactly NULL, `''`,
 * or a trimmed non-empty string.
 *
 * Normalised HERE, at the one write site, rather than at the read — so nothing downstream
 * has to remember, and the read stays a plain `??`.
 *
 * NO LENGTH CAP, deliberately. GTC-187 decision 6: "no enforced cap ... do not truncate, do
 * not block". The pre-flight already shows the segment count so the cost is visible, which is
 * what that decision asks for instead. Matches `EventSetup.otherNotes` and the other free-text
 * fields, none of which cap.
 *
 * Deliberately NOT the event PATCH at /api/events/[id], for the reason the cadence route
 * records: that route rebuilds a whole update object with `|| null` defaults, so a one-field
 * PATCH there would clear venue and occasion fields as a side effect.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object' || !('askAuthorLine' in body)) {
      return NextResponse.json({ error: 'askAuthorLine is required' }, { status: 400 });
    }

    const raw = (body as { askAuthorLine: unknown }).askAuthorLine;
    if (raw !== null && typeof raw !== 'string') {
      return NextResponse.json(
        { error: 'askAuthorLine must be a string or null' },
        { status: 400 }
      );
    }

    // Trim, and PRESERVE `''` — the three states, see above. `null` stays null; a string
    // becomes its trimmed self, which is `''` when it was blank or whitespace-only.
    const askAuthorLine = raw === null ? null : raw.trim();

    const event = await prisma.event.update({
      where: { id: eventId },
      data: { askAuthorLine },
      select: { askAuthorLine: true },
    });

    return NextResponse.json({ storedAuthorLine: event.askAuthorLine });
  } catch (error) {
    console.error('Error storing the host author line:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
