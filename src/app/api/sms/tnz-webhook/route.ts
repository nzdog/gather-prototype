// POST /api/sms/tnz-webhook
//
// TNZ's ONE webhook. [[GTC-264]] Phase 3 and [[GTC-229]], built as one route because TNZ answered
// on 2026-09-15 (D1): "The webhooks fire to the same URL. The Type is the correct flag." So
// delivery-status reports and received texts arrive here together, on one envelope
// (`@/lib/sms/tnz-webhook-envelope`), and are told apart by `Type` alone.
//
// It replaces `/api/sms/inbound`, a Twilio-shaped handler that checked nothing and wrote
// `SmsOptOut` and `Person.smsOptedOut` (Zone 7) for any caller. That route was DELETED, not
// guarded, on founder ruling (GTC-264 / GTC-229 plan, Q2). Nothing here writes Zone 7.
//
// Security: `TNZ_CALLBACK_SECRET` and `TNZ_CALLBACK_SENDER`, checked in BOTH places TNZ present
// them — the `Authorization` and `X-Sender` headers, then the body's `APIKey` and `Sender`. An
// UNSET or empty value refuses every caller ([[GTC-270]]'s shape). The three refusing `if`s stay
// in this file so the route scanner can read them (see `../tnz-callback-auth.ts`). Both are read
// per request, not at module scope, so every set/unset combination is testable in one process
// (ruling Q6). `X-Timestamp` is neither required nor checked (ruling Q5): TNZ retry for up to 24
// hours and nothing says a retry is re-stamped, a replayed report writes nothing new, and a
// replayer would need the secret anyway.
//
// THE RESPONSE CONTRACT. TNZ retry any non-2xx every five minutes for up to 24 hours (D3: "A 200
// is ideal. A 202 is acceptable too."):
//   200  a delivery report stored, or TNZ's retry of one already stored (nothing written twice)
//   202  a reply, an unsolicited inbound, or any other Type: accepted, NOTHING stored (ruling Q4).
//        Replies are [[GTC-288]]'s, and GTC-288 must land before any deploy carries this route.
//   401  the credential unset, or wrong or missing in the headers or the body — retried, so a
//        misconfigured Railway variable or Dashboard value has a day to be fixed before loss
//   500  credentialed but unreadable — not JSON (an XML Sender default, D2), not an object, or a
//        report without a usable MessageID, Destination or Status. Retried, by the 2026-09-12
//        ruling: a contract we got wrong gets 24 hours to be corrected before a report is lost
//   500  our own error. Retried, and safe to retry: the store is idempotent
// The credential is checked BEFORE the body is read, so an unauthenticated caller only ever gets
// 401. No `GET` is exported, so Next answers 405.
//
// LOGS NEVER CARRY A REPLY'S TEXT, AND NEVER A PHONE NUMBER.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseTnzWebhookEnvelope } from '@/lib/sms/tnz-webhook-envelope';
import { parseTnzDeliveryReport } from '@/lib/sms/tnz-delivery-contract';
import { recordTnzDeliveryReport } from '@/lib/sms/tnz-delivery-record';
import { isTnzCallbackConfigured, tnzCallbackAccepted } from '../tnz-callback-auth';

const UNREADABLE = () => NextResponse.json({ error: 'Unreadable' }, { status: 500 });

/** A `Type` value safe to log: it is TNZ's word, not content, but it is still capped. */
function typeForLog(raw: string | undefined): string {
  return (raw ?? '(absent)').replace(/[^\w-]/g, '').slice(0, 32) || '(empty)';
}

