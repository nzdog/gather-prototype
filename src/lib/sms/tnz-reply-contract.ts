/**
 * [[GTC-288]] — THE REPLY INTERPRETER: what a received text MEANS. Pure: no database, no clock.
 *
 * The third part of the structure ruled on 2026-09-12 (see `./tnz-webhook-envelope.ts`): one shared
 * envelope parse, then the `Type` switch, then two interpreters that know nothing of each other.
 * `./tnz-delivery-contract.ts` reads delivery reports; this reads `SMSReply` and `SMSInbound`, and
 * is the one place in the tree that reaches for the reply body. A `RECEIVED` is a reply, never a
 * delivery outcome.
 *
 * WHAT IT DECIDES:
 *   - the intent: a STOP, a START, or any other reply — by the two rules in `./opt-out-keywords.ts`;
 *   - the sender: `Destination` (TRAP 1: on a reply it is the GUEST's number), trimmed, and only if
 *     it is E.164 — the form `sendSms` requires of `to`, so the form an opt-out must be recorded in
 *     to match a send. It is never normalised: `normalizePhoneNumber` is not consulted, so a `+61`
 *     sender is kept exactly as TNZ sent it.
 *
 * A STOP or a START with no usable sender is UNREADABLE (plan ruling D10): the route answers 500 so
 * TNZ retry, because an opt-out recorded on a number no send could match protects nobody.
 *
 * ⚠ NOTHING HERE IS EVER LOGGED: the body and the sender are the guest's. A failure detail names the
 * field, never its value.
 */

import type { TnzWebhookEnvelope } from './tnz-webhook-envelope';
import { getOptOutKeyword, isOptInMessage } from './opt-out-keywords';
import { isE164 } from '@/lib/phone';

export type TnzReplyIntent = 'OPT_OUT' | 'OPT_IN' | 'REPLY';

export interface ParsedTnzReply {
  readonly intent: TnzReplyIntent;
  /** The opt-out keyword the reply began with, lowercased; null unless OPT_OUT. Safe to record. */
  readonly keyword: string | null;
  /** The guest's number, E.164 and verbatim; null when `Destination` is absent or not E.164. */
  readonly sender: string | null;
  /** TNZ's `MessageID`: the text of Gather's this answers. Null when absent or empty. */
  readonly providerMessageId: string | null;
  /** TNZ's `ReceivedID`: this reply's own id. Null when absent or empty. */
  readonly providerReceivedId: string | null;
  /** The guest's words, verbatim; '' when absent. */
  readonly body: string;
}

export type TnzReplyParse =
  | { readonly ok: true; readonly reply: ParsedTnzReply }
  | { readonly ok: false; readonly detail: string };

const present = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

export function parseTnzReply(envelope: TnzWebhookEnvelope): TnzReplyParse {
  const body = envelope.Message ?? '';
  const keyword = getOptOutKeyword(body);
  const intent: TnzReplyIntent =
    keyword !== null ? 'OPT_OUT' : isOptInMessage(body) ? 'OPT_IN' : 'REPLY';

  const destination = present(envelope.Destination);
  const sender = destination !== null && isE164(destination) ? destination : null;

  if (intent !== 'REPLY' && sender === null) {
    return {
      ok: false,
      detail: `a ${intent === 'OPT_OUT' ? 'STOP' : 'START'} whose Destination is ${
        destination === null ? 'absent' : 'not E.164'
      }`,
    };
  }

  return {
    ok: true,
    reply: {
      intent,
      keyword,
      sender,
      providerMessageId: present(envelope.MessageID),
      providerReceivedId: present(envelope.ReceivedID),
      body,
    },
  };
}
