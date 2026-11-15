/**
 * [[GTC-460]] Stage 3, step 3c — WHAT A PICK PUTS IN A ROW (D9, rulings 39 and 41; the plan's R6).
 *
 * An adult row becomes EXACTLY the contact: the name, the email and the number, and a box the contact
 * has nothing for is emptied (a typed email does not stay beside another person's number). A flagged
 * number or email is carried as it is: the list showed the flag, and the form's own check at Save
 * refuses it with its own words. A kid's row gets the name only; the prompt for a number or an email
 * comes at step 3d. A pick never carries a tick or any other choice: only the three boxes.
 */
import type { Contact } from '@/lib/contacts/store';

export type RowKind = 'adult' | 'kid';
export type RowFill = { name: string; email: string; phone: string };

export function fillFrom(c: Contact, kind: RowKind): RowFill {
  if (kind === 'kid') return { name: c.name, email: '', phone: '' };
  return { name: c.name, email: c.email ?? '', phone: c.phone ?? '' };
}
