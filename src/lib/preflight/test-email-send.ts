/**
 * [[GTC-388]] (item 64) — THE TEST EMAIL, SERVER SIDE: the checks in order, and the one send.
 *
 * Founder plan rulings, 2026-10-16. Called from one place, the second request shape on the
 * pre-flight message route's existing PATCH (Q9), after its guard (host and co-host, Q2). It sends
 * ONE email, to the presser's own account address (Q1), holding the message of the person she is
 * reading as (Q3), composed from what is STORED (Q5) by the screen's own composer, so the test and
 * the send cannot differ. Server only: it reaches the database, so no client file imports it.
 *
 * THE ORDER, each refusal before anything is sent:
 *   1. the event has been sent                         → AFTER_PRESS
 *   2. the person is not one of the press's messages   → NO_MESSAGE
 *   3. her account has no address (unreachable today)  → NO_ADDRESS
 *   4. the email service will not take her address     → BLOCKED   (Zone 9's reader, Q7)
 *   5. she turned off email about this event           → OPTED_OUT (Zone 9's reader, Q7)
 *   6. three tests already in the last hour            → TOO_OFTEN (Q8)
 *   7. composed with both links as stand-ins (Q6), then sent: SENT, LIVE_OFF, REFUSED or NOT_SENT
 *
 * IT WRITES NOTHING (Q10): no message row, invite event, send clock, token, ledger line, opt-out or
 * block. The limit is the one thing it keeps, in this server's memory (Q8): it starts again after a
 * restart or a deploy, and it is the first limit in the tree not counted from rows. With no message
 * row a bounce of the test is never learned (Q15, accepted).
 *
 * NOT A SECOND PLACE THAT DECIDES WHO MAY BE EMAILED. The presser is not a guest, so the chooser is
 * not asked about her; who gets a message, and on which channel, is the preview's own answer
 * (`readAskPreview` through the chooser, `messageRows`), read as the screen reads it.
 */

import type { Prisma } from '@prisma/client';
import { sendHostTestEmail } from '@/lib/email';
import { LIVE_SENDS_OFF } from '@/lib/live-sends';
import { emailBlockStateOf, listEmailBlocks } from '@/lib/eligibility/email-block';
import { getEmailOptOut } from '@/lib/eligibility/email-opt-out';
import { firstNameOf } from '@/lib/messages/ask-register';
import { readAskPreview } from '@/lib/preflight/ask-preview';
import { composePreview, messageRows } from '@/lib/preflight/ask-preview-compose';
import {
  composeTestEmail,
  mayTestAgain,
  testLinkStandIn,
  testsInWindow,
  type TestEmailOutcome,
} from '@/lib/preflight/test-email';

/** Q8 — the press times, per presser and event, in this server's memory only. */
const pressTimes = new Map<string, number[]>();

export async function sendTestEmailFor(
  db: Prisma.TransactionClient,
  input: {
    eventId: string;
    personEventId: string;
    /** The signed-in person, from the route's guard. Her address is the only "to" there is. */
    viewer: { id: string; email: string | null };
    baseUrl: string;
  },
  options: { now?: number } = {}
): Promise<TestEmailOutcome> {
  const now = options.now ?? Date.now();
  const { eventId, personEventId, viewer } = input;

  const event = await db.event.findUnique({ where: { id: eventId }, select: { sentAt: true } });
  if (!event) return 'NO_MESSAGE';
  if (event.sentAt) return 'AFTER_PRESS';

  const preview = await readAskPreview(db, eventId, input.baseUrl);
  if (!preview) return 'NO_MESSAGE';
  const row = messageRows(composePreview(preview, preview.storedAuthorLine).rows).find(
    (r) => r.recipient.personEventId === personEventId
  );
  if (!row || !row.ask) return 'NO_MESSAGE';

  const to = viewer.email?.trim() ?? '';
  if (!to) return 'NO_ADDRESS';

  const blocks = await listEmailBlocks(db, [to]);
  if (emailBlockStateOf(to, eventId, blocks) !== 'NONE') return 'BLOCKED';

  const own = await db.personEvent.findFirst({
    where: { eventId, person: { userId: viewer.id } },
    select: { personId: true },
  });
  if (own && (await getEmailOptOut(own.personId, eventId))) return 'OPTED_OUT';

  const key = `${viewer.id}:${eventId}`;
  const recent = testsInWindow(pressTimes.get(key) ?? [], now);
  if (!mayTestAgain(recent, now)) return 'TOO_OFTEN';
  pressTimes.set(key, [...recent, now]);

  // Q6 — the one recipient again, with the stand-in where their link goes, through the same
  // composer; nothing in `composePreview` or `composeAsk` changes.
  const name = firstNameOf(row.recipient.name);
  const standIn = testLinkStandIn(name);
  const swapped = composePreview(
    {
      ...preview,
      recipients: [{ ...row.recipient, linkState: 'READY', link: standIn }],
    },
    preview.storedAuthorLine
  ).rows[0];
  if (!swapped?.ask) return 'NOT_SENT';
  const texted = row.recipient.channel === 'TEXT';
  const text = texted ? swapped.textAsSent : swapped.ask.text;
  if (!text) return 'NOT_SENT';
  const { subject, body } = composeTestEmail({ name, texted, subject: swapped.ask.subject, text });
  // Fail closed: should a real link ever survive the swap, nothing is sent.
  if (row.recipient.link && body.includes(row.recipient.link)) return 'NOT_SENT';

  const result = await sendHostTestEmail({
    to,
    subject,
    body,
    replyTo: preview.replyTo,
    fromName: preview.hostName,
  });
  if (result.success) return 'SENT';
  if (result.error === LIVE_SENDS_OFF) return 'LIVE_OFF';
  if (result.providerErrorCode) return 'REFUSED';
  return 'NOT_SENT';
}
