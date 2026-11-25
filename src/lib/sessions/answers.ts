/**
 * [[GTC-481]] — GUESTS ANSWER PER SESSION (the founder's rulings on the plan, 25 Nov 2026). The
 * reading of "coming" for one session (B), how many are at each session (D), and every word a guest
 * or host reads for A, C and D, word for word as ruled (ruling 5). Change them only by a ruling.
 *
 * Pure: no React, no request, no clock, no database. It imports only GTC-479's card words (their
 * dish list), so the new address, the guest's card, Moments 2 and 3 and the tests read one rule.
 */

import { dishList } from './card-words';

/**
 * B: coming, for one session. GTC-478's ruling A: a "not at this session" mark is a no for that
 * session; with no mark the whole event's reading stands (`deriveAttendance` in
 * src/lib/attendance.ts, not changed), so a one-day event and every event without marks read
 * exactly as before. Generic so it takes that reading's own type without importing it.
 */
export function sessionAttendance<A extends string>(whole: A, notAtSession: boolean): A | 'NO' {
  return notAtSession ? 'NO' : whole;
}

/** A "not at this session" mark: a person's place on the event, and the session. */
export interface SessionMark {
  personEventId: string;
  dayId: string;
}

/** A household as the sessions route gives it: its named people and its kids without jobs. */
export interface HeadcountHousehold {
  littleCount: number;
  people: readonly { personEventId: string }[];
}

/**
 * D: how many are at each session, by its id. Moment 1's count ("X people coming": every named
 * person, plus each household's kids without jobs) less the named people marked as not at that
 * session. Kids without jobs come with their household (GTC-479), so they are left out only where
 * the household has named people and every one of them is marked as not at it.
 */
export function sessionHeadcounts(
  sessionIds: readonly string[],
  households: readonly HeadcountHousehold[],
  absences: readonly SessionMark[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const dayId of sessionIds) {
    const away = new Set(absences.filter((a) => a.dayId === dayId).map((a) => a.personEventId));
    out[dayId] = households.reduce((sum, h) => {
      const here = h.people.filter((p) => !away.has(p.personEventId)).length;
      const littles = h.people.length > 0 && here === 0 ? 0 : (h.littleCount ?? 0);
      return sum + here + littles;
    }, 0);
  }
  return out;
}

/** D, on a tab: "14 coming". */
export function headcountWords(n: number): string {
  return `${n} coming`;
}

/**
 * D: a tab's second line. The date, then the headcount ("Thu 25 Dec · 14 coming"); the headcount
 * alone when the name is only the date; the date alone (as before) when there is no headcount.
 */
export function tabDateLine(date: string | null, headcount: number | undefined): string | null {
  if (headcount === undefined) return date;
  return date ? `${date} · ${headcountWords(headcount)}` : headcountWords(headcount);
}

/** "Christmas lunch"; "Christmas lunch and Boxing Day dinner"; "a, b and c". */
export function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** A, the guest's card, word for word (ruling 5). */
export const GUEST_SESSION_WORDS = {
  downFor: (names: readonly string[]) => `You're down for ${nameList(names)}.`,
  cantMake: "Can't make it",
  cantMakeAloud: (session: string) => `Can't make ${session}`,
  notComing: 'Not coming',
  canMake: 'I can make it',
  canMakeAloud: (session: string) => `I can make ${session}`,
  confirm: (session: string, dishes: readonly string[]) =>
    `Can't make ${session}? We'll mark ${dishList(dishes)} No, so your host knows to find someone else.`,
  confirmYes: "Can't make it",
  confirmNo: 'Go back',
  marked: (dishes: readonly string[]) =>
    `We've marked ${dishList(dishes)} No, so your host knows to find someone else.`,
  stayNo: 'Anything you marked No stays No. You can change it below.',
  failed: "That didn't go through. Please try again.",
} as const;

/** A, the new address's own words (only a call made by hand reads them). */
export const SESSION_ANSWER_WORDS = {
  comingMissing: 'Say whether you can make this session',
  lastSession: "That's the only session you're down for",
} as const;

/** C, Moment 3's warning, word for word (ruling 3). */
export const AWAY_WORDS = {
  warning: (person: string, dish: string, session: string) =>
    `${person} is marked as not coming to ${session}. Give ${person} ${dishList([dish])} anyway?`,
  giveAnyway: 'Give anyway',
  pickSomeoneElse: 'Pick someone else',
} as const;
