/**
 * GTC-192 (J1, phase 2) — the static grid.
 *
 * A grid of neutral household cards, each carrying one thin colour strip per member. The
 * card is quiet; the strip's tint is that person's state. Built to
 * `docs/design/moment4-glance-reference.md` and the mockup beside it.
 *
 * PRESENTATIONAL ONLY. No data access, no client hooks, no handlers — which is what lets
 * `tests/glance-grid-test.tsx` render it with `renderToStaticMarkup` and assert on what
 * actually reaches the page rather than on what the code appears to intend.
 *
 * ── WHAT IS DELIBERATELY ABSENT ───────────────────────────────────────────────
 *
 * ONLY A RED IS A DOOR (phase 4). A red strip is a real `<button>` that opens
 * `PersonSurface`; amber, green and both greys carry no handler and no link at all. §3 puts
 * the actions behind a tap and red is the state that has one — an amber is Gather's move,
 * a green is nobody's, and the two greys are the states Kate has already settled.
 *
 * ⚠ THE RED STRIP IS NOT STYLED AS A BUTTON. It is a button ELEMENT so that the tap works
 * and so does the keyboard; its tint, text and padding are unchanged. The strip-as-button
 * SHAPE — border, chevron, hover state — is PHASE 7's variant, and shipping it as the
 * default would settle an unruled decision by stealth. So is the amber clock-line.
 *
 * The replay and polling are PHASE 6: nothing here refreshes itself, and an action that
 * leaves the board stale says so rather than repainting.
 *
 * ⚠ THE MOCKUP'S META LINE CARRIES A COUNTDOWN ("12 days to go") AND THIS DOES NOT.
 * Moment 4 §3 refuses a countdown outright, and Ruling 1's general test — "anything that
 * would make the host lean in does not belong on this screen" — is the reason to drop it
 * rather than inherit it. The mockup is the picture, not the specification, on that line.
 */

import type { EventGlance, GlanceHousehold, GlancePerson } from '@/lib/glance/state';
import type { AssignActorRole } from '@/lib/assignment/same-team';
import type { GlanceAssignable } from '@/lib/glance/actions';
import { assistantMessage, findCriticalRedHits } from './assistant';
import PersonSurface, { type PersonSurfaceProps } from './PersonSurface';
import {
  criticalStripClauses,
  criticalStripText,
  STRIP_TONE,
  stripLabel,
  summaryClauses,
  summarySentence,
  unassignedDoorHref,
  unassignedDoorText,
  whyLineFor,
} from './strip';

interface GlanceBoardProps {
  glance: EventGlance;
  eventName: string;
  /**
   * The viewer's own authority on this event, straight from `requireEventRole`. Phase 4
   * needs it because GTC-256 Ruling 9's self-pick is conditioned on the ACTOR, not only on
   * the assignee — a coordinator gets no exemption. It is a prop rather than a payload
   * field because it is a fact about who is looking, not about the board.
   */
  actorRole: AssignActorRole;
  /** Formatted date for the reminder copy. The page owns the formatting. */
  eventDate: string;
}

/**
 * What the surface hands to `reassignCandidates` — every person on the event, filtered by
 * nothing.
 *
 * ⚠ NOTHING IS FILTERED OUT HERE, AND THAT IS THE POINT. `mayHoldRow`
 * (`src/lib/assignment/same-team.ts`) is the ONLY eligibility rule an assignment has, and
 * it is applied per row inside the surface. In particular a CHILD-role person stays in the
 * pool: GTC-207 pins that a "kid with a job" is assignment-eligible by design and that the
 * §10.6 message exclusion must never be borrowed as an assignment gate. Adding a filter
 * here would be that mistake, one layer further out.
 */
function assignablePool(glance: EventGlance): GlanceAssignable[] {
  return [...glance.households.flatMap((h) => h.members), ...glance.unhoused].map((p) => ({
    personId: p.personId,
    name: p.name,
    role: p.role,
    teamId: p.teamId,
    // Ruling 18 reads this, and only for OUT. Carried here rather than filtered here so the
    // decision stays in one place, next to the same-team rule it sits above.
    state: p.state,
  }));
}

/**
 * What every strip says, whichever element carries it.
 *
 * Ruling 4: a red carries its why on the same line; everything else is the bare name. Held
 * apart from the element so a door and a plain strip cannot drift into looking different.
 */
function StripBody({ person }: { person: GlancePerson }) {
  const why = whyLineFor(person);
  return (
    <>
      <span>{stripLabel(person)}</span>
      {why ? <span className="font-normal">{` — ${why}`}</span> : null}
    </>
  );
}

/**
 * One person's strip — a door if it is red, a label if it is not.
 *
 * `data-strip-state` is the assertable form of the tint — a test that reads a hex is
 * reading the design, and a test that reads this is reading the decision. Phase 4 adds
 * `data-strip-door` alongside it, on the reds only.
 *
 * ⚠ THE TWO BRANCHES SHARE ONE CLASS STRING. The door is a `<button>` and the rest are
 * `<div>`s, and they must be indistinguishable to look at: `block w-full text-left` is the
 * whole difference, undoing the element's own inline centring. Anything more is phase 7.
 */
function Strip({
  person,
  action,
}: {
  person: GlancePerson;
  action: Omit<PersonSurfaceProps, 'person' | 'className' | 'children'>;
}) {
  const className = `rounded-md px-2.5 py-1.5 text-[13px] leading-snug ${STRIP_TONE[person.state].className}`;

  if (person.state !== 'RED') {
    return (
      <div data-strip-state={person.state} className={className}>
        <StripBody person={person} />
      </div>
    );
  }

  return (
    <PersonSurface person={person} className={className} {...action}>
      <StripBody person={person} />
    </PersonSurface>
  );
}

