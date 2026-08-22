import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange } from '@/lib/ledger';
import { callClaudeForJSON } from '@/lib/ai/claude';
import { MAX_TOKENS_FULL_PLAN } from '@/lib/ai/token-limits';
import { buildPlanGenerationPrompt } from '@/lib/ai/prompts';
import {
  buildPlanGenerationInput,
  synthesizeCategoryInput,
  CATEGORY_LABELS,
  FOOD_CATEGORY_ORDER,
  type FullPlanResponse,
} from '@/lib/ai/plan-input';
import { createRevision } from '@/lib/workflow';

// GTC-236: V2 regenerate. One Claude call per invocation, same budget pool and limit as
// finalize-plan (GTC-145 lowered it from 20 → 10) — regenerating and generating draw from
// the same allowance.
const AI_CALL_LIMIT = 10;

const VALID_KEYS = new Set<string>(FOOD_CATEGORY_ORDER);

/**
 * Preserved items are described to the model in display form — stored quantities mix
 * amount / enum unit / custom unit / free text, and the model only needs to read them.
 */
function formatQuantity(item: {
  quantityAmount: number | null;
  quantityUnit: string | null;
  quantityUnitCustom: string | null;
  quantityText: string | null;
}): string {
  if (item.quantityAmount != null) {
    const unit =
      item.quantityUnitCustom ?? (item.quantityUnit === 'CUSTOM' ? '' : (item.quantityUnit ?? ''));
    return `${item.quantityAmount} ${unit}`.trim().toLowerCase();
  }
  return item.quantityText ?? '';
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const body = (await request.json().catch(() => ({}))) as {
      scope?: string;
      categoryKey?: string;
    };
    const scope = body.scope;
    const categoryKey = body.categoryKey;

    if (scope !== 'plan' && scope !== 'category') {
      return NextResponse.json({ error: "scope must be 'plan' or 'category'" }, { status: 400 });
    }
    if (scope === 'category' && (!categoryKey || !VALID_KEYS.has(categoryKey))) {
      return NextResponse.json(
        {
          error: 'categoryKey is required for category scope and must be a known food category key',
        },
        { status: 400 }
      );
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if ((event.aiCallsUsed ?? 0) >= AI_CALL_LIMIT) {
      return NextResponse.json({ error: 'AI call limit reached for this event' }, { status: 429 });
    }

    const setup = await prisma.eventSetup.findUnique({ where: { eventId } });
    if (!setup) {
      // V2-only by construction: no EventSetup means a V1 event, which keeps its own
      // regenerate pipeline. No V2-awareness is added to V1 code for this (GTC-233).
      return NextResponse.json({ error: 'No event setup found' }, { status: 404 });
    }

    // Category scope: the target is a Team, resolved through the canonical label map.
    // A renamed team falls out of this lookup and 404s cleanly — documented limitation.
    let targetTeamId: string | null = null;
    if (scope === 'category') {
      const targetTeam = await prisma.team.findFirst({
        where: { eventId, name: CATEGORY_LABELS[categoryKey!] ?? categoryKey },
        select: { id: true },
      });
      if (!targetTeam) {
        return NextResponse.json(
          { error: `No category found for key '${categoryKey}'` },
          { status: 404 }
        );
      }
      targetTeamId = targetTeam.id;
    }

    const scopeFilter = targetTeamId ? { teamId: targetTeamId } : { team: { eventId } };

    // Preservables: everything in scope that is not disposable AI output. TEMPLATE is
    // deliberately included here — V1's regenerate spares TEMPLATE items from deletion
    // but forgets to tell the model they exist; this route closes that gap.
    const preservedItems = await prisma.item.findMany({
      where: {
        ...scopeFilter,
        kind: 'ITEM',
        OR: [{ source: { in: ['MANUAL', 'HOST_EDITED', 'TEMPLATE'] } }, { isProtected: true }],
      },
      include: { team: { select: { name: true } } },
    });

    // Regeneratable: unedited AI food output, and only that. TASK rows (GTC-171) are
    // never touched — regeneration is food-only.
    const regenerableWhere = {
      ...scopeFilter,
      kind: 'ITEM' as const,
      source: 'GENERATED' as const,
      isProtected: false,
    };

    // Founder refinement (2026-08-22): an empty scope short-circuits BEFORE the
    // checkpoint and the AI call — the trigger stays enabled and the click gets an
    // explanation rather than a disabled control, but a regenerate with nothing to
    // replace must cost nothing and write nothing.
    const regenerableCount = await prisma.item.count({ where: regenerableWhere });
    if (regenerableCount === 0) {
      return NextResponse.json({
        noop: true,
        preservedCount: preservedItems.length,
        replacedCount: 0,
        createdCount: 0,
        scope,
        categoryKey: categoryKey ?? null,
      });
    }

    // Actor first: AuditEntry.actorId references Person, and ledgerActorForUser is the
    // canonical User→Person resolution — createRevision and recordChange must agree on it.
    const actor = await ledgerActorForUser(auth.user, auth.role);
    if (!actor.id) {
      // LedgerActor.id is nullable for SYSTEM actors; an authenticated HOST/COHOST
      // always resolves to a Person, so this is unreachable — the guard narrows the type.
      return NextResponse.json({ error: 'Could not resolve acting person' }, { status: 500 });
    }

    // Checkpoint BEFORE anything destructive, unconditionally, actor from auth — not
    // V1's client-supplied-actorId, swallowed-failure pattern. A checkpoint failure
    // aborts here, before any deletion, so nothing is lost.
    const revisionId = await createRevision(
      eventId,
      actor.id,
      `Before V2 regeneration (${scope}${categoryKey ? `: ${categoryKey}` : ''})`
    );

    // Build the prompt through the SAME assembly as finalize-plan.
    const { promptInput } = await buildPlanGenerationInput(eventId, event, setup);

    let engagedCategories = promptInput.engagedCategories;
    if (scope === 'category') {
      engagedCategories = engagedCategories.filter(
        (c) => c.key === categoryKey && !c.stillDeciding
      );
      if (engagedCategories.length === 0) {
        // The team exists but the category is no longer engaged (or is marked
        // still-deciding) in the current setup. Ruling Q2b: an explicit regenerate
        // click is the host asking for output — synthesize the category input.
        engagedCategories = [synthesizeCategoryInput(promptInput.eventType, categoryKey!)];
      }
    } else {
      engagedCategories = engagedCategories.filter((c) => !c.stillDeciding);
      if (engagedCategories.length === 0) {
        return NextResponse.json(
          { error: 'Nothing to regenerate — no engaged categories in the event setup' },
          { status: 422 }
        );
      }
    }

    const { system, user } = buildPlanGenerationPrompt({
      ...promptInput,
      engagedCategories,
      // Food-only: task rows are GTC-171's and regeneration never touches them, so the
      // model is not asked to produce any.
      setUpNotes: '',
      cleanUpNotes: '',
      otherJobsNotes: '',
      preservableItems: preservedItems.map((i) => ({
        category: i.team.name,
        name: i.name,
        quantity: formatQuantity(i),
        notes: i.notes ?? undefined,
      })),
    });

    // AI call BEFORE any deletion — an AI failure must leave the plan intact. (V1
    // clears first; that ordering is deliberately not copied.) No mock fallback,
    // matching finalize-plan: fail loud, zero DB writes.
    const result = await callClaudeForJSON<FullPlanResponse>(system, user, {
      maxTokens: MAX_TOKENS_FULL_PLAN,
      temperature: 0.8,
      callSiteLabel: `regenerate-plan:${scope}`,
    });

    let sections = (Array.isArray(result.sections) ? result.sections : []).filter(
      (s) => s && Array.isArray(s.items) && s.items.length > 0
    );
    if (scope === 'category') {
      // Enforce scope server-side even if the model strays.
      sections = sections.filter((s) => s.key === categoryKey);
    }

    const batchId = `m2-regen-${Date.now()}`;

    const { replaced, created } = await prisma.$transaction(async (tx) => {
      const del = await tx.item.deleteMany({ where: regenerableWhere });

      let createdCount = 0;
      for (const section of sections) {
        const key = section.key ?? '';
        const label = CATEGORY_LABELS[key] ?? section.category ?? key;
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

        // Append after surviving (preserved) items rather than restarting at 1.
        const maxDisp = await tx.item.aggregate({
          where: { teamId: team.id },
          _max: { displayOrder: true },
        });
        let nextDisplayOrder = (maxDisp._max.displayOrder ?? 0) + 1;

        for (const item of section.items) {
          await tx.item.create({
            data: {
              name: item.name,
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
          createdCount++;
        }
      }

      // Sweep GENERATED teams in scope left empty — per-team deletes, never an unscoped
      // team.deleteMany (the cascade would take TASK rows; clearPlanForRegeneration's
      // comment records the same trap).
      const sweepCandidates = await tx.team.findMany({
        where: {
          eventId,
          source: 'GENERATED',
          isProtected: false,
          ...(targetTeamId ? { id: targetTeamId } : {}),
        },
        include: { _count: { select: { items: true } } },
      });
      for (const t of sweepCandidates) {
        if (t._count.items === 0) {
          await tx.team.delete({ where: { id: t.id } });
        }
      }

      await tx.event.update({
        where: { id: eventId },
        data: { aiCallsUsed: { increment: 1 } },
      });

      // Bulk convention (GTC-201): one recorded step, the PlanRevision checkpoint
      // carrying the detail. In-transaction and last, per recordChange's contract —
      // the restoreFromRevision worked example, not V1's post-hoc variant.
      await recordChange(tx, {
        eventId,
        actor,
        reason: null,
        changes: [
          {
            action: 'REGENERATE_PLAN',
            targetType: 'Event',
            targetId: eventId,
            before: {
              revisionId,
              scope,
              categoryKey: categoryKey ?? null,
              preserved: preservedItems.length,
              replaced: del.count,
            },
            after: { created: createdCount, batchId },
          },
        ],
      });

      return { replaced: del.count, created: createdCount };
    });

    return NextResponse.json({
      preservedCount: preservedItems.length,
      replacedCount: replaced,
      createdCount: created,
      scope,
      categoryKey: categoryKey ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to regenerate plan',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
