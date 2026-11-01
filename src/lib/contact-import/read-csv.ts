import { makeContact, makeIdMaker, type Candidate } from './build-contact';
import { isBlankRow, parseDelimited } from './split-cells';
import { collapseSpaces } from './tidy-name';
import type { ContactPerson, Field, ReadOptions, ReadResult } from './types';

/**
 * [[GTC-448]] — the CSV reader. It runs in the browser with no library and no server import.
 *
 * Reading: commas, double quotes, `""` for a quote, line breaks inside a quoted cell, CRLF, a byte
 * order mark, blank lines. Cells past the header's width are ignored; a short row's missing cells
 * are blank. The first row is the header. `found` counts the data rows.
 *
 * The column guess uses the import pop-up's words and its order (first, last, name, email, phone),
 * with the founder's fixes (rulings 6 and 12): a column whose header says Label, Type or Phonetic is
 * skipped, and for first, last and full name the FIRST matching column is taken, not the last
 * non-empty one. Every other email or phone column is a candidate, and the chooser in
 * build-contact.ts keeps one of each (ruling 5).
 *
 * Separate First and Last columns build "First Last" directly (never "Last, First"), and that name
 * is not counted in `tidied`. A single name cell is given to the name tidy.
 */
const SKIPPED_HEADERS = ['label', 'type', 'phonetic'];

/** One field per header. The pop-up's own rule, less the skipped headers, first match for names. */
export function guessColumns(headers: string[]): Field[] {
  let haveFirst = false;
  let haveLast = false;
  let haveName = false;
  return headers.map((header): Field => {
    const h = header.replace(/^﻿/, '').trim().toLowerCase();
    if (SKIPPED_HEADERS.some((word) => h.includes(word))) return 'ignore';
    if (h.includes('first') || h === 'fname' || h === 'given') {
      if (haveFirst) return 'ignore';
      haveFirst = true;
      return 'first';
    }
    if (h.includes('last') || h === 'lname' || h === 'surname' || h === 'family') {
      if (haveLast) return 'ignore';
      haveLast = true;
      return 'last';
    }
    if (h.includes('name')) {
      if (haveName) return 'ignore';
      haveName = true;
      return 'name';
    }
    if (h.includes('email') || h.includes('e-mail') || h === 'mail') return 'email';
    if (h.includes('phone') || h.includes('mobile') || h.includes('tel')) return 'phone';
    return 'ignore';
  });
}

export function readCsv(text: string, opts?: ReadOptions): ReadResult {
  const newId = makeIdMaker(opts);
  const rows = parseDelimited(text, ',').filter((row) => !isBlankRow(row));
  const people: ContactPerson[] = [];
  let noName = 0;
  let tidied = 0;
  if (rows.length === 0) {
    return { people, found: 0, leftOut: { noName, unreadable: 0 }, tidied };
  }

  const fields = guessColumns(rows[0]);
  const dataRows = rows.slice(1);

  for (const row of dataRows) {
    let first = '';
    let last = '';
    let full = '';
    const emails: Candidate[] = [];
    const phones: Candidate[] = [];
    fields.forEach((field, i) => {
      const value = collapseSpaces(row[i] ?? '');
      if (!value) return;
      if (field === 'first') first = value;
      else if (field === 'last') last = value;
      else if (field === 'name') full = value;
      else if (field === 'email') emails.push({ value });
      else if (field === 'phone') phones.push({ value });
    });

    const built = [first, last].filter(Boolean).join(' ');
    const made = makeContact({ name: built || full, tidy: !built, emails, phones }, newId);
    if (!made) {
      noName++;
      continue;
    }
    people.push(made.person);
    if (made.flipped) tidied++;
  }

  return { people, found: dataRows.length, leftOut: { noName, unreadable: 0 }, tidied };
}
