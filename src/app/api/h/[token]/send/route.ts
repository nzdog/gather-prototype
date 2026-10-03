import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { actorFromToken } from '@/lib/ledger';
import { pressSend } from '@/lib/press/press';

/**
 * POST /api/h/[token]/send — THE PRESS, behind a HOST token.
 *
 * GTC-189 slice 5a, decision 30: *"One route. The session route is the press; the host-token
 * route delegates to it."* This route is the auth and nothing else — `pressSend` in
 * `src/lib/press/press.ts` is the press, shared with `POST /api/events/[id]/send`.
 *
 * ⚠ THE DRIFT THIS CLOSES WAS REAL, NOT HYPOTHETICAL. Before slice 5a this route carried its
 * own copy of the whole press, and its `SEND_PRESSED` ledger entry wrote no `recipientCount`
 * at all — so the same act recorded two different things in the history depending on which
 * door the host came through.
 *
 * RENAMED FROM `confirm-invites-sent` (decision 31); that path survives as a redirect.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const resolvedContext = await resolveToken(token);

  if (!resolvedContext || resolvedContext.scope !== 'HOST') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const outcome = await pressSend(prisma, {
      eventId: resolvedContext.event.id,
      actor: actorFromToken(resolvedContext),
      baseUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
    });

    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.message, code: outcome.code },
        { status: outcome.status }
      );
    }

    return NextResponse.json({
      success: true,
      confirmedAt: outcome.confirmedAt.toISOString(),
      recipients: outcome.recipientCount,
    });
  } catch (error) {
    console.error('Error pressing send:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
