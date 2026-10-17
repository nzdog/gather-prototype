/**
 * GTC-363 (item 6) — the line under "Who should Gather talk to for the kids in this household?"
 * ([[GTC-384]] item 63's words), on Moment 1 and on the pre-flight. The founder's words, ruled "Use it as written" (GTC-189's Fourth ruling)
 * and W1 of GTC-363's plan rulings. Held once so the two screens cannot drift apart.
 *
 * TRUE OF WHAT GATHER DOES, checked against `src/lib/eligibility/channel-chooser.ts` (GTC-363's
 * suite, 6T1 to 6T5): a child holding an item is carried to the household's contact; the contact's
 * household list ([[GTC-356]]) names the other adults; an adult with an email or a mobile is asked
 * directly. NOT TRUE OF THE HOST'S OWN HOUSEHOLD — her household's children are hers, and it has no
 * list — so neither screen shows it there.
 *
 * CLIENT-SAFE: a string and nothing else.
 */
export const HOUSEHOLD_CONTACT_LINE =
  'Gather sends this person the asks for the household’s children, and tells them what the ' +
  'others in the household have been asked to bring. Adults with their own email or mobile ' +
  'still hear from Gather themselves.';

/**
 * [[GTC-384]] (item 55, Q5, ruled 2026-10-14) — the line on the host's own household, in the place
 * of the "Message me about my own household" switch, and for a household of one too. The switch
 * changed nothing Gather sends: a child of her own household is hers whoever is picked
 * (`resolveHouseholdContact`, HOST_HOUSEHOLD_CHILD, before the switch is read), her household gets
 * no list, and an adult in it with an email or mobile is asked directly. So the switch went, and
 * this says what is true. Nothing stored changed: `messagesMuted` stays as it was.
 */
export const OWN_HOUSEHOLD_LINE =
  'Gather doesn’t message you about your own household: your children’s jobs are yours to sort. ' +
  'Anyone else in it with their own email or mobile hears from Gather themselves.';
