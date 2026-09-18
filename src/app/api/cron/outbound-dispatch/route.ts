// GET/POST /api/cron/outbound-dispatch
//
// GTC-189 slice 5c, FIRST HALF — the press's drain, and it drains nothing yet.
//
// ⚠ THIS ROUTE TAKES NO CLAIM AND SENDS NOTHING. It reports what a tick WOULD drain. The reason
// is the schema's own definition of an unfinished claim — "a row left with `attemptedAt` set and
// no end state below is a crashed attempt" — so claiming before a transport exists would turn
// every row it touched into a permanent crashed attempt, on a press ruled one act with no recall.
// `describeDrain` in src/lib/press/dispatch.ts is deliberately the only thing called here; the
// claim primitives beside it are proven by `tests/outbound-dispatch-test.ts` and go live in the
// same commit as the thing that can finish a row.
//
// ⚠ AND NO INLINE DRAIN AT THE PRESS, which is the other half of the same ruling (2026-09-19): a
// request that can be killed halfway is not one act with no recall. The press writes the rows and
// this route drains them, and nothing drains them synchronously.
//
// Schedule: every 2 minutes, in vercel.json. ⚠ A PROPOSAL WITH NO MEASUREMENT BEHIND IT. The other
// three crons run at 10 and 15 minutes, which does not serve Hinge §7's "one act, one sentence,
// one handover" — the first guest would read her message twelve minutes after the host pressed.
// No accepted send's latency has ever been observed in this environment ([[GTC-247]]), so if one
// ever is and two is wrong, it is one number to change.
//
// Security: requires CRON_SECRET header or query param. GTC-270: an UNSET secret refuses every
// caller.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DRAIN_BATCH, describeDrain } from '@/lib/press/dispatch';
import { cronSecretAccepted, isCronSecretConfigured } from '../cron-secret';
import { withoutRecipientNames } from '../cron-response';

// GTC-270: read at module scope — see the note in ../nudges/route.ts.
const CRON_SECRET = process.env.CRON_SECRET;

async function handleRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const secretParam = request.nextUrl.searchParams.get('secret');
  const providedSecret = authHeader?.replace('Bearer ', '') || secretParam;

  /*
   * TWO REFUSALS, DELIBERATELY SEPARATE, AND BOTH WRITTEN OUT HERE RATHER THAN BEHIND A HELPER.
   *
   * A deployment that never configured the secret is an operator error worth an error-level log,
   * and a caller probing the endpoint is not. Both answer 401 identically on the wire.
   *
   * ⚠ THE `if`s STAY IN THIS FILE BY MEASUREMENT, NOT BY TASTE. `../cron-secret.ts` records it:
   * GTC-268's route scanner classifies a handler from the `if` CONDITIONS inside it, follows local
   * helpers and does NOT follow imports. A helper that swallowed the whole check was run against
   * the scanner and reported all six cron handlers as "no credential of any kind" — a worse verdict
   * than the fail-open it replaced.
   */
  if (!isCronSecretConfigured(CRON_SECRET)) {
    console.error('[Cron OutboundDispatch] CRON_SECRET is not configured — refusing every caller.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!cronSecretAccepted(CRON_SECRET, providedSecret)) {
    console.warn('[Cron OutboundDispatch] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await describeDrain(prisma, DRAIN_BATCH);

    // GTC-270 finding 2: every cron route puts the same shape on the wire, so a later `errors`
    // array added to this dispatcher cannot leak a recipient by default.
    return NextResponse.json({
      success: true,
      ...withoutRecipientNames(result),
      // Said on the wire rather than only in a comment, because a monitor reading 200 with
      // `sent: 0` for a week should be able to tell "nothing was due" from "nothing can send yet".
      drainsNothingYet: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron OutboundDispatch] Error:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
