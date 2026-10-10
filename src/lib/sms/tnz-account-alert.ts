import type { PrismaClient } from '@prisma/client';
import { getResendClient } from '@/lib/email';

/**
 * [[GTC-290]] — THE FOUNDER'S EMAIL WHEN TNZ HOLD TEXTS FOR CREDIT OR BLOCK A LINK.
 *
 * Founder ruling SCOPED Q1, 2026-10-02, verbatim: *"Gather emails me too (Recommended)"* — *"The first
 * time the check finds a credit hold or a blocked link, Gather emails you, once, so you hear about it
 * even if TNZ's email goes astray."* The address is a setting, `GATHER_ALERT_EMAIL`, set at the
 * deploy and never written in the repo or logged.
 *
 * ── WHAT ONE EPISODE IS — plan ruling Q1 ──────────────────────────────────────
 *
 *   - A credit hold: from the first held text until NO text is held. *"A hold that comes back after
 *     I've topped up emails me again."* A run that read a hold never closes it.
 *   - A blocked link: from the first sighting until 48 hours pass with no new one.
 *
 * ── HOW A SECOND EMAIL IS PREVENTED ───────────────────────────────────────────
 *
 * One `TnzAccountAlert` row per episode. Its `openKind` is unique and holds the kind while the
 * episode is open, NULL once closed. INSERTING THE ROW IS THE CLAIM, as [[GTC-258]]'s `retryOfId`
 * is: two overlapping runs cannot both open an episode, so they cannot both email. The email goes
 * after the insert. One attempt per episode (plan ruling Q3): a failure is kept in `emailError` and
 * the run answers 500, so the scheduler's own failure email reaches the founder.
 *
 * ── WHAT IT IS NOT ────────────────────────────────────────────────────────────
 *
 * Not mail to a guest: it names no guest, number, event or MessageID, carries no footer, and reads
 * neither Zone 9 table, for the reason ruling 6 of [[GTC-296]] exempts account mail. It goes through
 * `getResendClient`, so the live switch stops it everywhere but production.
 */

export type TnzAlertKind = 'CREDIT_HOLD' | 'LINK_NOT_PERMITTED';
export type TnzAlertOutcome = 'SENT' | 'ALREADY_OPEN' | 'NOT_SENT';

export const ALERT_EMAIL_SETTING = 'GATHER_ALERT_EMAIL';

/** Plan ruling Q1: a blocked-link episode ends after this long with no new sighting. */
export const LINK_EPISODE_QUIET_MS = 48 * 60 * 60 * 1000;

const KINDS: readonly TnzAlertKind[] = ['CREDIT_HOLD', 'LINK_NOT_PERMITTED'];

/** The founder's words, ruled at the plan (Q2). The first-seen time is New Zealand's. */
export function tnzAlertWords(
  kind: TnzAlertKind,
  firstSeenAt: Date,
  appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL
): { subject: string; text: string } {
  const seen = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(firstSeenAt);
  if (kind === 'CREDIT_HOLD') {
    return {
      subject: 'Gather: TNZ is holding texts — the account is out of credit',
      text: [
        "Gather's check with TNZ found a text TNZ is holding because the TNZ account has no credit. While it has none, no text Gather sends will go out.",
        '',
        "Top up the TNZ account. An invitation still held 48 hours after TNZ took it will show red on its host's board, as a problem on our side.",
        '',
        `First seen: ${seen}.`,
        'Gather will email you again only if texts are held again after this clears.',
      ].join('\n'),
    };
  }
  let host: string | null = null;
  try {
    host = appUrl ? new URL(appUrl).host : null;
  } catch {
    host = null;
  }
  return {
    subject: "Gather: TNZ is blocking a link in Gather's texts",
    text: [
      "Gather's check with TNZ found a text TNZ stopped because a link in it isn't on TNZ's approved list. Every text with that link will be stopped too. A stopped invitation shows red on its host's board straight away, as a problem on our side.",
      '',
      host
        ? `Ask TNZ to approve Gather's web address, ${host}.`
        : "Ask TNZ to approve Gather's web address.",
      '',
      `First seen: ${seen}.`,
      "Gather won't email about this again until it has gone 48 hours without finding another.",
    ].join('\n'),
  };
}

