/**
 * [[GTC-470]] — THE MOMENTS ROW'S FACTS, from what the contacts page reads, and the guard's line.
 *
 * The row on the contacts page is tappable, so it needs the six facts the one rule (`stripDoors`) asks of
 * every screen: her own household is saved, a plan exists, it is approved, the event is held, it is sent,
 * and it is invites only. The setup page works them out from the event, the households and the plan; this
 * works them out the same way, with the same rules (`momentTwoBegun` and `hasAnyPlan`, in
 * src/lib/setup/entry-stage.ts), from the three replies the screen reads:
 *
 *   the event        `{ event: { status, sentAt, setup: { planApprovedAt, eventType, invitesOnly } } }`
 *   its summary      `{ teamCount, ... }`
 *   its households  the list, each with its members and their role
 *
 * "A plan exists" is the setup page's "any section or any item". Every item belongs to a section (an item's
 * `teamId` is required, and a section's `eventId` is), so that is "teamCount above zero".
 *
 * All or nothing: a reply that is missing, garbled or odd, or an event with no setup record (an old-style
 * event has no Moments), gives `null`, and the row stays a plain display. A half-known fact would send her to
 * the wrong place.
 *
 * `blockedLine` is the setup page's own guard (the same three cases, when each shows), in this page's own words
 * (W44 and W45, [[GTC-471]]): Moment 1's lines (W9, W9b of GTC-367) tell her to press Save or Cancel, and this
 * page has neither, so these two begin "Go back and". The address says whether she left a household being
 * changed or her own household's step; for the new-household form it is told, by one read-only question,
 * whether a draft is kept.
 *
 * CLIENT-SAFE and pure: no storage, no request, no hook.
 */
import type { StripFacts } from '@/lib/moments/strip';
import { hasAnyPlan, momentTwoBegun } from '@/lib/setup/entry-stage';
import type { ContactsAddress } from '@/lib/contacts/address';
import { CONTACTS_WORDS } from '@/lib/contacts/words';

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** The six facts, or null when any reply cannot be trusted. */
export function stripFactsFrom(input: {
  event: unknown;
  summary: unknown;
  households: unknown;
}): StripFacts | null {
  const { event: eventReply, summary, households } = input;
  if (!isObject(eventReply) || !isObject(eventReply.event)) return null;
  const event = eventReply.event;
  const setup = event.setup;
  if (!isObject(setup)) return null;
  if (typeof event.status !== 'string') return null;
  if (!isObject(summary)) return null;
  const teamCount = summary.teamCount;
  if (typeof teamCount !== 'number' || !Number.isFinite(teamCount) || teamCount < 0) return null;
  if (!Array.isArray(households)) return null;

  const hostMember = households.some(
    (h) =>
      isObject(h) &&
      Array.isArray(h.members) &&
      h.members.some((m) => isObject(m) && m.role === 'HOST')
  );
  const begun = momentTwoBegun({
    eventType: typeof setup.eventType === 'string' ? setup.eventType : null,
    invitesOnly: setup.invitesOnly === true,
    planApprovedAt: typeof setup.planApprovedAt === 'string' ? setup.planApprovedAt : null,
  });
  return {
    hostSaved: begun || hostMember,
    hasPlan: hasAnyPlan([], teamCount),
    planApproved: Boolean(setup.planApprovedAt),
    held: event.status !== 'DRAFT',
    sent: Boolean(event.sentAt),
    invitesOnly: Boolean(setup.invitesOnly),
  };
}

/**
 * The line that locks the Moments' doors while a household is half done, or null when nothing does.
 *   she left a household being changed (the address has `edit`)  W44
 *   she left her own household's step (`form=host`)              nothing, as on the setup page
 *   she left the new-household form (a plain address)            W45 while a draft is kept, else nothing
 */
export function blockedLine(a: ContactsAddress, draftKept: boolean): string | null {
  if (!a.eventId) return null;
  if (a.editId) return CONTACTS_WORDS.LOCKED_CHANGING;
  if (a.form === 'host') return null;
  return draftKept ? CONTACTS_WORDS.LOCKED_TYPED : null;
}
