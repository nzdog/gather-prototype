/**
 * [[GTC-395]] item 4 — "WHO SHOULD GATHER TALK TO FOR THE KIDS IN THIS HOUSEHOLD?": THIS
 * HOUSEHOLD'S ADULTS ONLY. Founder's ruling, 20 Oct 2026, for his reason: the full list confused
 * him. It reverses, on purpose, the cross-household list of GTC-172 C1 (kept as GTC-363 item 6 and
 * GTC-384 Q4).
 *
 * The choices under the default ("… (main contact)", drawn by each screen as before) are the adults
 * of the household being edited, never its main contact (the default is her) and never a child. An
 * existing pick of someone in another household (or in none) still works, so it stays as one more
 * choice, labelled as the picker always labelled it, while it is the pick; once changed away it is
 * gone. What is stored, and the routes that check it, are not touched: this is the screens' list.
 */

export interface ChannelChoice {
  personEventId: string;
  label: string;
}

/** A person Moment 1's setup page offers (every household's non-child members). */
interface Moment1Candidate {
  personEventId: string;
  name: string;
  householdName: string;
  householdId: string;
}

/** A form row: the partner, a helper (a child unless ticked as an adult) or a guest. */
interface FormMember {
  personEventId?: string;
  name?: string;
  adultRoled?: boolean;
}

/**
 * Moment 1's edit-household form. The household's adults come from the form itself (its partner,
 * its guests, its helpers ticked as adults), each once it has been saved: the page's candidate list
 * is read once when Moment 1 opens and never after a save, so it may not hold them yet.
 */
export function moment1ChannelChoices(form: {
  householdId: string | undefined;
  partner: FormMember | null;
  helpers: FormMember[];
  guests: FormMember[];
  picked: string | null;
  candidates: Moment1Candidate[];
}): ChannelChoice[] {
  const adults: ChannelChoice[] = [
    ...(form.partner ? [form.partner] : []),
    ...form.guests,
    ...form.helpers.filter((m) => m.adultRoled === true),
  ]
    .filter((m): m is FormMember & { personEventId: string } => !!m.personEventId)
    .map((m) => ({ personEventId: m.personEventId, label: (m.name ?? '').trim() }));
  const kept = form.candidates.find(
    (c) =>
      c.personEventId === form.picked &&
      c.householdId !== form.householdId &&
      !adults.some((a) => a.personEventId === c.personEventId)
  );
  return kept
    ? [
        ...adults,
        {
          personEventId: kept.personEventId,
          label: `${kept.name} — ${kept.householdName}’s household`,
        },
      ]
    : adults;
}

/** A person the pre-flight read offers (every non-child member, with their household's label). */
interface PreflightCandidate {
  personEventId: string;
  name: string;
  householdId: string | null;
  householdLabel: string | null;
}

/** The pre-flight's step 3: this household's candidates but its main contact, plus a kept pick. */
export function preflightChannelChoices(
  household: {
    id: string;
    contactPersonEventId: string | null;
    members: Array<{ personEventId: string; householdRole: string | null }>;
  },
  candidates: PreflightCandidate[]
): ChannelChoice[] {
  const primary = household.members.find(
    (m) => m.householdRole === 'PRIMARY_CONTACT'
  )?.personEventId;
  return candidates
    .filter(
      (c) =>
        c.personEventId !== primary &&
        (c.householdId === household.id || c.personEventId === household.contactPersonEventId)
    )
    .map((c) => ({
      personEventId: c.personEventId,
      label:
        c.householdId === household.id
          ? c.name
          : c.householdLabel
            ? `${c.name} — ${c.householdLabel}’s household`
            : `${c.name} — not in a household`,
    }));
}
