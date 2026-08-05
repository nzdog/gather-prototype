// src/lib/wrap-up.ts
// Core logic for GTC-FM2: post-event guest wrap-up messages

import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendSms } from '@/lib/sms/send-sms';
import { sendNudgeEmail } from '@/lib/email';
import { logInviteEvent } from '@/lib/invite-events';
import {
  buildSmsWrapUpMessage,
  buildEmailWrapUpMessage,
  resolveGuestTaskItem,
  type WrapUpTemplateParams,
} from '@/lib/sms/wrap-up-templates';
import { isMessageableRole } from '@/lib/eligibility/child-exclusion';

const WRAPUP_LINK_EXPIRY_DAYS = 30;
const DISPATCH_DELAY_MINUTES = 10;

// ── Input sanitisation for pre-populated query params ────────────────

const MAX_PARAM_LENGTH = 200;

export function sanitiseQueryParam(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/<[^>]*>/g, '') // strip HTML tags
    .replace(/[<>"'`]/g, '') // strip dangerous chars
    .replace(/javascript:/gi, '') // strip JS protocol
    .replace(/on\w+\s*=/gi, '') // strip event handlers
    .trim()
    .slice(0, MAX_PARAM_LENGTH);
}

// ── Link generation ──────────────────────────────────────────────────

export function generateLinkToken(): string {
  return randomBytes(24).toString('base64url');
}

export interface GuestForWrapUp {
  person: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    phoneNumber: string | null;
    smsOptedOut: boolean;
  };
  assignments: Array<{ item: { name: string }; response: string }>;
}

/**
 * A PersonEvent row as the wrap-up route loads it. Prisma's `include` returns every
 * scalar on the row, so `householdRole` arrives without the query asking for it.
 */
export interface WrapUpCandidate {
  personId: string;
  householdRole: string | null;
  person: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    phoneNumber: string | null;
    smsOptedOut: boolean;
    assignments: Array<{ item: { name: string }; response: string }>;
  };
}

/**
 * THE wrap-up recipient decision (GTC-172 / C1).
 *
 * Extracted from POST /api/events/[id]/wrap-up so it can be exercised by a DB-level
 * test without the requireEventRole cookie context — the same reason and the same
 * pattern as reconcileHouseholdMembers (GTC-159).
 *
 * This has to be the gate rather than dispatch: `WrapUpLink` denormalises
 * `guestPhone`/`guestEmail` at creation, so by the time dispatchPendingWrapUpMessages
 * runs there is no role left to check. A thank-you is a system message, and §10.6 is
 * absolute about who may receive one.
 */
export function selectWrapUpRecipients(
  people: WrapUpCandidate[],
  hostId: string
): GuestForWrapUp[] {
  return people
    .filter((pe) => pe.personId !== hostId) // exclude host
    .filter((pe) => isMessageableRole(pe.householdRole)) // GTC-172 (C1): §10.6
    .map((pe) => ({
      person: {
        id: pe.person.id,
        name: pe.person.name,
        email: pe.person.email,
        phone: pe.person.phone,
        phoneNumber: pe.person.phoneNumber,
        smsOptedOut: pe.person.smsOptedOut,
      },
      assignments: pe.person.assignments.map((a) => ({
        item: { name: a.item.name },
        response: a.response,
      })),
    }));
}