export async function POST(request: NextRequest) {
  const TNZ_CALLBACK_SECRET = process.env.TNZ_CALLBACK_SECRET;
  const TNZ_CALLBACK_SENDER = process.env.TNZ_CALLBACK_SENDER;

  // Three refusals, deliberately separate, as the cron routes do it: a deployment that never
  // configured the credential is an operator error worth an error-level log, and a caller
  // presenting the wrong one is not. All three answer 401 identically on the wire, written out in
  // each branch: the scanner reads the status in the branch, and a helper hides it (UNPROVEN).
  if (!isTnzCallbackConfigured(TNZ_CALLBACK_SECRET, TNZ_CALLBACK_SENDER)) {
    console.error(
      '[TNZ webhook] TNZ_CALLBACK_SECRET or TNZ_CALLBACK_SENDER is not configured — refusing every caller.'
    );
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (
    !tnzCallbackAccepted(
      TNZ_CALLBACK_SECRET,
      TNZ_CALLBACK_SENDER,
      request.headers.get('authorization'),
      request.headers.get('x-sender')
    )
  ) {
    console.warn('[TNZ webhook] refused: header credential missing or wrong');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.error(
      '[TNZ webhook] credentialed body is not JSON — check the Sender’s webhook format is JSON in the TNZ Dashboard (D2). Answering 500 so TNZ retry.'
    );
    return UNREADABLE();
  }

  const parsed = parseTnzWebhookEnvelope(body);
  if (!parsed.ok) {
    console.error(`[TNZ webhook] unreadable envelope: ${parsed.failure.detail}`);
    return UNREADABLE();
  }

  if (
    !tnzCallbackAccepted(
      TNZ_CALLBACK_SECRET,
      TNZ_CALLBACK_SENDER,
      parsed.envelope.APIKey,
      parsed.envelope.Sender
    )
  ) {
    console.warn('[TNZ webhook] refused: body credential missing or wrong');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // For logs only, and safe to log: TNZ's id, never content. Capped, and stripped to word characters
  // so a stray control character cannot forge or break a log line.
  const messageId = (parsed.envelope.MessageID || '(none)').replace(/[^\w-]/g, '?').slice(0, 64);

  try {
    // ── The `Type` switch. Anything that is not a delivery report is acknowledged and left. ──
    if (parsed.kind !== 'DELIVERY_STATUS') {
      // ⚠ A reply is GTC-288's. Until it lands, nothing is stored and Zone 7 is not touched —
      // including for a STOP, which TNZ's own block list already acts on when it is ours (C1).
      // The kind and the MessageID are logged; the text is never read here.
      console.log(
        `[TNZ webhook] ${typeForLog(parsed.envelope.Type)} received (${parsed.kind}) — ${
          parsed.kind === 'INBOUND_MESSAGE'
            ? 'not processed before GTC-288'
            : 'not a callback Gather reads'
        }; nothing recorded. MessageID=${messageId}`
      );
      return NextResponse.json({ ok: true, recorded: false }, { status: 202 });
    }

    const report = parseTnzDeliveryReport(body);
    if (!report.ok) {
      console.error(`[TNZ webhook] unreadable delivery report: ${report.failure.detail}`);
      return UNREADABLE();
    }

    const stored = await recordTnzDeliveryReport(prisma, report.report);
    if (!stored.recorded) {
      console.log(
        `[TNZ webhook] delivery report already stored (TNZ retry); nothing written. MessageID=${messageId}`
      );
      return NextResponse.json({ ok: true, recorded: false, duplicate: true }, { status: 200 });
    }

    for (const w of [...report.report.warnings, ...stored.warnings]) {
      console.warn(`[TNZ webhook] contract warning: ${w}`);
    }
    console.log(
      `[TNZ webhook] delivery report recorded (${stored.matched ? 'matched' : 'unmatched'}). MessageID=${messageId} Status=${report.report.status} Result=${report.report.result ?? '(none)'}`
    );
    return NextResponse.json({ ok: true, recorded: true }, { status: 200 });
  } catch (error) {
    // Never a 2xx: a handler that throws must not read as success to TNZ or to us ([[GTC-229]]
    // audit A — the route this replaced answered 200 from its own catch block). Only the error's
    // code or name is logged: a Prisma message can quote the row it failed to write.
    const code = (error as { code?: unknown } | null)?.code;
    console.error(
      `[TNZ webhook] failed to process MessageID=${messageId}; answering 500 so TNZ retry: ${
        typeof code === 'string' ? code : error instanceof Error ? error.name : 'unknown error'
      }`
    );
    return NextResponse.json({ error: 'Internal' }, { status: 500 });
  }
}
