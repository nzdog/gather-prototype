import { Prisma } from '@prisma/client';
import { CATEGORY_EMOJIS, CATEGORY_LABELS } from '@/lib/ai/plan-categories';
import type { SectionResponse } from '@/lib/ai/plan-input';
import { itemNameForStorage } from '@/lib/items/name';

type Tx = Prisma.TransactionClient;

/**
 * GTC-237 — the write phase, shared by `finalize-plan` and `regenerate-plan`. `plan-input.ts` is the input half of the same
 * seam: GTC-236 pulled the prompt assembly out so `finalize-plan` and
 * `regenerate-plan` build through one code path. This is the output half,
 * pulled out for the same reason and one more.
 *
 * THE ONE MORE IS TESTABILITY, and it is the stronger argument. Before this
 * module the only way to exercise what a regeneration does to the database
 * was to run a route that spends one of an event's ten Claude calls. A
 * High-severity data-loss path that costs money to assert does not get
 * asserted. `applyPlanSections` takes a sections array, so a test hands it a
 * fabricated payload and reads rows back.
 */

/**
 * The category label, CANONICAL FIRST.
 *
 * The two routes disagreed before this module existed: `finalize-plan`
 * preferred the model's `category` string and fell back to the canonical map,
 * `regenerate-plan` preferred the canonical map. Canonical wins, because
 * find-or-create keys on this string — model-first is exactly what produces a
 * second team of nearly the same name on a rerun, and a naming rule that
 * depends on an AI returning the same string twice is not a rule.
 */
export function planCategoryLabel(section: SectionResponse): string {
  const key = section.key ?? '';
  return CATEGORY_LABELS[key] ?? section.category ?? key ?? 'Items';
}

/**
 * The emoji, model first — the opposite precedence to the label above, on
 * purpose. Nothing keys on the emoji, so a model-supplied one that is nicer
 * than the canonical one costs nothing, and a typo'd one falls back.
 */
export function planCategoryEmoji(section: SectionResponse): string {
  const key = section.key ?? '';
  return section.emoji || CATEGORY_EMOJIS[key] || '📋';
}

/**
 * What a regeneration is allowed to throw away: the model's own untouched draft, and
 * nothing else. Everything absent from this predicate is preserved.
 *
 * TWO TESTS, NOT ONE. Provenance is the first — `source` and `isProtected`, the fields
 * V1's `clearPlanForRegeneration` already reads and the item PATCH already maintains by
 * flipping GENERATED → HOST_EDITED in place.
 *
 * A REPLY IS THE SECOND, and it is the one nothing read before GTC-237. An item a guest
 * has answered is a promise between two people; provenance records who drafted the row,
 * and a reply outranks a draft. So a GENERATED row nobody has touched is disposable only
 * while its assignment is absent or still PENDING.
 *
 * ⚠ "NOT PENDING" IS DELIBERATE AND WIDER THAN "SAID YES" (founder ruling, 2026-09-12).
 * DECLINED and MAYBE preserve the row too. Do not narrow this to ACCEPTED thinking you
 * are tightening a loose rule: replacing a declined item deletes the evidence that
 * someone said no, and the host needs to see that and re-home the item. The screen
 * exists to show her where the plan stands, not to tidy away the parts that went badly.
 */
export function disposableItemWhere(args: {
  eventId?: string;
  teamId?: string | null;
  kind: 'ITEM' | 'TASK';
}): Prisma.ItemWhereInput {
  const scope: Prisma.ItemWhereInput = args.teamId
    ? { teamId: args.teamId }
    : { team: { eventId: args.eventId } };
  return {
    ...scope,
    kind: args.kind,
    source: 'GENERATED',
    isProtected: false,
    OR: [{ assignment: { is: null } }, { assignment: { response: 'PENDING' } }],
  };
}

export async function applyPlanSections(
  tx: Tx,
  args: {
    eventId: string;
    sections: SectionResponse[];
    batchId: string;
    scopeTeamId?: string | null;
  }
): Promise<{ replaced: number; created: number }> {
  const { eventId, sections, batchId, scopeTeamId } = args;

  // ITEM LEVEL, NEVER TEAM LEVEL. The statement this replaces was
  // `team.deleteMany({ eventId, source: 'GENERATED' })`, which reasoned about
  // provenance one level too high: `Item.team` is onDelete: Cascade, so the rows the
  // predicate above exists to spare died with the team anyway. Deleting a team can
  // never be the way a regeneration clears items.
  const del = await tx.item.deleteMany({
    where: disposableItemWhere({ eventId, teamId: scopeTeamId, kind: 'ITEM' }),
  });
  const replaced = del.count;

  let created = 0;
  for (const section of sections) {
    const label = planCategoryLabel(section);

    // Find OR create. The team usually still stands, because the delete above took its
    // disposable rows and not the team itself.
    let team = await tx.team.findFirst({ where: { eventId, name: label } });
    if (!team) {
      const maxOrder = await tx.team.aggregate({
        where: { eventId },
        _max: { displayOrder: true },
      });
      team = await tx.team.create({
        data: {
          name: label,
          eventId,
          source: 'GENERATED',
          displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
        },
      });
    }

    // Append after whatever survived rather than restarting at 1, or the new rows
    // interleave with hers and the plan reads as though it were shuffled.
    const maxDisp = await tx.item.aggregate({
      where: { teamId: team.id },
      _max: { displayOrder: true },
    });
    let nextDisplayOrder = (maxDisp._max.displayOrder ?? 0) + 1;
    for (const item of section.items) {
      await tx.item.create({
        data: {
          // GTC-302: the name as stored — one leading article stripped, case untouched.
          name: itemNameForStorage(item.name) ?? item.name,
          teamId: team.id,
          quantityAmount: item.quantity,
          quantityUnit: 'CUSTOM',
          quantityUnitCustom: item.unit,
          quantityText: item.servingSize,
          notes: item.notes ?? null,
          critical: item.critical ?? false,
          criticalReason: item.critical
            ? (item.criticalReason ?? 'Important item for the event')
            : null,
          source: 'GENERATED',
          aiGenerated: true,
          userConfirmed: false,
          generatedBatchId: batchId,
          displayOrder: nextDisplayOrder,
          dietaryTags:
            item.dietaryTags && item.dietaryTags.length > 0 ? item.dietaryTags : undefined,
        },
      });
      nextDisplayOrder++;
      created++;
    }
  }

  return { replaced, created };
}

export async function sweepEmptyGeneratedTeams(
  tx: Tx,
  args: { eventId: string; scopeTeamId?: string | null }
): Promise<number> {
  const candidates = await tx.team.findMany({
    where: {
      eventId: args.eventId,
      source: 'GENERATED',
      isProtected: false,
      ...(args.scopeTeamId ? { id: args.scopeTeamId } : {}),
    },
    include: { _count: { select: { items: true } } },
  });
  let swept = 0;
  for (const t of candidates) {
    if (t._count.items === 0) {
      await tx.team.delete({ where: { id: t.id } });
      swept++;
    }
  }
  return swept;
}