export async function generateWrapUpLinks(
  eventId: string,
  guests: GuestForWrapUp[]
): Promise<{ created: number; skipped: number; alreadyLinked: number }> {
  const expiresAt = new Date(Date.now() + WRAPUP_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  let created = 0;
  let skipped = 0;
  let alreadyLinked = 0;

  // GTC-209: one link per (event, person), forever.
  //
  // The route guard above stops a second press; this stops the narrower case it cannot
  // — two presses racing before either writes `wrappedAt`, and any future caller that
  // reaches here by another door. The dispatcher iterates ROWS, not people (:182), so a
  // duplicate row is a duplicate thank-you text, not a harmless extra record.
  //
  // Keyed on (event, person) rather than on the event, deliberately: a guest added
  // AFTER the press must still get their link. That is the mini-send model (Hinge §2,
  // gap #5) and it is what GTC-186 (H1) builds on — an event-level "already done" check
  // would pass every duplicate test and silently strip late guests instead.
  const existingLinks = await prisma.wrapUpLink.findMany({
    where: { eventId },
    select: { personId: true },
  });
  const linkedPersonIds = new Set(existingLinks.map((l) => l.personId));

  for (const guest of guests) {
    const { person } = guest;

    if (linkedPersonIds.has(person.id)) {
      alreadyLinked++;
      continue;
    }
    const phone = person.phoneNumber || person.phone || null;
    const email = person.email || null;

    // Determine channel
    let channel: string;
    if (phone && !person.smsOptedOut) {
      channel = 'sms';
    } else if (email) {
      channel = 'email';
    } else {
      channel = 'skipped';
    }

    const token = generateLinkToken();

    await prisma.wrapUpLink.create({
      data: {
        token,
        eventId,
        personId: person.id,
        guestName: person.name,
        guestEmail: email,
        guestPhone: phone,
        channel,
        dispatched: channel === 'skipped',
        expiresAt,
      },
    });

    linkedPersonIds.add(person.id);

    if (channel === 'skipped') {
      skipped++;
    } else {
      created++;
    }
  }

  return { created, skipped, alreadyLinked };
}

// ── Dispatch ─────────────────────────────────────────────────────────

export async function dispatchPendingWrapUpMessages(): Promise<{
  sent: number;
  failed: number;
  total: number;
}> {
  const cutoff = new Date(Date.now() - DISPATCH_DELAY_MINUTES * 60 * 1000);

  const pendingLinks = await prisma.wrapUpLink.findMany({
    where: {
      dispatched: false,
      createdAt: { lte: cutoff },
    },
    include: {
      event: {
        include: {
          host: true,
        },
      },
      person: true,
    },
  });

  let sent = 0;
  let failed = 0;

  for (const link of pendingLinks) {
    const hostFirstName = link.event.host.name.split(' ')[0];
    const guestFirstName = link.guestName.split(' ')[0];

    // Look up the guest's assignments for this event
    const assignments = await prisma.assignment.findMany({
      where: {
        personId: link.personId,
        item: { team: { eventId: link.eventId } },
      },
      include: { item: true },
    });

    const guestTaskItem = resolveGuestTaskItem(
      assignments.map((a) => ({ item: { name: a.item.name }, response: a.response }))
    );

    const templateParams: WrapUpTemplateParams = {
      guestFirstName,
      eventName: link.event.name,
      hostFirstName,
      guestTaskItem,
    };

    let success = false;
    let failReason: string | undefined;

    if (link.channel === 'sms' && link.guestPhone) {
      const smsResult = await sendSms({
        to: link.guestPhone,
        message: buildSmsWrapUpMessage(templateParams),
        eventId: link.eventId,
        personId: link.personId,
        metadata: { type: 'wrapup' },
      });

      if (smsResult.success) {
        success = true;
      } else if (link.guestEmail) {
        // SMS failed — fall back to email
        const emailMsg = buildEmailWrapUpMessage(templateParams);
        const emailResult = await sendNudgeEmail({
          to: link.guestEmail,
          subject: emailMsg.subject,
          body: emailMsg.body,
          eventId: link.eventId,
          personId: link.personId,
        });
        success = emailResult.success;
        if (!success) failReason = emailResult.error || 'Email fallback failed';
      } else {
        failReason = smsResult.error || smsResult.blocked || 'SMS failed, no email fallback';
      }
    } else if (link.channel === 'email' && link.guestEmail) {
      const emailMsg = buildEmailWrapUpMessage(templateParams);
      const emailResult = await sendNudgeEmail({
        to: link.guestEmail,
        subject: emailMsg.subject,
        body: emailMsg.body,
        eventId: link.eventId,
        personId: link.personId,
      });
      success = emailResult.success;
      if (!success) failReason = emailResult.error || 'Email send failed';
    } else {
      failReason = 'No valid contact method';
    }

    await prisma.wrapUpLink.update({
      where: { id: link.id },
      data: {
        dispatched: true,
        dispatchedAt: new Date(),
        failed: !success,
        failReason: success ? null : failReason,
      },
    });

    await logInviteEvent({
      eventId: link.eventId,
      personId: link.personId,
      type: success ? 'WRAPUP_MESSAGE_SENT' : 'WRAPUP_MESSAGE_FAILED',
      metadata: {
        channel: link.channel,
        wrapUpLinkId: link.id,
        ...(failReason ? { failReason } : {}),
      },
    });

    if (success) sent++;
    else failed++;

    // 500ms delay between sends to avoid rate limiting
    if (pendingLinks.indexOf(link) < pendingLinks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return { sent, failed, total: pendingLinks.length };
}

// ── Dispatch summary ─────────────────────────────────────────────────

export interface DispatchSummary {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  earliestCreatedAt: string | null;
  guests: Array<{
    personId: string;
    name: string;
    channel: string;
    dispatched: boolean;
    failed: boolean;
    failReason: string | null;
  }>;
}

export async function getDispatchSummary(eventId: string): Promise<DispatchSummary> {
  const links = await prisma.wrapUpLink.findMany({
    where: { eventId },
    orderBy: { createdAt: 'asc' },
  });

  const sent = links.filter((l) => l.dispatched && !l.failed && l.channel !== 'skipped').length;
  const failed = links.filter((l) => l.dispatched && l.failed).length;
  const skipped = links.filter((l) => l.channel === 'skipped').length;
  const pendingLinks2 = links.filter((l) => !l.dispatched);
  const pending = pendingLinks2.length;

  // Earliest createdAt among pending (undispatched) links — used for countdown timer
  const earliestCreatedAt =
    pendingLinks2.length > 0
      ? pendingLinks2
          .reduce(
            (earliest, l) => (l.createdAt < earliest ? l.createdAt : earliest),
            pendingLinks2[0].createdAt
          )
          .toISOString()
      : null;

  return {
    total: links.length,
    sent,
    failed,
    skipped,
    pending,
    earliestCreatedAt,
    guests: links.map((l) => ({
      personId: l.personId,
      name: l.guestName,
      channel: l.channel,
      dispatched: l.dispatched,
      failed: l.failed,
      failReason: l.failReason,
    })),
  };
}

// ── Retry failed dispatches ──────────────────────────────────────────

export async function retryFailedDispatches(eventId: string): Promise<number> {
  const failedLinks = await prisma.wrapUpLink.findMany({
    where: { eventId, failed: true },
  });

  // Reset them so the cron dispatch picks them up
  for (const link of failedLinks) {
    await prisma.wrapUpLink.update({
      where: { id: link.id },
      data: {
        dispatched: false,
        failed: false,
        failReason: null,
        dispatchedAt: null,
        // Reset createdAt so delay is relative to retry time
        createdAt: new Date(),
      },
    });
  }

  return failedLinks.length;
}
