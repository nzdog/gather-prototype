import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { startDemoCopyWithinLimit } from '@/lib/demo/copy';
import {
  checkStartLimit,
  DEMO_START_WORDS,
  startLogLine,
  visitorOf,
  visitorTagOf,
} from '@/lib/demo/start-limit';
import { isDemoStartOn } from '@/lib/demo/start-switch';

/**
 * How long a sample's session lasts: two hours, as GTC-269 ruled for the old shared demo (Q8).
 */
const DEMO_SESSION_MAX_AGE_SECONDS = 2 * 60 * 60;

/**
 * POST /api/demo/session — starts a visitor's own sample event (`{ start: 'copy' }`).
 *
 * REACHABLE BY ANYONE, ON PURPOSE (GTC-015): no credential and no environment gate. The copy shape
 * opens only where GATHER_DEMO_START is exactly `on` ([[GTC-425]]); her credential is a throwaway
 * account with exactly one role, HOST on the copy made in the same transaction, for two hours.
 *
 * [[GTC-442]] (founder rulings, 1 Nov 2026, Q10 and Q15): THE OLD SHARED DEMO IS RETIRED. A POST
 * with no body, or any body but the copy shape, answers 404 `{ error: 'Not found' }` before
 * anything is read or written: no cookie read, no database, no cookie set. The shared demo
 * session it used to mint, and the token route beside it, are gone.
 */
export async function POST(request: Request) {
  try {
    /*
     * [[GTC-425]] — THE DEMO START SWITCH (founder ruling, 29 Oct 2026). The copy-start shape opens
     * only where GATHER_DEMO_START is exactly `on`; closed, it answers 404 before anything is read
     * or written: no session cookie, no limit, no database. The body is read here, first, only to
     * tell the shapes apart. [[GTC-442]]: every body but the copy shape is answered 404 just
     * below, before the switch is read.
     */
    const body = (await request.json().catch(() => null)) as { start?: unknown } | null;
    // [[GTC-442]]: the old no-body shape is retired. Anything but the copy shape is not found.
    if (body?.start !== 'copy') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (body?.start === 'copy' && !isDemoStartOn()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

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

    /*
     * [[GTC-392]] part A — THE SECOND SHAPE: `{ start: 'copy' }` starts the visitor's OWN sample
     * event (founder plan rulings, 18 Oct 2026, Q1 and Q2). Acted on only after the presence
     * check above, so a present session is never overwritten. [[GTC-442]]: it is now the only
     * shape; the first check above answers every other body 404.
     *
     * Her credential: a throwaway account (`@demo-copy.invalid`) with exactly one role, HOST on the
     * copy made in the same transaction; two hours; the event is hers by construction, never looked
     * up. [[GTC-425]]: the body was read at the top of the handler, and this shape only reaches
     * here when the switch is on.
     */
    // [[GTC-443]]: the visitor's tag, one log line (counts only), then the limits and the copy in
    // one transaction under one lock. Her address is hashed here and goes no further.
    const visitor = visitorOf(request.headers);
    const visitorTag = visitor.address ? await visitorTagOf(visitor.address) : null;
    console.log(startLogLine(visitor, visitorTag !== null));
    let started;
    try {
      started = await startDemoCopyWithinLimit(
        prisma,
        (tx, now) => checkStartLimit(tx, visitorTag, { now }),
        { visitorTag }
      );
    } catch (copyError) {
      console.error('[DemoSession] The copy could not be started:', copyError);
      return NextResponse.json({ error: DEMO_START_WORDS.FAILED }, { status: 500 });
    }
    if (!started.ok) {
      return NextResponse.json({ error: started.words }, { status: 429 });
    }
    const copy = started.copy;
    // Zone 1, as GTC-269: the same cookie, name and path unchanged, set after the commit.
    (await cookies()).set('session', copy.sessionToken, {
      httpOnly: true,
      secure: (process.env.NODE_ENV as string) === 'production',
      sameSite: 'lax',
      maxAge: DEMO_SESSION_MAX_AGE_SECONDS,
      path: '/',
    });
    return NextResponse.json({
      success: true,
      eventId: copy.eventId,
      href: `/plan/${copy.eventId}/setup`,
    });
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
