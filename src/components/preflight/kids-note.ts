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