/** One attempt. The address is never logged or returned. */
async function sendAlertEmail(
  kind: TnzAlertKind,
  firstSeenAt: Date
): Promise<{ ok: true } | { ok: false; error: string }> {
  const to = process.env[ALERT_EMAIL_SETTING];
  if (!to || to.trim() === '') return { ok: false, error: `${ALERT_EMAIL_SETTING} is not set` };
  const words = tnzAlertWords(kind, firstSeenAt);
  try {
    const resend = getResendClient();
    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Gather <noreply@gather.app>',
      to,
      subject: words.subject,
      text: words.text,
    });
    if (response.error) {
      return {
        ok: false,
        error: response.error.message ?? response.error.name ?? 'Unknown Resend error',
      };
    }
    return { ok: true };
  } catch (error) {
    // getResendClient() throws when the key is missing or the live switch is off.
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

/** Close the episodes that have ended, by plan ruling Q1. */
async function closeEndedEpisodes(
  db: PrismaClient,
  sighted: Partial<Record<TnzAlertKind, string>>,
  now: Date
): Promise<void> {
  if (!sighted.CREDIT_HOLD) {
    const heldNow = await db.outboundMessage.count({
      where: { channel: 'TEXT', deliveryState: 'TEXT_HELD_FOR_CREDIT', deliveryPollDoneAt: null },
    });
    if (heldNow === 0) {
      await db.tnzAccountAlert.updateMany({
        where: { openKind: 'CREDIT_HOLD' },
        data: { openKind: null, closedAt: now },
      });
    }
  }
  await db.tnzAccountAlert.updateMany({
    where: {
      openKind: 'LINK_NOT_PERMITTED',
      lastSeenAt: { lt: new Date(now.getTime() - LINK_EPISODE_QUIET_MS) },
    },
    data: { openKind: null, closedAt: now },
  });
}

/**
 * What a run saw, per kind: the id of one text that showed it. Closes the episodes that ended, then
 * opens one per kind seen with none open — and emails once for each it opened.
 */
export async function noteTnzSightings(
  db: PrismaClient,
  sighted: Partial<Record<TnzAlertKind, string>>,
  now: Date = new Date()
): Promise<Record<TnzAlertKind, TnzAlertOutcome | null>> {
  await closeEndedEpisodes(db, sighted, now);
  const out: Record<TnzAlertKind, TnzAlertOutcome | null> = {
    CREDIT_HOLD: null,
    LINK_NOT_PERMITTED: null,
  };
  for (const kind of KINDS) {
    const outboundMessageId = sighted[kind];
    if (outboundMessageId === undefined) continue;
    let episodeId: string;
    try {
      const row = await db.tnzAccountAlert.create({
        data: { kind, openKind: kind, firstSeenAt: now, lastSeenAt: now, outboundMessageId },
        select: { id: true },
      });
      episodeId = row.id;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      await db.tnzAccountAlert.updateMany({
        where: { openKind: kind, lastSeenAt: { lt: now } },
        data: { lastSeenAt: now },
      });
      out[kind] = 'ALREADY_OPEN';
      continue;
    }
    const sent = await sendAlertEmail(kind, now);
    await db.tnzAccountAlert.update({
      where: { id: episodeId },
      data: sent.ok ? { emailedAt: new Date() } : { emailError: sent.error },
    });
    if (!sent.ok) {
      console.error(`[TnzAlert] the ${kind} email was not sent: ${sent.error}`);
    }
    out[kind] = sent.ok ? 'SENT' : 'NOT_SENT';
  }
  return out;
}
