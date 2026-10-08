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
 * ⚠ THE STRIP IS STYLED AS A DOOR WHEN IT IS ONE — RULING 35, 2026-09-11. Border, chevron,
 * pointer cursor and hover dim on every strip that opens something; nothing on the two that
 * open nothing. Phase 4 shipped the red door deliberately unstyled and said so here until this
 * ruling; the sentence is replaced rather than left standing. The rule is `panelFor`, not a
 * list of states, so the promise and the routing cannot drift apart.
 *
 * ⚠ THERE IS NO VARIANT SWITCH — RULING 36. Phase 7 tested six presentations behind
 * `?variant=`; four were ruled against and the switch itself is deleted, because "a switch
 * left in the tree is a variant nobody ruled on." One board, no flag.
 *
 * ⚠ THE REPLAY AND THE POLLING ARE ISLANDS BESIDE THIS FILE, NOT IN IT (phase 6). This is
 * still a server component with no hooks and no timer: `GlanceReplay` walks the arrival replay
 * and `GlanceLive` polls, and both repaint strips they do not own, finding them by the
 * `data-person-event-id` below. Nothing here refreshes itself.
 *
 * ⚠ SUPERSEDED, NOT DELETED: until slice 6e this line read "an action that leaves the board
 * stale says so rather than repainting." Ruling 25 replaced that copy with the board being
 * right — an action now triggers an immediate refresh instead of announcing staleness.
 *
 * ⚠ THE MOCKUP'S META LINE CARRIES A COUNTDOWN ("12 days to go") AND THIS DOES NOT.
 * Moment 4 §3 refuses a countdown outright, and Ruling 1's general test — "anything that
 * would make the host lean in does not belong on this screen" — is the reason to drop it
 * rather than inherit it. The mockup is the picture, not the specification, on that line.
 *
 * ⚠ 2026-10-06, [[GTC-366]] (item 8) — RELAXED FOR TWO EVENT FACTS, ON THE FOUNDER'S RULING, AND
 * FOR NOTHING ELSE. At the walkthrough sort (GTC-189's Fourth ruling, 2026-10-05): *"When answers
 * are due (“Answers by Fri 18 Dec”)"*, and *"Days to teh event as a button the host can click to
 * see if htey want"*. So the top line says when answers are due once the invitations have gone,
 * and the days to the event sit behind "Days to go", a native disclosure closed on every visit —
 * no hook, no timer. Both are the PAGE's props, worked out by `src/lib/events/event-dates.ts`;
 * neither is in the glance payload, and dates for people stay fenced.
 *
 * [[GTC-366]] also adds, below the households, the key to the colours (item 9, behind "What the
 * colours mean") and, among the doors, "Print the list" (item 11) — an island of its own,
 * `PrintListDoor`, so this file still holds no hook and no fetch.
 *
 * [[GTC-368]] — the event's name opens its details (item 17): the WHOLE top line is the button,
 * so its words stay one run (Q15), and the details' panel sits after the doors, so the first link
 * to the old dashboard is still "Invites & people". Both are islands (`EventDetails`), so this file
 * still holds no hook. And what Moment 4 does, in the founder's words (item 5), behind a closed
 * "What this does" above the key, for Ruling 1: nothing here makes her lean in unless she asks.
 */

import type { EventGlance, GlanceHousehold, GlancePerson } from '@/lib/glance/state';
import type { AssignActorRole } from '@/lib/assignment/same-team';
import type { GlanceAssignable } from '@/lib/glance/actions';
import { assistantMessage, findCriticalRedHits } from './assistant';
import PersonSurface, { type PersonSurfaceProps } from './PersonSurface';
import GlancePersonReading from './GlancePersonReading';
import { readingPanelFor } from './reading';
import PrintListDoor from './PrintListDoor';
import {
  COLOUR_KEY,
  COLOUR_KEY_BUTTON,
  criticalStripClauses,
  criticalStripText,
  DOOR_CHEVRON,
  DOOR_CHEVRON_CLASS,
  doorTreatmentFor,
  doorTreatmentReaches,
  panelFor,
  overlayReversal,
  STRIP_TONE,
  STRIP_WORDS_CLASS,
  stripStateWords,
  summaryClauses,
  summarySentence,
  unassignedDoorHref,
  unassignedDoorText,
} from './strip';
import { CHASE_DOOR_LINK, chaseDoorHref } from '@/lib/preflight/after-press-words';
import { BACK_ROOM_LINK, PLAN_DOOR_LINK, backRoomHref, planDoorHref } from '@/lib/events/home-href';
import { ANSWERS_BY, DAYS_TO_GO_BUTTON } from '@/lib/events/event-dates';
import {
  EventDetailsButton,
  EventDetailsPanel,
  type EventDetailsFacts,
} from '@/components/shared/EventDetails';
import { MOMENT_HEADINGS, MOMENT_WORDS } from '@/lib/moments/moment-words';

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
  /**
   * RULING 23 — the reversals THIS VIEWER has not been shown yet, by `personEventId`.
   *
   * A PROP RATHER THAN A PAYLOAD FIELD, for the same reason `actorRole` is one: it is a fact
   * about who is looking, not about the board. `readEventGlance` stays viewer-agnostic, which
   * is what lets 6e's ~20-second poll refresh the board from the same assembly.
   *
   * The page derives it from `replay.steps`, the same array it derives `hasReplay` from — so a
   * board can never be overlaid without the replay that lifts the overlay being on it too.
   * Empty on almost every visit, which is the common case and costs nothing.
   */
  stickyReversals: readonly string[];
  /**
   * RULING 34 — the instant the reading panel's nudge day is read against.
   *
   * A PROP, not `new Date()` inside the render, so the line is a pure function of inputs and
   * the tests can pin what it says at a fixed moment rather than at whatever the suite happened
   * to run at.
   *
   * ⚠ WHAT USED TO SIT BESIDE IT: a `variant` prop, and phase 7's six presentations behind it.
   * RULING 36 deleted the switch — "a switch left in the tree is a variant nobody ruled on."
   */
  now?: Date;
  /**
   * [[GTC-329]], ruled 2026-09-29 — THE BOARD'S WAY BACK TO WHO IS CHASED, after the press only.
   *
   * The don't-chase grey is sealed by GTC-192 Ruling 17, whose second sentence is the reason that
   * is defensible: *"The don't-chase mark is revisited where it is set (the pre-flight), not
   * here."* After the press nothing on the board led there, so the sealed strip was a dead end.
   * This link is the way to that place — not a door on any strip, which stay as Ruling 17 has them.
   *
   * A PROP, like `actorRole`: whether the event is sent is read by the page, and the payload stays
   * as it is. Absent means before the press, so every existing render is unchanged.
   */
  afterPress?: boolean;
  /**
   * [[GTC-366]] (item 8, Q5 to Q7) — when answers are due, already written ("Fri 18 Dec"). The page
   * passes it after the press only, until that day has passed. Absent means nothing is said.
   */
  answersBy?: string | null;
  /** [[GTC-366]] (item 8, Q8) — what "Days to go" shows ("12 days to go."). Absent means no button. */
  daysToGo?: string | null;
  /** [[GTC-366]] (item 11) — the event's date as the print shows it, for "Print the list". */
  printDate?: string;
  /**
   * [[GTC-368]] (item 17) — the event's own facts, for its details. A prop, like the two dates
   * above: the page reads them, and the payload stays as it is. Absent, the top line is plain.
   */
  details?: EventDetailsFacts;
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
 *
 * ⚠ PHASE 6 SLICE 6c SPLITS THE NAME FROM THE STATE-WORDS, AND THE TEXT IS UNCHANGED. Ruling
 * 7's "— out" used to live inside the name span; it is now beside it, in the same span Ruling
 * 4's why already used, because the two are one thing: the half of the strip that describes
 * the person's state NOW. The arrival replay rewinds the TINT and cannot rewind the WORDS, so
 * the island suppresses them while a step is pending — *"a green strip reading 'out' is
 * incoherent and the words are the truthful half."* `data-strip-words` is how it finds them.
 */
function StripBody({ person }: { person: GlancePerson }) {
  const words = stripStateWords(person);
  /*
    RULING 35 — the chevron half of the door treatment, on every strip that opens something.

    AN ELEMENT, NOT A `::after`. `setWords` in `paint.ts` appends the state-words span to the
    strip when a live poll gives a strip words it did not have; a chevron rendered as a
    trailing element would then sit BEFORE those words. It is absolutely positioned instead, so
    DOM order cannot decide what the strip reads. `aria-hidden`, because it is decoration and
    the door is already a `<button>`.

    ⚠ WHAT USED TO BE HERE: RULING 33's clock-line, in two forms. Both are deleted and the
    guard that forbade them is restored verbatim. The fact lives in the reading panel now.
  */
  const chevron = doorTreatmentReaches(person);
  return (
    <>
      <span>{person.name}</span>
      {words ? <span data-strip-words="" className={STRIP_WORDS_CLASS}>{` ${words}`}</span> : null}
      {chevron ? (
        <span data-strip-chevron="" aria-hidden="true" className={DOOR_CHEVRON_CLASS}>
          {DOOR_CHEVRON}
        </span>
      ) : null}
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
 * ⚠ PHASE 6 SLICE 6c ADDS `data-person-event-id`, AND IT IS A HANDLE, NOT A STATE. The
 * arrival replay is one client island beside this board (`GlanceReplay.tsx`) rather than a
 * wrapper around every strip, because wrapping would hydrate sixty-four components on the
 * oversized board to animate five of them. An island that paints strips it does not own has
 * to be able to find them, and this is how. NOTHING HERE HYDRATES BECAUSE OF IT: the board is
 * still a server component with no hooks, which is the property phase 2 built it for.
 *
 * ⚠ THE TWO BRANCHES SHARE ONE CLASS STRING. The door is a `<button>` and the rest are
 * `<div>`s, and they must be indistinguishable to look at: `block w-full text-left` is the
 * whole difference, undoing the element's own inline centring. Anything more is phase 7.
 */
function Strip({
  person: derived,
  action,
  sticky,
  now,
}: {
  person: GlancePerson;
  action: Omit<PersonSurfaceProps, 'person' | 'className' | 'children'>;
  sticky: ReadonlySet<string>;
  now: Date;
}) {
  /*
    RULING 23's OVERLAY, APPLIED ONCE AND HERE.

    "The sticky red is an OVERLAY on top of the ordinary derivation. Playing the replay removes
    the overlay; what is revealed is whatever the person's state already derives to underneath."
    `derived` is that underneath and is never edited — `overlayReversal` returns a new object.

    ⚠ ONE SITE, DELIBERATELY, AND IT IS ABOVE THE ELEMENT BRANCH. The tint, the words and the
    door all read `person` below, so applying the overlay here is what makes them agree. Applied
    twice — once for the tone, once for the element — is a red strip that is not a door, which
    would be the first red on this board Ruling 17 does not reach.

    ⚠ AND IT IS APPLIED HERE RATHER THAN TO THE PAYLOAD. Ruling 2's summary sentence, §3's
    assistant message, Ruling 8's alert strip and phase 4's reassign pool all read `glance`
    itself and are UNCHANGED by the overlay — three of those are separate rulings and the fourth
    is Ruling 18, and widening one overlay into them would settle four unruled questions by
    stealth. `tests/glance-grid-test.tsx` asserts the identity of all three rendered objects
    across an overlaid and an unoverlaid board.
  */
  const person = sticky.has(derived.personEventId) ? overlayReversal(derived) : derived;
  /*
    PHASE 7, VARIANT B — the treatment, APPENDED AFTER THE TONE AND NEVER MIXED INTO IT.

    `paintStrip` (`paint.ts`) swaps a tint by substituting `STRIP_TONE[from].className` for
    `STRIP_TONE[to].className` as a CONTIGUOUS SUBSTRING of this string, and leaves it alone if
    it cannot find it. Appending keeps the tone contiguous, so a live repaint still works under
    every state. Interleaving would silently stop the board animating.

    ⚠ AND IT IS THE SAME STRING FOR ALL THREE BRANCHES BELOW, WHICH IS RULING 35's own fence:
    the treatment is handed out by `panelFor` and so is the element, so a strip cannot wear the
    promise of a door without having one, or have one without wearing it.
  */
  const treatment = doorTreatmentFor(person);
  const className =
    `rounded-md px-2.5 py-1.5 text-[13px] leading-snug ${STRIP_TONE[person.state].className}` +
    (treatment ? ` ${treatment}` : '');

  /*
    RULING 32 — WHICH ROOM, asked once, of one function.

    The branch used to BE Ruling 17: only a red is a door, written as a literal here. It is
    still true of the ACTING room, and `panelFor` is where that lives now — so "only a red is a
    door" cannot be true in the ticket and false in the component, and Ruling 35's treatment
    reads the same answer rather than a second list.

    ⚠ THE COST IS STRUCTURAL AND IS SMALLER THAN IT LOOKS. Phase 4 took the island trade on the
    stated basis that "on the oversized board (64 settled people, no reds) nothing here hydrates
    at all". That is now false — every green and amber strip hydrates — but it hydrates
    `GlancePersonReading`, which is handed a narrowed payload and NO candidate pool, so the
    per-strip cost is a name, a word, a weekday and its rows rather than the whole board's
    assignable list. `GlanceBoard` itself still has no hooks, which is phase 2's property and
    not a slice's to retire.
  */
  const panel = panelFor(person);

  if (panel === null) {
    return (
      <div
        data-strip-state={person.state}
        data-person-event-id={person.personEventId}
        className={className}
      >
        <StripBody person={person} />
      </div>
    );
  }

  if (panel === 'reading') {
    return (
      <GlancePersonReading
        panel={readingPanelFor(person, now)}
        personEventId={person.personEventId}
        state={person.state}
        className={className}
      >
        <StripBody person={person} />
      </GlancePersonReading>
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
  sticky,
  now,
}: {
  household: GlanceHousehold;
  action: Omit<PersonSurfaceProps, 'person' | 'className' | 'children'>;
  sticky: ReadonlySet<string>;
  now: Date;
}) {
  return (
    <div data-household-card={household.householdId} className="rounded-lg bg-[#f5f4ef] p-2.5">
      <p className="m-0 mb-1.5 text-[12px] font-medium text-[#5f5e5a]">
        {household.primaryContactName ?? 'Household'}
      </p>
      <div className="flex flex-col gap-1">
        {household.members.map((person) => (
          <Strip
            key={person.personEventId}
            person={person}
            action={action}
            sticky={sticky}
            now={now}
          />
        ))}
      </div>
    </div>
  );
}

export default function GlanceBoard({
  glance,
  eventName,
  actorRole,
  eventDate,
  stickyReversals,
  // RULING 34's clock. See `GlanceBoardProps` above.
  now = new Date(),
  afterPress = false,
  answersBy = null,
  daysToGo = null,
  printDate = '',
  details,
}: GlanceBoardProps) {
  // Ruling 23. A set, so the lookup in `Strip` is one place and one operation at any headcount.
  const sticky: ReadonlySet<string> = new Set(stickyReversals);
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
        {/*
          [[GTC-366]] (item 8) — W2 on the top line, and W3's button beside it: a native disclosure,
          closed on every visit, so the days to the event show only when she asks (Q8).
        */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {details ? (
            <EventDetailsButton
              facts={details}
              className="m-0 border-0 bg-transparent p-0 text-left text-[13px] text-[#888780] cursor-pointer hover:text-[#2c2c2a]"
            >
              {eventName}
              {` · ${glance.households.length} households`}
              {answersBy ? ` · ${ANSWERS_BY} ${answersBy}` : null}
            </EventDetailsButton>
          ) : (
            <p className="m-0 text-[13px] text-[#888780]">
              {eventName}
              {` · ${glance.households.length} households`}
              {answersBy ? ` · ${ANSWERS_BY} ${answersBy}` : null}
            </p>
          )}
          {daysToGo ? (
            <details data-days-to-go="" className="text-[13px]">
              <summary className="cursor-pointer list-none text-[12px] text-[#888780] underline underline-offset-2 [&::-webkit-details-marker]:hidden">
                {DAYS_TO_GO_BUTTON}
              </summary>
              <p className="m-0 mt-0.5 text-[#2c2c2a]">{daysToGo}</p>
            </details>
          ) : null}
        </div>

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
            <HouseholdCard
              key={household.householdId}
              household={household}
              action={action}
              sticky={sticky}
              now={now}
            />
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
                  <Strip
                    key={person.personEventId}
                    person={person}
                    action={action}
                    sticky={sticky}
                    now={now}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/*
          [[GTC-366]] (item 9) — the key, Q10 A: behind "What the colours mean", below the households
          and above the doors. Each row wears its state's own tone (Q11) and is not a strip: no
          `data-strip-state`, no person, no door, so the replay, the poll and the counts never meet it.
        */}
        {/*
          [[GTC-368]] (item 5, Q10's A) — Moment 4's words, closed on every visit, above the key.
        */}
        <details data-moment-words="" className="mt-4">
          <summary className="inline-block cursor-pointer list-none text-[12px] text-[#888780] underline underline-offset-2 [&::-webkit-details-marker]:hidden">
            {MOMENT_HEADINGS.DOES}
          </summary>
          <div className="mt-2 max-w-[520px] text-[13px] leading-snug text-[#2c2c2a]">
            <p className="m-0 mb-2">{MOMENT_WORDS[4].does}</p>
            <p className="m-0 text-[12px] text-[#888780]">{MOMENT_HEADINGS.DONE}</p>
            <p className="m-0 mt-0.5">{MOMENT_WORDS[4].done}</p>
          </div>
        </details>

        <details data-colour-key="" className="mt-4">
          <summary className="inline-block cursor-pointer list-none text-[12px] text-[#888780] underline underline-offset-2 [&::-webkit-details-marker]:hidden">
            {COLOUR_KEY_BUTTON}
          </summary>
          <div className="mt-2 flex max-w-[420px] flex-col gap-1">
            {COLOUR_KEY.map((row) => (
              <p
                key={row.state}
                data-colour-key-row={row.state}
                className={`m-0 rounded-md px-2.5 py-1.5 text-[13px] leading-snug ${STRIP_TONE[row.state].className}`}
              >
                {row.words}
              </p>
            ))}
          </div>
        </details>

        {/* [[GTC-329]] — below the grid, quiet, after the press only. See `afterPress` above. */}
        {afterPress ? (
          <a
            data-chase-door=""
            href={chaseDoorHref(glance.eventId)}
            className="mt-4 inline-block text-[12px] text-[#888780] underline underline-offset-2"
          >
            {CHASE_DOOR_LINK}
          </a>
        ) : null}

        {/*
          [[GTC-357]] R1 — the board's ways out: "The plan, Moment 3 and "Who I chase" are reached
          from there." Beside GTC-329's door, quiet, below the grid (plan Q4), and before the press
          as well as after. Plain links, so the board keeps its no-hooks property; navigation, not
          an action on a strip (Moment 4 spec: the surface shows states, the tap holds actions).
        */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <a
            data-plan-door=""
            href={planDoorHref(glance.eventId)}
            className="inline-block text-[12px] text-[#888780] underline underline-offset-2"
          >
            {PLAN_DOOR_LINK}
          </a>
          <a
            data-back-room-door=""
            href={backRoomHref(glance.eventId)}
            className="inline-block text-[12px] text-[#888780] underline underline-offset-2"
          >
            {BACK_ROOM_LINK}
          </a>
          {/* [[GTC-366]] (item 11, Q12) — the print for the fridge, in one tap. */}
          <PrintListDoor
            eventId={glance.eventId}
            eventName={eventName}
            printDate={printDate}
            className="inline-block cursor-pointer text-[12px] text-[#888780] underline underline-offset-2"
          />
        </div>

        {/* [[GTC-368]] (item 17, Q15) — the details, after the doors (board-door C4). */}
        {details ? <EventDetailsPanel facts={details} /> : null}
      </div>
    </main>
  );
}
