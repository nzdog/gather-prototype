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

export function buildStartLink(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/?token=${encodeURIComponent(token)}`;
}

interface GuestForWrapUp {
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

export async function generateWrapUpLinks(
  eventId: string,
  guests: GuestForWrapUp[]
): Promise<{ created: number; skipped: number }> {
  const expiresAt = new Date(Date.now() + WRAPUP_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  let created = 0;
  let skipped = 0;

  for (const guest of guests) {
    const { person } = guest;
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

    if (channel === 'skipped') {
      skipped++;
    } else {
      created++;
    }
  }

  return { created, skipped };
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

    const newEventLink = buildStartLink(link.token);

    const templateParams: WrapUpTemplateParams = {
      guestFirstName,
      eventName: link.event.name,
      hostFirstName,
      guestTaskItem,
      newEventLink,
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
