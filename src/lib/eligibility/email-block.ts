import type { Prisma } from '@prisma/client';
import type { ResendOutcomeKind } from '@/lib/email-delivery/resend-delivery-contract';
import type { EmailBlockState } from '@/lib/eligibility/email-block-words';

/**
 * [[GTC-324]] / [[GTC-189]] slice 8a — THE ADDRESS-WIDE BLOCK. The fact, its one writer's rule,
 * and the per-event read.
 *
 * ── WHERE IT SITS, BESIDE ITS SIBLING ────────────────────────────────────────
 *
 *   `EmailOptOut` (`email-opt-out.ts`) — a person's no to ONE event. GTC-296.
 *   `EmailBlock`  (this module)        — an address the provider will not deliver to, anywhere.
 *
 * A complaint writes BOTH (GTC-324 rulings 1 and 2): the per-event no, so everything GTC-296 built
 * applies to that event, and the address-wide block, so every other host stops treating the
 * address as email-reachable. A hard bounce and a suppression write the block alone (D6) — they
 * are not a person's no, so no event's opt-out is invented for them.
 *
 * ⚠ THE BLOCK IS NOT A NO TO BEING CHASED. The chooser treats a blocked address as NO ADDRESS:
 * the ask and the chase fall to text when there is a usable mobile, and otherwise the person is
 * the host's (ruling 2). Only the reported event stops the chase on every channel, and it does
 * that through `EmailOptOut`, not through this row.
 *
 * ⚠ KEYED ON THE ADDRESS THE PROVIDER REPORTS, NEVER `Person.email` AT POLL TIME. Ruling U's
 * "edit the address and send" can change the person's address between a send and its poll; the
 * block must land on the address that was actually refused.
 */

/** The outcomes that put an address on the provider's list (GTC-324 ruling 2, D6). */
export const BLOCKING_OUTCOMES: ReadonlySet<ResendOutcomeKind> = new Set<ResendOutcomeKind>([
  'COMPLAINED',
  'BOUNCED',
  'SUPPRESSED',
]);

/** One spelling of "the same address", for the writer and every reader. */
export function normalizeEmailAddress(address: string): string {
  return address.trim().toLowerCase();
}

export interface EmailBlockFact {
  reason: string;
  eventId: string | null;
}

/**
 * The blocks for a set of addresses, in ONE query — the shape `listEmailOptOutsForEvent` uses,
 * for the same reason: every walk of a roster would otherwise put the query count under the
 * guest list's control.
 */
export async function listEmailBlocks(
  db: Prisma.TransactionClient,
  addresses: readonly (string | null | undefined)[]
): Promise<Map<string, EmailBlockFact>> {
  const wanted = [...new Set(addresses.filter((a): a is string => !!a).map(normalizeEmailAddress))];
  if (wanted.length === 0) return new Map();
  const rows = await db.emailBlock.findMany({
    where: { address: { in: wanted } },
    select: { address: true, reason: true, eventId: true },
  });
  return new Map(rows.map((r) => [r.address, { reason: r.reason, eventId: r.eventId }]));
}

/**
 * Where one person stands on one event.
 *
 * REPORTED only when the complaint was about a message of THIS event (D4). A complaint made on
 * another event reads BLOCKED here — neutral words, and the report is never disclosed.
 */
export function emailBlockStateOf(
  email: string | null,
  eventId: string,
  blocks: ReadonlyMap<string, EmailBlockFact>
): EmailBlockState {
  if (!email) return 'NONE';
  const block = blocks.get(normalizeEmailAddress(email));
  if (!block) return 'NONE';
  return block.reason === 'COMPLAINED' && block.eventId === eventId ? 'REPORTED' : 'BLOCKED';
}

/**
 * THE ONE WRITER'S RULE. Called by the delivery poll, inside the transaction that writes the
 * outcome, for every address the provider says the message went to.
 *
 * First write wins, with one exception: a complaint UPGRADES an earlier bounce or suppression,
 * taking the message and event with it, because the complaint is the fact that decides who may
 * be shown ruling 3's middle sentence.
 */
export async function recordEmailBlock(
  tx: Prisma.TransactionClient,
  args: {
    address: string;
    reason: ResendOutcomeKind;
    outboundMessageId: string;
    eventId: string;
  }
): Promise<void> {
  if (!BLOCKING_OUTCOMES.has(args.reason)) return;
  const address = normalizeEmailAddress(args.address);
  if (!address) return;
  // An upsert rather than read-then-create: two overlapping poll ticks can read the same outcome
  // for two messages to one address, and a create would fail the second on the unique.
  await tx.emailBlock.upsert({
    where: { address },
    create: {
      address,
      reason: args.reason,
      outboundMessageId: args.outboundMessageId,
      eventId: args.eventId,
    },
    update: {},
  });
  if (args.reason === 'COMPLAINED') {
    await tx.emailBlock.updateMany({
      where: { address, reason: { not: 'COMPLAINED' } },
      data: {
        reason: 'COMPLAINED',
        outboundMessageId: args.outboundMessageId,
        eventId: args.eventId,
      },
    });
  }
}

/** The recorded skip for the automatic senders that still check for themselves. */
export const EMAIL_BLOCK_SKIP_REASON = 'Address blocked by the email provider (GTC-324)';
