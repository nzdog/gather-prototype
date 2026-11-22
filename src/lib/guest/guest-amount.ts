import { amountDetail, unitWordOf } from '@/lib/moment3/share-split';

/**
 * [[GTC-472]] D5 — THE AMOUNT A GUEST READS ON THEIR OWN ROW.
 *
 * The founder's ruling, 22 Nov 2026: a guest must see their own share. Until now the guest page drew
 * only `Item.quantity`, the older text field, and plans drafted today leave it empty, so a guest saw
 * no amount at all. Now the number and its unit word are read, in the page's existing "x" look
 * ("x10 servings"). The older text is used only when a row has no number to read.
 *
 * ONLY A SETTLED AMOUNT SHOWS (the founder's narrowing): the amount is specified, or it is a
 * placeholder the host has acknowledged. A guess nobody has confirmed shows nothing, as it did
 * before, so a guest is never shown an amount the host has not stood behind.
 *
 * A DIVIDED ROW NEVER SHOWS THE UNDIVIDED AMOUNT. When a share divides an amount it also clears the
 * older text on both rows (src/lib/moment3/share-dish.ts), and the number is read first, so neither
 * row can read the total.
 *
 * The unit words are Moment 3's own (`unitWordOf`), so a guest reads the words the host read. This
 * file reads no board, press, sender or message code: it is a pure formatter, used by the guest
 * route only. Amounts stay off the message text.
 */
export interface GuestAmountFacts {
  /** The older text field. */
  quantity: string | null;
  quantityAmount: number | null;
  quantityUnit: string | null;
  quantityUnitCustom: string | null;
  quantityState: string | null;
  placeholderAcknowledged: boolean;
}

export function guestAmountText(item: GuestAmountFacts): string | null {
  const settled =
    item.quantityState === 'SPECIFIED' ||
    (item.quantityState === 'PLACEHOLDER' && item.placeholderAcknowledged === true);
  const amount = item.quantityAmount;
  if (settled && typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
    const text = amountDetail(amount, unitWordOf(item));
    if (text !== '') return text;
  }
  return item.quantity && item.quantity.trim() !== '' ? item.quantity : null;
}
