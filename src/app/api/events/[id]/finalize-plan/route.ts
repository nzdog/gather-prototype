import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordBulkPlanChange } from '@/lib/ledger';
import { createRevision } from '@/lib/workflow';
import { callClaudeForJSON } from '@/lib/ai/claude';
import { MAX_TOKENS_FULL_PLAN } from '@/lib/ai/token-limits';
import { buildPlanGenerationPrompt } from '@/lib/ai/prompts';
// GTC-236: input assembly extracted move-only to plan-input.ts so regenerate-plan
// builds through the same code path — one definition, no drift.
import { buildPlanGenerationInput, type FullPlanResponse } from '@/lib/ai/plan-input';
import { TASK_BUCKETS, selectTaskRows } from '@/lib/ai/tasks';
// GTC-237: the write phase, shared with regenerate-plan. See plan-write.ts.
import {
  applyPlanSections,
  disposableItemWhere,
  planCategoryEmoji,
  planCategoryLabel,
  sweepEmptyGeneratedTeams,
} from '@/lib/ai/plan-write';

// GTC-145: lowered from 20 → 10. The single-call architecture fires exactly
// one Claude call per finalize-plan invocation, so 10 gives ample headroom
// for retries and any future small auxiliary calls without crowding the cap.
const AI_CALL_LIMIT = 10;

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if ((event.aiCallsUsed ?? 0) >= AI_CALL_LIMIT) {
      return NextResponse.json({ error: 'AI call limit reached for this event' }, { status: 429 });
    }

    const setup = await prisma.eventSetup.findUnique({ where: { eventId } });
    if (!setup) {
      return NextResponse.json({ error: 'No event setup found' }, { status: 404 });
    }

    const { promptInput, bucketIsEligible } = await buildPlanGenerationInput(eventId, event, setup);

    const { system, user } = buildPlanGenerationPrompt(promptInput);

    const result = await callClaudeForJSON<FullPlanResponse>(system, user, {
      maxTokens: MAX_TOKENS_FULL_PLAN,
      temperature: 0.8,
      callSiteLabel: 'finalize-plan:full',
    });

    /**
     * Increment AI call counter once for the single call.
     *
     * GTC-237: this stays OUTSIDE the write transaction below, deliberately. The call
     * has been made and billed by the time this line runs; a write-phase rollback must
     * not refund it, or a repeatable failure becomes a free loop through the cap.
     *
     * ⚠ `regenerate-plan` does the opposite — it increments inside its transaction —
     * and GTC-237 did not change it. The difference is real and is not an oversight
     * here; whichever way it is settled should be settled in one place, on its own
     * ticket, for both routes at once.
     */
    await prisma.event.update({
      where: { id: eventId },
      data: { aiCallsUsed: { increment: 1 } },
    });

    const sections = Array.isArray(result.sections) ? result.sections : [];
    const dietaryCoverage = Array.isArray(result.dietaryCoverage) ? result.dietaryCoverage : [];
    const thingsToConsider = Array.isArray(result.thingsToConsider) ? result.thingsToConsider : [];

    // GTC-171 (B2): a task survives only if its bucket has settled free text behind it.
    const tasksByBucket = selectTaskRows(result.tasks, bucketIsEligible);

    // GTC-237: the sections actually written, filtered once and shared by the
    // write phase and the response — so the preview names what the database
    // holds rather than a parallel mapping of the same payload.
    const writtenSections = sections.filter(
      (s) => s && Array.isArray(s.items) && s.items.length > 0
    );

    // Map model response → response shape consumed by Moment2Step2Skeleton.
    // GTC-237: label and emoji now come from plan-write's resolvers — label
    // canonical-first, because find-or-create keys on it.
    const categories = writtenSections.map((s) => {
      const emoji = planCategoryEmoji(s);
      const name = planCategoryLabel(s);
      return {
        name,
        emoji,
        items: s.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          servingSize: item.servingSize,
          notes: item.notes,
          critical: item.critical ?? false,
          // Match the legacy path's defensive backfill (generate.ts):
          // a critical item with no reason still gets one rather than
          // dropping the reason silently.
          criticalReason: item.critical
            ? (item.criticalReason ?? 'Important item for the event')
            : null,
          dietaryTags: item.dietaryTags ?? [],
        })),
      };
    });

    const batchId = `m2-finalize-${Date.now()}`;

    const actor = await ledgerActorForUser(auth.user, auth.role);

    /**
     * GTC-237: a checkpoint before anything destructive — but ONLY on a rerun.
     *
     * This is the carve-out GTC-237 asks for, stated rather than implied. A first
     * generation destroys nothing, so its behaviour is unchanged to the row: no
     * revision is written, because there is no prior plan to write. A rerun is the
     * branch this ticket exists for, and it checkpoints before the first delete, so a
     * checkpoint failure aborts with the plan still whole.
     *
     * `createRevision` opens its own transaction, so it cannot run inside the write
     * transaction below — the same ordering `regenerate-plan` uses.
     */
    const priorItemCount = await prisma.item.count({ where: { team: { eventId } } });
    if (priorItemCount > 0) {
      if (!actor.id) {
        // LedgerActor.id is nullable for SYSTEM actors; an authenticated HOST/COHOST
        // always resolves to a Person, so this is unreachable — it narrows the type.
        return NextResponse.json({ error: 'Could not resolve acting person' }, { status: 500 });
      }
      await createRevision(eventId, actor.id, 'Before re-running plan generation');
    }

    // GTC-237: one transaction over the whole write phase. Before this ticket the
    // delete and the creates were separate statements, so a failure part-way through
    // the create loop left the previous plan gone and the new one half-built.
    const taskCategories = await prisma.$transaction(async (tx) => {
      await applyPlanSections(tx, {
        eventId,
        sections: writtenSections,
        batchId,
      });

      // GTC-171 (B2): task rows. Moment 4 spec §6 — day-of choreography enters the plan
      // here, alongside the items, and is owned in Moment 3 through the same Assignment
      // machinery. Teams carry a Domain so J3's run sheet gets its phase grouping free.
      //
      // GTC-237: the task loop stays here rather than moving into applyPlanSections,
      // which is food-only — regenerate-plan calls that helper and must never reproduce
      // task rows. What IS shared is the disposable predicate, so a job Kate wrote or
      // edited survives a rerun exactly as an item she wrote or edited does.
      await tx.item.deleteMany({ where: disposableItemWhere({ eventId, kind: 'TASK' }) });

      const written: Array<{
        name: string;
        emoji: string;
        kind: 'TASK';
        items: Array<{ name: string; notes?: string; kind: 'TASK' }>;
      }> = [];

      for (const bucket of TASK_BUCKETS) {
        const bucketTasks = tasksByBucket.get(bucket.key) ?? [];
        if (bucketTasks.length === 0) continue;

        let team = await tx.team.findFirst({ where: { eventId, name: bucket.teamName } });
        if (!team) {
          const maxOrder = await tx.team.aggregate({
            where: { eventId },
            _max: { displayOrder: true },
          });
          team = await tx.team.create({
            data: {
              name: bucket.teamName,
              eventId,
              source: 'GENERATED',
              domain: bucket.domain,
              domainConfidence: 'HIGH',
              displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
            },
          });
        }

        const maxDisp = await tx.item.aggregate({
          where: { teamId: team.id },
          _max: { displayOrder: true },
        });
        let nextDisplayOrder = (maxDisp._max.displayOrder ?? 0) + 1;

        for (const task of bucketTasks) {
          await tx.item.create({
            data: {
              name: task.name,
              kind: 'TASK',
              teamId: team.id,
              // A job has no quantity — NA is the existing enum value for exactly this,
              // and it keeps task rows clear of the placeholder-quantity gates.
              quantityState: 'NA',
              notes: task.notes?.trim() || null,
              source: 'GENERATED',
              aiGenerated: true,
              userConfirmed: false,
              generatedBatchId: batchId,
              displayOrder: nextDisplayOrder,
            },
          });
          nextDisplayOrder++;
        }

        written.push({
          name: bucket.teamName,
          emoji: bucket.emoji,
          kind: 'TASK',
          items: bucketTasks.map((t) => ({ name: t.name, notes: t.notes, kind: 'TASK' as const })),
        });
      }

      // Both phases have run, so sweep once — a team emptied by the food phase and
      // refilled by the task phase must not be deleted and recreated in between.
      await sweepEmptyGeneratedTeams(tx, { eventId });

      return written;
    });

    await recordBulkPlanChange(prisma, {
      eventId,
      actor,
      action: 'GENERATE_PLAN',
      after: { categories: categories.length, tasks: taskCategories.length, batchId },
    });

    return NextResponse.json({
      plan: {
        // Task rows ride in the same `categories` array so the Step 2 approval preview
        // shows the host the jobs they are approving — one surface, not two.
        categories: [...categories, ...taskCategories],
        dietaryCoverage,
        thingsToConsider,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to finalize plan',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
