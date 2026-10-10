/**
 * GTC-210 — A wrap-up press during quiet hours must defer, not send.
 *
 * Quiet hours are 21:00–08:00 NZ. Every other outbound SMS family respects them; the
 * wrap-up/thank-you family did not. `quiet-hours.ts` had exactly two importers
 * (`nudge-sender.ts`, `proxy-nudge-sender.ts`) and `wrap-up.ts` was not one of them.
 * `DISPATCH_DELAY_MINUTES = 10` is an AGE filter, not a time-of-day window, and the
 * cron runs every 10 minutes around the clock — so a host confirming wrap-up at 23:00
 * NZ texted every guest at ~23:10.
 *
 * WHY THE CLOCK IS INJECTED AND NOT THE TIMEZONE.
 * `isQuietHours()` converts to Pacific/Auckland internally, so it returns the same
 * answer under any `TZ` — pinning `TZ` alone would NOT make this test deterministic, it
 * would just make it depend on what time CI happens to run. The clock itself has to be
 * the input. `isQuietHours(now)` and `dispatchPendingWrapUpMessages(now)` both take an
 * optional `now`, defaulting to the current instant, in the same shape as
 * `isComplete(event, now)` in lifecycle.ts.
 *
 * NOTHING IS SENT, ON ANY PATH. The quiet-hours assertions return before the dispatch
 * loop. The outside-quiet-hours control DOES enter the loop — that is the point of it —
 * so its fixture carries no phone and no email, which routes it to the loop's "No valid
 * contact method" branch: row marked dispatched, no provider touched. Do not give this
 * fixture real contact details. `sendSms` fails closed locally (no TNZ_AUTH_TOKEN), but
 * the email fallback does NOT — a RESEND_API_KEY is present in `.env`, so an email-
 * capable row would make a genuine Resend API call the instant the guard let it through.
 *
 * Run: npx tsx tests/wrap-up-quiet-hours-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { dispatchPendingWrapUpMessages } from '../src/lib/wrap-up';
import { isQuietHours } from '../src/lib/sms/quiet-hours';

const prisma = new PrismaClient();

const TAG = 'GTC210';

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(phase: string, label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}`);
    failed++;
    redAssertions.push(`[${phase}] ${label}`);
  }
}

/**
 * An instant that is a given Auckland wall-clock hour, whatever the server TZ.
 * Built by probing rather than by assuming an offset, so it stays correct across NZDT
 * and NZST without the test hard-coding either.
 */
function instantAtAucklandHour(hour: number): Date {
  const base = new Date();
  for (let shift = 0; shift < 48; shift++) {
    const candidate = new Date(base.getTime() + shift * 60 * 60 * 1000);
    const aucklandHour = Number(
      candidate.toLocaleString('en-US', {
        timeZone: 'Pacific/Auckland',
        hour: '2-digit',
        hour12: false,
      })
    );
    if (aucklandHour === hour) return candidate;
  }
  throw new Error(`Could not construct an instant at Auckland hour ${hour}`);
}

