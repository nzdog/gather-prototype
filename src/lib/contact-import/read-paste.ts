import { makeContact, makeIdMaker, type Candidate } from './build-contact';
import { parseDelimited } from './split-cells';
import { collapseSpaces } from './tidy-name';
import { WORDS, type ContactPerson, type ReadOptions, type ReadResult } from './types';

/**
 * [[GTC-448]] — the paste reader: one person per line, "name, phone, email", with any part missing.
 *
 * How the parts are told apart: by what each looks like, never by where it sits.
 *   - email: it holds "@" (the form "Name <a@b.com>" is pulled apart into a name and an email);
 *   - phone: only digits, spaces and + ( ) - . , with at least six digits;
 *   - name text: anything else that has a letter in it;
 *   - anything left (no letters, no phone shape, e.g. "---") is unplaced: W7, and it is left out.
 * Position decides only ties: the first email and the first number are the candidates, and the
 * chooser in build-contact.ts keeps one of each.
 *
 * Last, First. A line has one name field, so two name-text cells in a comma-split line mean a comma
 * fell inside the name. They are joined back as typed and given to the name tidy: if it is sure the
 * name is flipped, and if it is not the name stays exactly as typed and the person gets W6. In a
 * tab-separated line two name cells are not joined with a comma at all (they may be First and Last
 * columns), so they are kept in order, unflipped, with W6. Nothing is chosen by position or guessed.
 *
 * A line with no name is not a person: it is left out and counted (never named from an email).
 */
const HEADING_WORDS = new Set([
  'name',
  'names',
  'full name',
  'fullname',
  'first name',
  'firstname',
  'last name',
  'lastname',
  'surname',
  'family name',
  'given name',
  'display name',
  'contact name',
  'phone',
  'phone number',
  'mobile',
  'mobile phone',
  'mobile number',
  'cell',
  'cell phone',
  'telephone',
  'tel',
  'email',
  'e-mail',
  'email address',
  'e-mail address',
]);
const NAME_WITH_EMAIL = /^(.*?)\s*<\s*([^<>\s@]+@[^<>\s@]+)\s*>$/;
const PHONE_SHAPE = /^[\d\s()+.-]+$/;
const HAS_LETTER = new RegExp('\\p{L}', 'u');

function isHeadingLine(cells: string[]): boolean {
  const filled = cells.filter(Boolean);
  return filled.length > 0 && filled.every((c) => HEADING_WORDS.has(c.toLowerCase()));
}

function isPhoneShaped(cell: string): boolean {
  return PHONE_SHAPE.test(cell) && (cell.match(/\d/g) ?? []).length >= 6;
}

export function readPaste(text: string, opts?: ReadOptions): ReadResult {
  const newId = makeIdMaker(opts);
  const people: ContactPerson[] = [];
  let found = 0;
  let noName = 0;
  let tidied = 0;
  let firstLine = true;

  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line.trim() === '') continue;
    const tabbed = line.includes('\t');
    const cells = (parseDelimited(line, tabbed ? '\t' : ',')[0] ?? []).map(collapseSpaces);

    if (firstLine) {
      firstLine = false;
      if (isHeadingLine(cells)) continue;
    }
    found++;

    const nameCells: string[] = [];
    const emails: Candidate[] = [];
    const phones: Candidate[] = [];
    let unplaced = false;
    for (const cell of cells) {
      if (!cell) continue;
      const angled = NAME_WITH_EMAIL.exec(cell);
      if (angled) {
        const name = collapseSpaces(angled[1].replace(/^"|"$/g, ''));
        if (name) nameCells.push(name);
        emails.push({ value: angled[2] });
      } else if (cell.includes('@')) {
        emails.push({ value: cell });
      } else if (isPhoneShaped(cell)) {
        phones.push({ value: cell });
      } else if (HAS_LETTER.test(cell)) {
        nameCells.push(cell);
      } else {
        unplaced = true;
      }
    }

    if (nameCells.length === 0) {
      noName++;
      continue;
    }

    const extraProblems: string[] = [];
    let name = nameCells[0];
    let tidy = true;
    let commaSplit = false;
    if (nameCells.length > 1) {
      if (tabbed) {
        name = nameCells.join(' ');
        tidy = false;
        extraProblems.push(WORDS.W6);
      } else {
        name = nameCells.join(', ');
        commaSplit = true;
      }
    }
    if (unplaced) extraProblems.push(WORDS.W7);

    const made = makeContact({ name, tidy, commaSplit, emails, phones, extraProblems }, newId);
    if (!made) {
      noName++;
      continue;
    }
    people.push(made.person);
    if (made.flipped) tidied++;
  }

  return { people, found, leftOut: { noName, unreadable: 0 }, tidied };
}
