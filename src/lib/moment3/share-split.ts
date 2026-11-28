/**
 * [[GTC-472]] — SHARING ONE DISH BETWEEN SEVERAL PEOPLE: THE DIVIDING RULES.
 *
 * The founder's words, 22 Nov 2026: "Assign more than one item to several people - eg, both mum and
 * Joanna bring salad", then "I want to divide the dish being shared". This is the arithmetic of that,
 * in one place, so the screen's proposal and the server's checks cannot differ.
 *
 * THE RULES (rulings D4 and the plan's question 3):
 *   - A dish divides when its amount is a real number above zero, in the "specified" state, with no
 *     deferral, whatever the unit word is (Moment 2 stores "20" and the word "servings"). A job has
 *     no amount. Words only, a placeholder, a deferred amount, and a number with more than two
 *     decimals are copied as they are and never divided.
 *   - The split keeps the total: it is made from the total of the rows that already share.
 *   - Whole numbers when that total is whole and at least as big as the number of people; otherwise
 *     two decimal places. Everyone gets the total divided by the number of people, rounded down; the
 *     leftover pieces go one at a time, to the first holder first, then in the order people joined.
 *   - A host-typed number must be above zero, with at most two decimals.
 *
 * Amounts are worked in hundredths, so a sum is never a rounding accident (0.1 + 0.2).
 *
 * CLIENT-SAFE AND PURE: no imports, no writes. ([[GTC-488]], 28 Nov 2026: one import since, the
 * unit words of `src/lib/items/unit-words.ts`, which is pure and imports nothing.)
 */

import { unitWordFor } from '@/lib/items/unit-words';

/** The most one amount may be: a typing slip, not a real dish. */
export const MAX_SHARE_AMOUNT = 1_000_000;

/** What the dividing rule reads of a row. */
export interface ShareAmountFacts {
  /** 'ITEM' (something to bring) or 'TASK' (a job). */
  kind: string;
  quantityState: string | null;
  quantityAmount: number | null;
  /** Set when the amount was left to a coordinator. */
  quantityDeferredTo: string | null;
}

/** An amount in whole hundredths, or null when it has more than two decimals or is not a finite number. */
export function toHundredths(n: number): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const h = Math.round(n * 100);
  return Math.abs(n * 100 - h) < 1e-6 ? h : null;
}

/** Is this a number a host may type for someone's share: above zero, at most two decimals. */
export function validShareAmount(n: unknown): n is number {
  if (typeof n !== 'number') return false;
  const h = toHundredths(n);
  return h !== null && h > 0 && n <= MAX_SHARE_AMOUNT;
}

/** Does this row's amount divide? (See the rules above.) */
export function isDividable(f: ShareAmountFacts): boolean {
  if (f.kind !== 'ITEM') return false;
  if (f.quantityState !== 'SPECIFIED') return false;
  if (f.quantityDeferredTo) return false;
  if (f.quantityAmount === null || f.quantityAmount === undefined) return false;
  return validShareAmount(f.quantityAmount);
}

/** An amount as a number to two decimals, with no floating-point tail. */
export function roundAmount(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The sum of amounts to two decimals. */
export function sumAmounts(amounts: readonly number[]): number {
  return amounts.reduce((a, x) => a + Math.round(x * 100), 0) / 100;
}

/**
 * The total divided between `people`, keeping the total. Null when it cannot be (fewer than two
 * people, a total that is not a valid amount, or one too small to give everyone a hundredth).
 */
export function splitTotal(total: number, people: number): number[] | null {
  if (!Number.isInteger(people) || people < 2) return null;
  const h = toHundredths(total);
  if (h === null || h <= 0) return null;
  const whole = h % 100 === 0 && h / 100 >= people;
  if (whole) {
    const units = h / 100;
    const base = Math.floor(units / people);
    const extra = units - base * people;
    return Array.from({ length: people }, (_, i) => base + (i < extra ? 1 : 0));
  }
  const base = Math.floor(h / people);
  if (base < 1) return null;
  const extra = h - base * people;
  return Array.from({ length: people }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
}

/**
 * The unit word shown next to an amount: the host's own word for a custom unit, else the plain word
 * the plan view uses. Nothing for a custom unit with no word. (The same words Moment 3's rows read.)
 */
export function unitWordOf(i: {
  quantityUnit: string | null;
  quantityUnitCustom: string | null;
}): string {
  if (i.quantityUnitCustom) return i.quantityUnitCustom;
  if (!i.quantityUnit || i.quantityUnit === 'CUSTOM') return '';
  const words: Record<string, string> = {
    KG: 'kg',
    G: 'g',
    L: 'litres',
    ML: 'ml',
    COUNT: 'pieces',
    PACKS: 'packs',
    TRAYS: 'trays',
    SERVINGS: 'servings',
  };
  return words[i.quantityUnit] ?? i.quantityUnit.toLowerCase();
}

/**
 * An amount and its unit word as a row reads it: "10 servings", "2.5 kg", or "3" with no word.
 * [[GTC-488]] B: at exactly 1, a word of the plan's unit list reads singular ("1 tray"); any other
 * word reads as stored ("1 pavlovas").
 */
export function amountDetail(amount: number | null, unitWord: string): string {
  if (amount === null || amount === undefined) return '';
  const n = roundAmount(amount);
  return [n, unitWordFor(n, unitWord)].filter((x) => x !== '').join(' ');
}

/**
 * The wire shapes of the share route, client-safe (the server module and the screen both read them).
 */

/** One row of a dish, as the screen is told it. */
export interface ShareRow {
  itemId: string;
  personId: string;
  name: string;
  /** The amount as stored, or null when the row has no number. */
  amount: number | null;
  /** The holder's answer (`Assignment.response`). */
  response: string;
}

/** What the split screen needs: the rows that share, in split order, and whether the amount divides. */
export interface SharePreview {
  dishName: string;
  kind: string;
  /** Every row's amount divides (a number, specified, no deferral, one unit) — so the screen proposes a split. */
  divided: boolean;
  /** The total of the rows' amounts, when divided. */
  total: number | null;
  unitWord: string;
  rows: ShareRow[];
}

/** One line of what she confirmed: an existing row (itemId), or the new one (itemId null). */
export interface ShareAmountLine {
  itemId: string | null;
  /** The amount she was shown for an existing row (null for the new row). */
  before: number | null;
  amount: number;
}
