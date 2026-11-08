/**
 * [[GTC-396]] item 6 (founder, 21 Oct 2026): "Have a note on who the kids are in the nudge
 * household screen." One short line per household with children on the pre-flight's households
 * step, "Kids: Josh, Mere": the members the step's existing read already carries whose
 * `householdRole` is CHILD, named as the page holds them, in the page's order (the route sorts a
 * household's members by role, then name). A household without children gets nothing (null). The
 * host's own household gets it too. The "+ N kids without jobs" line beside it is `littleCount`,
 * the unnamed little ones, and is not this.
 *
 * Here, not in src/lib/preflight, so that library differs from demo-tweaks-2-good by item 7's two
 * label lines alone. No route, read or schema is touched.
 */
export const KIDS_NOTE_WORDS = {
  KIDS: 'Kids:',
} as const;

export interface KidsNoteMember {
  name: string;
  householdRole: string | null;
}

/** "Kids: Josh, Mere", or null when the household has no child among its members. */
export function kidsNote(members: ReadonlyArray<KidsNoteMember>): string | null {
  const names = members
    .filter((m) => m.householdRole === 'CHILD')
    .map((m) => m.name.trim())
    .filter((n) => n.length > 0);
  return names.length === 0 ? null : `${KIDS_NOTE_WORDS.KIDS} ${names.join(', ')}`;
}

/**
 * [[GTC-449]] S2.5 (rulings 3, 14, 21, 22 and 28) — step 3 says which kids are on "Decide later".
 * Gather does not message a kid saved that way, so the host is told before she sends. All three
 * sentences were ruled word for word (W5, W6 and W7); this adds none. They are read-only: no link,
 * no button, and the names are plain text. Send is never blocked by them.
 *
 *   W5  "Decide later: Josh, Mere"    in an open household, under the "Kids:" line
 *   W6  the warning that goes with it, under W5
 *   W7  "1 kid is still on decide later." / "{n} kids are still on decide later." on step 3's row
 *
 * A kid counts when the household role is CHILD and the marker is exactly true. A kid with no name
 * is still counted by W7 and still warned about by W6 (the warning is never hidden); W5 simply has
 * no name to list for them (the founder's answer, 8 Nov 2026). The apostrophe in W6 is the straight
 * one, as the ticket prints it.
 */
export const DECIDE_LATER_NOTE_WORDS = {
  LABEL: 'Decide later:',
  WARNING: "Gather won't message them unless you change this in their household.",
  ROW_ONE: '1 kid is still on decide later.',
  ROW_MANY: (n: number) => `${n} kids are still on decide later.`,
} as const;

export interface DecideLaterNoteMember extends KidsNoteMember {
  /** The marker, as the pre-flight route returns it; a view built without it reads as no. */
  messagingUndecided?: boolean;
}

const onDecideLater = (members: ReadonlyArray<DecideLaterNoteMember>) =>
  members.filter((m) => m.householdRole === 'CHILD' && m.messagingUndecided === true);

/**
 * W5 and W6 for one household: `names` is "Decide later: Josh, Mere" (null when none of the kids on
 * decide later has a name), `warning` is W6. Null when the household has no kid on decide later.
 */
export function decideLaterNote(
  members: ReadonlyArray<DecideLaterNoteMember>
): { names: string | null; warning: string } | null {
  const kids = onDecideLater(members);
  if (kids.length === 0) return null;
  const names = kids.map((m) => m.name.trim()).filter((n) => n.length > 0);
  return {
    names: names.length === 0 ? null : `${DECIDE_LATER_NOTE_WORDS.LABEL} ${names.join(', ')}`,
    warning: DECIDE_LATER_NOTE_WORDS.WARNING,
  };
}

/** W7 for step 3's row: the kids on decide later across all the households, or null for none. */
export function decideLaterRowLine(
  households: ReadonlyArray<{ members: ReadonlyArray<DecideLaterNoteMember> }>
): string | null {
  const n = households.reduce((sum, h) => sum + onDecideLater(h.members).length, 0);
  if (n === 0) return null;
  return n === 1 ? DECIDE_LATER_NOTE_WORDS.ROW_ONE : DECIDE_LATER_NOTE_WORDS.ROW_MANY(n);
}