/**
 * A card. Neutral by ruling — no tint of its own, at any member count.
 *
 * The label is the household's primary contact. Households carry no name column, and the
 * existing surface (`HouseholdCardList`) titles them the same way; the mockup's surnames
 * ("Turner", "Aunt June") are a naming derivation no data supports, so the real name is
 * shown rather than a guess at a family name.
 */
function HouseholdCard({
  household,
  action,
}: {
  household: GlanceHousehold;
  action: Omit<PersonSurfaceProps, 'person' | 'className' | 'children'>;
}) {
  return (
    <div data-household-card={household.householdId} className="rounded-lg bg-[#f5f4ef] p-2.5">
      <p className="m-0 mb-1.5 text-[12px] font-medium text-[#5f5e5a]">
        {household.primaryContactName ?? 'Household'}
      </p>
      <div className="flex flex-col gap-1">
        {household.members.map((person) => (
          <Strip key={person.personEventId} person={person} action={action} />
        ))}
      </div>
    </div>
  );
}

export default function GlanceBoard({ glance, eventName, actorRole, eventDate }: GlanceBoardProps) {
  // Everything a red strip's door needs, assembled once. The pool is the same array for
  // every island; see PersonSurface's header for the trade that buys.
  const action = {
    eventId: glance.eventId,
    eventName,
    eventDate,
    hostPersonId: glance.hostPersonId,
    actorRole,
    pool: assignablePool(glance),
  };

  const { lead, rest } = summaryClauses(glance.summary);
  const critical = criticalStripClauses(glance.unassignedCritical);
  const door = critical ? unassignedDoorText(glance.unassignedOrdinaryCount) : null;
  const assistant = assistantMessage(findCriticalRedHits(glance));

  return (
    <main className="mx-auto w-full max-w-[960px] px-4 py-8">
      <div className="rounded-xl border-[0.5px] border-[#dcdad2] bg-[#ffffff] p-5">
        <p className="m-0 text-[13px] text-[#888780]">
          {eventName}
          {` · ${glance.households.length} households`}
        </p>

        {/*
          Ruling 2. The whole sentence also rides on `data-summary` so a screen reader and
          a test both get it in one piece, rather than reassembling it from two elements.
        */}
        <p
          data-summary={summarySentence(glance.summary)}
          className="mt-1 mb-0 text-[17px] text-[#2c2c2a]"
        >
          <span className="font-medium text-[#A32D2D]">{lead}</span>
          {rest ? ` ${rest}` : null}
        </p>

        {/*
          Ruling 8: unassigned criticals, ABOVE the grid. They have no holder, so
          person-primary gives them no home, and an ownerless critical is the host's move.

          THE STRIP IS ABSENT WHEN THERE IS NOTHING TO SAY — no all-clear banner. And the
          door hangs off the strip rather than standing alone: "and N more unassigned" is a
          continuation, and with no ownerless critical the glance stays quiet about what can
          wait, which is Ruling 8's own sentence.

          The summary above is UNTOUCHED by any of this. It counts people; a loose item is
          not one.
        */}
        {critical ? (
          <div className="mt-3">
            <p
              data-critical-strip={criticalStripText(glance.unassignedCritical) ?? ''}
              className="m-0 rounded-lg bg-[#FCEBEB] px-3 py-2 text-[13px] text-[#A32D2D]"
            >
              <span className="font-medium">{critical.lead}</span>
              {` — ${critical.names}`}
            </p>
            {door ? (
              <a
                data-unassigned-door=""
                href={unassignedDoorHref(glance.eventId)}
                className="mt-1.5 inline-block text-[12px] text-[#888780] underline underline-offset-2"
              >
                {door}
              </a>
            ) : null}
          </div>
        ) : null}

        {/*
          §3's one plain assistant message, BETWEEN the strip and the grid.

          Two objects, not one. The strip is about criticals with NO owner; this is about a
          critical with the WRONG one — the most important thing on the board, in the hands
          of someone only the host can reach. Folding them into a single red block would
          make one band say two different things.

          AND IT IS NOT A SECOND FILLED BAND, deliberately. Two stacked danger fills would
          dilute the strip exactly as a second alarm dilutes the first; this carries the
          same red as text and a rule, so the strip stays the only filled band above the
          grid. `tests/glance-grid-test.tsx` counts them. ⚠ The Scope line calling this
          "banner-class, the only one the surface has" predates Ruling 8, which added the
          strip above it — the "only one" is no longer literally available, and the
          weighting here is what replaces it.
        */}
        {assistant ? (
          <p
            data-assistant-message={assistant}
            className="mt-3 mb-0 border-l-2 border-[#A32D2D] pl-3 text-[13px] leading-snug text-[#A32D2D]"
          >
            {assistant}
          </p>
        ) : null}

        {/*
          Ruling 5: green never folds, at any event size. This grid grows; nothing in it
          collapses to a count, so a 60-person household is 60 strips.
        */}
        <div className="mt-4 grid items-start gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
          {glance.households.map((household) => (
            <HouseholdCard key={household.householdId} household={household} action={action} />
          ))}

          {/*
            People with no household. Phase 1 surfaces them separately rather than filing
            them into an invented card, and phase 2 has to put them somewhere: a final card
            of their own, visually identical, labelled for what it is. STILL NOT A RULING —
            it is the least-committing thing that keeps everyone on the board.
          */}
          {glance.unhoused.length > 0 ? (
            <div data-unhoused-card="" className="rounded-lg bg-[#f5f4ef] p-2.5">
              <p className="m-0 mb-1.5 text-[12px] font-medium text-[#5f5e5a]">
                Not in a household
              </p>
              <div className="flex flex-col gap-1">
                {glance.unhoused.map((person) => (
                  <Strip key={person.personEventId} person={person} action={action} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
