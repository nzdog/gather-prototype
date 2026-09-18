import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

const DEMO_EVENT_NAME = 'Henderson Family Christmas 2025';

/**
 * The user this route mints sessions for.
 *
 * GTC-269: deliberately NOT the user linked to the demo `Person`. This account is
 * never linked to a `Person`, so it cannot inherit event roles. The claim branch in
 * `src/app/api/auth/verify/route.ts` creates an `EventRole` for every event where
 * `hostId === personId`, so a user tied to the demo Person accumulates HOST on
 * everything that Person has ever hosted — measured 2026-09-11, the previous
 * account (`sarah.henderson@demo.gather`) held HOST on two events, one of them
 * `GTC-133 Sub-commit (g) Test` with `isDemo: false`. That account is left in place
 * and untouched; this route simply stops using it.
 */
const DEMO_SESSION_EMAIL = 'demo-session@demo.gather';

/**
 * How long a demo session lasts.
 *
 * GTC-269: was 30 days, copied from `verify/route.ts` where a consumed magic link
 * justifies it. Nothing is consumed here, so nothing justifies a standing
 * credential. Two hours covers the dashboard walkthrough and the three token views
 * with room for an interruption, and expires on its own the same afternoon.
 */
const DEMO_SESSION_MAX_AGE_SECONDS = 2 * 60 * 60;

/**
 * POST /api/demo/session
 *
 * Mints a short-lived session for a dedicated demo account so the planning
 * dashboard at `/plan/[eventId]` is reachable from the "Open Planning Dashboard"
 * button on `/demo`.
 *
 * REACHABLE BY ANYONE, ON PURPOSE. GTC-015 (`f6e4b41`, 2026-03-08) removed this
 * route's production gate so that a stranger on the deployed site can try the
 * demo, and the founder reaffirmed that decision on 2026-09-11. This route
 * requires no credential and is not environment-gated. That is the product
 * decision, not an oversight.
 *
 * What GTC-269 fixed is the credential it hands back, which used to be wider than
 * the thing being demoed. The containment is now real and is four things:
 *
 *   1. The session belongs to `DEMO_SESSION_EMAIL`, an account with no `Person`
 *      link, whose `EventRole` set is pruned on every call to exactly one row —
 *      HOST on the demo event. `requireEventRole` keys on `userId` + `eventId`, so
 *      that one row is the entire reach of this credential.
 *   2. It lasts two hours, not thirty days.
 *   3. It never overwrites a session that is already present.
 *   4. The event is resolved by name AND `isDemo: true`, so a real event that
 *      happens to share the name can never be resolved. `Event.name` has no
 *      uniqueness constraint.
 *
 * Asserted behaviourally in suite 11 of `tests/security-validation.ts`, by
 * enumerating what the minted session reaches. Note that the route scanner's
 * verdict on this handler is unchanged and still reads "no credential of any
 * kind" — that verdict is TRUE, and it is not the evidence for this fix.
 */
export async function POST() {
  try {
    // GTC-269, and this is a live product bug in its own right, not hygiene.
    //
    // The cookie below is named `session` at `path: '/'` — the same cookie a real
    // login uses. `/demo` is linked unconditionally from the homepage, so a
    // signed-in host was two clicks from having their own session silently replaced
    // by the demo account's: signed out of their own event and into the demo with
    // no indication it had happened.
    //
    // Presence is checked, deliberately, rather than validity. Calling `getUser()`
    // here would make the route scanner report this handler as GUARDED — `getUser`
    // is in its SESSION_GUARDS set and the result would be checked — while the
    // route remained callable by anyone with no credential at all. That is exactly
    // the false positive GTC-268's scanner exists to prevent, and buying a nicer
    // verdict with a less honest one is not a trade worth making. Looking the token
    // up instead would trip the scanner's CREDENTIAL_COLUMN rule on `session.token`
    // for the same false reason. So: presence only, no guard symbol, verdict
    // unchanged and true.
    const existingSession = (await cookies()).get('session')?.value;
    if (existingSession) {
      return NextResponse.json(
        {
          error: 'Already signed in',
          reason:
            'You are signed in to Gather. Sign out first to explore the demo ' +
            'dashboard, or use the Host, Coordinator and Participant views below — ' +
            'those need no sign-in.',
          alreadySignedIn: true,
        },
        { status: 409 }
      );
    }

    // GTC-269: `isDemo: true` as well as the name. `Event.name` has no uniqueness
    // constraint and this is a `findFirst` with no `orderBy`, so without the filter
    // a real event named "Henderson Family Christmas 2025" could be the row that
    // gets resolved — and its host's Person would then be handed a HOST EventRole
    // and a live session to whoever clicked the button.
    //
    // The name literal itself is drift: `prisma/seed.ts` writes a 2026 name while
    // this route looks for 2025, so both demo routes 404 against a fresh seed. That
    // is GTC-272 — one shared DEMO_EVENT_NAME constant — and is not fixed here.
    const event = await prisma.event.findFirst({
      where: { name: DEMO_EVENT_NAME, isDemo: true },
      select: { id: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Demo event not found' }, { status: 404 });
    }

    // The dedicated demo account. Upserted by email and never linked to a `Person`.
    const user = await prisma.user.upsert({
      where: { email: DEMO_SESSION_EMAIL },
      update: {},
      create: { email: DEMO_SESSION_EMAIL },
    });

    // Exactly one EventRole, enforced rather than hoped for. The prune is what makes
    // "reaches exactly one event" a durable property instead of a momentarily true
    // one: if anything ever grants this account a role elsewhere, the next demo
    // session revokes it rather than handing it out.
    await prisma.eventRole.deleteMany({
      where: { userId: user.id, eventId: { not: event.id } },
    });

    await prisma.eventRole.upsert({
      where: { userId_eventId: { userId: user.id, eventId: event.id } },
      update: {},
      create: { userId: user.id, eventId: event.id, role: 'HOST' },
    });

    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + DEMO_SESSION_MAX_AGE_SECONDS * 1000);

    await prisma.session.create({
      data: { userId: user.id, token: sessionToken, expiresAt },
    });

    // Cookie name and path are unchanged — Zone 1 (GTC-001) keeps both fixed, and
    // the founder's sign-off for GTC-269 was explicit that neither moves.
    (await cookies()).set('session', sessionToken, {
      httpOnly: true,
      secure: (process.env.NODE_ENV as string) === 'production',
      sameSite: 'lax',
      maxAge: DEMO_SESSION_MAX_AGE_SECONDS,
      path: '/',
    });

    return NextResponse.json({ success: true, eventId: event.id });
  } catch (error) {
    console.error('[DemoSession] Failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to create demo session',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
