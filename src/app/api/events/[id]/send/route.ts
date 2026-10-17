import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { pressSend } from '@/lib/press/press';

/**
 * POST /api/events/[id]/send — THE PRESS, under session auth.
 *
 * GTC-189 slice 5a, decisions 30 and 31. This is the press; the host-token door at
 * `POST /api/h/[token]/send` is the same press behind a different auth. Everything after the
 * auth is `pressSend` in `src/lib/press/press.ts`, because two routes each doing the whole
 * job is how they drifted — and they had: the host-token one wrote no `recipientCount`.
 *
 * RENAMED FROM `confirm-invites-sent` (decision 31), which described the model in which the
 * host sent the invitations by hand and told Gather she had. That path survives as a redirect.
 *
 * ⚠ NOTHING SENDS YET. This writes the lock, one `OutboundMessage` per addressed recipient
 * and the ledger's first entry. The dispatcher is slice 5c.
 *
 * ⚠ AND THE PRE-FLIGHT'S SEND BUTTON IS NOT WIRED TO THIS — slice 5f does that. Two OTHER
 * live buttons already post to the old path; see the press module's docstring.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // SECURITY: Auth check MUST run first and MUST NOT be in a try/catch that returns 500.
  let auth;
  try {
    auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;
  } catch (authError) {
    console.error('Auth check error:', authError);
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const actor = await ledgerActorForUser(auth.user, 'HOST');
    const outcome = await pressSend(prisma, {
      eventId,
      actor,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
    });

    if (!outcome.ok) {
      // The `code` rides beside the prose so a screen can branch on the state without
      // parsing a sentence — [[GTC-309]] is the first caller that needs to.
      return NextResponse.json(
        { error: outcome.message, code: outcome.code },
        { status: outcome.status }
      );
    }

    return NextResponse.json({
      success: true,
      confirmedAt: outcome.confirmedAt.toISOString(),
      recipients: outcome.recipientCount,
      peopleAnchored: outcome.peopleAnchored,
      totalPeople: outcome.totalMemberships,
    });
  } catch (error) {
    console.error('Error pressing send:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
