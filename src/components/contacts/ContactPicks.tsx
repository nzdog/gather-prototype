/**
 * [[GTC-460]] Stage 3, step 3c — THE DROPDOWN under a name box on the household form.
 *
 * Draws only the list of her loaded people who match what she has typed (the form keeps its own box,
 * ruling 175, and decides which lines there are: `@/lib/contacts/match`). Up to six lines, in the page
 * flow right under the box and never a floating layer, so a phone's keyboard cannot hide it (ruling
 * 163). Each line is at least 44 pixels tall so one tap picks. A line whose person is already in
 * another row of this form is greyed, says why (W33) and cannot be picked.
 *
 * A plain function with no hooks of its own: the form holds the state and hands it in. The press is
 * not allowed to take the cursor away from the box (a tap would blur the box before it counted).
 */
import type { PickLine } from '@/lib/contacts/match';
import type { Contact } from '@/lib/contacts/store';
import { CONTACTS_WORDS as W } from '@/lib/contacts/words';

export type PicksProps = {
  lines: PickLine[];
  /** The highlighted line (the keyboard's Enter picks it). */
  highlight: number;
  onPick: (c: Contact) => void;
};

export default function ContactPicks({ lines, highlight, onPick }: PicksProps) {
  return (
    <ul
      data-contacts-picks
      role="listbox"
      aria-label={W.TITLE}
      className="mt-1 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white"
    >
      {lines.map((l, k) => {
        const greyed = Boolean(l.taken);
        const beside = l.contact.email ?? l.contact.phone ?? '';
        return (
          <li
            key={l.contact.id}
            role="option"
            data-pick-id={l.contact.id}
            aria-selected={k === highlight}
            aria-disabled={greyed || undefined}
          >
            <button
              type="button"
              disabled={greyed}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(l.contact)}
              className={`min-h-[44px] w-full px-3 py-2 text-left ${
                greyed ? 'cursor-not-allowed text-gray-400' : 'text-gray-900 hover:bg-gray-50'
              } ${k === highlight ? 'bg-gray-50' : ''}`}
            >
              <span className="block text-sm font-medium">{l.contact.name}</span>
              {beside && <span className="block text-xs text-gray-500">{beside}</span>}
              {l.taken && <span className="block text-xs text-gray-500">{l.taken}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
