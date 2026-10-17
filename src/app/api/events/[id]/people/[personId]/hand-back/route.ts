import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { handBackPerson } from '@/lib/chase-hand-back';

/**
 * [[GTC-251]] slice 251c — POST: hand a "gone quiet" guest back to Gather with 1, 2 or 3 more
 * reminders (founder ruling Q3). HOST only, like the remind and the resend on the same panel.
 *
 * It writes the host's decision and sends nothing; the chase's next run does the rest. The logic is
 * `handBackPerson` in `src/lib/chase-hand-back.ts`, so the suite can drive it in process.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; personId: string }> }
) {
  const { id: eventId, personId } = await context.params;

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
    const body = (await request.json().catch(() => ({}))) as { reminders?: unknown };
    const outcome = await handBackPerson(prisma, { eventId, personId, reminders: body.reminders });
    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.error, code: outcome.code },
        { status: outcome.status }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error handing back:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