async function main() {
  const createdPersonIds: string[] = [];
  let eventId = '';

  try {
    // ── The clock fixtures, asserted before anything depends on them ──
    const at2300 = instantAtAucklandHour(23); // inside quiet hours
    const at0300 = instantAtAucklandHour(3); // inside, the other side of midnight
    const at1300 = instantAtAucklandHour(13); // outside

    assert('clock', '23:00 NZ is inside quiet hours', isQuietHours(at2300) === true);
    assert('clock', '03:00 NZ is inside quiet hours', isQuietHours(at0300) === true);
    assert('clock', '13:00 NZ is outside quiet hours', isQuietHours(at1300) === false);

    // ── Fixture: a wrap-up link old enough for the dispatcher to pick up ──
    const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const host = await prisma.person.create({ data: { name: `${TAG} Host` } });
    createdPersonIds.push(host.id);

    const event = await prisma.event.create({
      data: {
        name: `${TAG} quiet-hours test`,
        startDate: past,
        endDate: past,
        hostId: host.id,
        status: 'CONFIRMING',
        sentAt: past,
        wrappedAt: new Date(),
      },
    });
    eventId = event.id;

    const guest = await prisma.person.create({
      data: { name: `${TAG} Guest` },
    });
    createdPersonIds.push(guest.id);

    // Created well before the DISPATCH_DELAY_MINUTES cutoff, so the only thing standing
    // between this row and dispatch is the guard under test.
    //
    // NO CARRIER IS REACHABLE FROM THIS ROW, deliberately. The dispatch loop calls
    // `sendSms` only for `channel === 'sms' && guestPhone`, and `sendNudgeEmail` only
    // for `channel === 'email' && guestEmail`; with both contact fields null it falls to
    // the final `else` ("No valid contact method"), marks the row dispatched+failed, and
    // touches no provider. That is exactly what the 13:00 control needs — proof the
    // batch was PROCESSED — without a real Resend or TNZ call. A row carrying a live
    // phone or email here would attempt a genuine send the moment the guard let it
    // through, which is the one thing a quiet-hours test must never do.
    const link = await prisma.wrapUpLink.create({
      data: {
        token: `${TAG}-token-${Date.now()}`,
        eventId,
        personId: guest.id,
        guestName: guest.name,
        guestEmail: null,
        guestPhone: null,
        channel: 'sms',
        dispatched: false,
        createdAt: new Date(Date.now() - 60 * 60 * 1000), // an hour old
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // ── QUIET HOURS — 23:00 NZ. The host pressed wrap-up ten minutes ago. ──
    const evening = await dispatchPendingWrapUpMessages(at2300);

    assert('23:00 NZ', 'sends nothing', evening.sent === 0);
    assert('23:00 NZ', 'fails nothing (it deferred, it did not error)', evening.failed === 0);
    assert('23:00 NZ', 'reports the message as deferred', evening.deferred === 1);
    assert(
      '23:00 NZ',
      'reports minutes until the send window opens',
      evening.deferredUntilMinutes > 0
    );

    const afterEvening = await prisma.wrapUpLink.findUnique({ where: { id: link.id } });
    assert('23:00 NZ', 'the link is still pending', afterEvening?.dispatched === false);
    assert('23:00 NZ', 'the link is not marked failed', afterEvening?.failed === false);
    assert('23:00 NZ', 'nothing was stamped as dispatched', afterEvening?.dispatchedAt === null);

    const sentEvents = await prisma.inviteEvent.count({
      where: { eventId, type: { in: ['WRAPUP_MESSAGE_SENT', 'WRAPUP_MESSAGE_FAILED'] } },
    });
    assert('23:00 NZ', 'no send was logged', sentEvents === 0);

    // ── QUIET HOURS, other side of midnight — 03:00 NZ ──
    const earlyMorning = await dispatchPendingWrapUpMessages(at0300);
    assert('03:00 NZ', 'still sends nothing', earlyMorning.sent === 0);
    assert('03:00 NZ', 'still reports the message as deferred', earlyMorning.deferred === 1);

    const afterMorning = await prisma.wrapUpLink.findUnique({ where: { id: link.id } });
    assert('03:00 NZ', 'the link survives the deferral', afterMorning?.dispatched === false);

    // ── CONTROL — 13:00 NZ. The guard must let the batch THROUGH. ──
    // Without this the guard could "pass" by never dispatching at all.
    const afternoon = await dispatchPendingWrapUpMessages(at1300);

    assert('13:00 NZ', 'defers nothing', afternoon.deferred === 0);
    assert('13:00 NZ', 'picks the pending link up', afternoon.total === 1);

    const afterAfternoon = await prisma.wrapUpLink.findUnique({ where: { id: link.id } });
    assert(
      '13:00 NZ',
      'the deferral was durable — the same link dispatches once the window opens',
      afterAfternoon?.dispatched === true
    );
    assert(
      '13:00 NZ',
      'and it was attempted exactly once (sent or failed, not both, not twice)',
      afternoon.sent + afternoon.failed === 1
    );
  } finally {
    if (eventId) {
      await prisma.wrapUpLink.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.auditEntry.deleteMany({ where: { eventId } });
      await prisma.inviteEvent.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
    }
    if (createdPersonIds.length) {
      await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('\nRED assertions:');
    redAssertions.forEach((a) => console.error(`  ✗ ${a}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
