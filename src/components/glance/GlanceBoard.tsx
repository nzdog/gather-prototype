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
 * Tap-for-actions is PHASE 4 — the strips are not buttons and carry no handler, and the
 * only link on the surface is Ruling 8's door, which leaves the board rather than acting on
 * it. The replay and polling are PHASE 6. The
 * amber clock-line and the strip-as-button shape are PHASE 7's variants, and shipping
 * either as the default would settle an unruled decision by stealth.
 *
 * ⚠ THE MOCKUP'S META LINE CARRIES A COUNTDOWN ("12 days to go") AND THIS DOES NOT.
 * Moment 4 §3 refuses a countdown outright, and Ruling 1's general test — "anything that
 * would make the host lean in does not belong on this screen" — is the reason to drop it
 * rather than inherit it. The mockup is the picture, not the specification, on that line.
 */

import type { EventGlance, GlanceHousehold, GlancePerson } from '@/lib/glance/state';
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
}

/**
 * One person's strip.
 *
 * Ruling 4: a red carries its why on the same line; everything else is the bare name.
 * `data-strip-state` is the assertable form of the tint — a test that reads a hex is
 * reading the design, and a test that reads this is reading the decision.
 */
function Strip({ person }: { person: GlancePerson }) {
  const why = whyLineFor(person);
  return (
    <div
      data-strip-state={person.state}
      className={`rounded-md px-2.5 py-1.5 text-[13px] leading-snug ${STRIP_TONE[person.state].className}`}
    >
      <span>{stripLabel(person)}</span>
      {why ? <span className="font-normal">{` — ${why}`}</span> : null}
    </div>
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
function HouseholdCard({ household }: { household: GlanceHousehold }) {
  return (
    <div data-household-card={household.householdId} className="rounded-lg bg-[#f5f4ef] p-2.5">
      <p className="m-0 mb-1.5 text-[12px] font-medium text-[#5f5e5a]">
        {household.primaryContactName ?? 'Household'}
      </p>
      <div className="flex flex-col gap-1">
        {household.members.map((person) => (
          <Strip key={person.personEventId} person={person} />
        ))}
      </div>
    </div>
  );
}

export default function GlanceBoard({ glance, eventName }: GlanceBoardProps) {
  const { lead, rest } = summaryClauses(glance.summary);
  const critical = criticalStripClauses(glance.unassignedCritical);
  const door = critical ? unassignedDoorText(glance.unassignedOrdinaryCount) : null;

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
          Ruling 5: green never folds, at any event size. This grid grows; nothing in it
          collapses to a count, so a 60-person household is 60 strips.
        */}
        <div className="mt-4 grid items-start gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
          {glance.households.map((household) => (
            <HouseholdCard key={household.householdId} household={household} />
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
                  <Strip key={person.personEventId} person={person} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
