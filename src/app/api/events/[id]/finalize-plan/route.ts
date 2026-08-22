import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordBulkPlanChange } from '@/lib/ledger';
import { callClaudeForJSON } from '@/lib/ai/claude';
import { MAX_TOKENS_FULL_PLAN } from '@/lib/ai/token-limits';
import { buildPlanGenerationPrompt } from '@/lib/ai/prompts';
// GTC-236: input assembly extracted move-only to plan-input.ts so regenerate-plan
// builds through the same code path — one definition, no drift.
import {
  buildPlanGenerationInput,
  CATEGORY_EMOJIS,
  CATEGORY_LABELS,
  type FullPlanResponse,
} from '@/lib/ai/plan-input';
import { TASK_BUCKETS, selectTaskRows } from '@/lib/ai/tasks';

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

    // Increment AI call counter once for the single call.
    await prisma.event.update({
      where: { id: eventId },
      data: { aiCallsUsed: { increment: 1 } },
    });

    const sections = Array.isArray(result.sections) ? result.sections : [];
    const dietaryCoverage = Array.isArray(result.dietaryCoverage) ? result.dietaryCoverage : [];
    const thingsToConsider = Array.isArray(result.thingsToConsider) ? result.thingsToConsider : [];

    // GTC-171 (B2): a task survives only if its bucket has settled free text behind it.
    const tasksByBucket = selectTaskRows(result.tasks, bucketIsEligible);

    // Map model response → response shape consumed by Moment2Step2Skeleton.
    // Use the model-supplied label/emoji when present; fall back to canonical
    // mapping by key so a typo'd label doesn't break the UI.
    const categories = sections
      .filter((s) => s && Array.isArray(s.items) && s.items.length > 0)
      .map((s) => {
        const key = s.key ?? '';
        const emoji = s.emoji || CATEGORY_EMOJIS[key] || '📋';
        const name = s.category || CATEGORY_LABELS[key] || key || 'Items';
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

    // GTC-145: drop any pre-existing AI-generated teams from prior runs so the
    // single-call output replaces them rather than stacking. We only delete
    // teams whose source is GENERATED to preserve any teams Kate added by hand.
    await prisma.team.deleteMany({
      where: { eventId, source: 'GENERATED' },
    });

    const batchId = `m2-finalize-${Date.now()}`;

    for (const category of categories) {
      const maxOrder = await prisma.team.aggregate({
        where: { eventId },
        _max: { displayOrder: true },
      });
      const team = await prisma.team.create({
        data: {
          name: category.name,
          eventId,
          source: 'GENERATED',
          displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
        },
      });

      let nextDisplayOrder = 1;
      for (const item of category.items) {
        await prisma.item.create({
          data: {
            name: item.name,
            teamId: team.id,
            quantityAmount: item.quantity,
            quantityUnit: 'CUSTOM',
            quantityUnitCustom: item.unit,
            quantityText: item.servingSize,
            notes: item.notes ?? null,
            critical: item.critical,
            criticalReason: item.criticalReason,
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
      }
    }

    // GTC-171 (B2): task rows. Moment 4 spec §6 — day-of choreography enters the plan
    // here, alongside the items, and is owned in Moment 3 through the same Assignment
    // machinery. Teams are GENERATED so the delete-and-recreate idempotency above covers
    // them, and carry a Domain so J3's run sheet gets its phase grouping for free.
    const taskCategories: Array<{
      name: string;
      emoji: string;
      kind: 'TASK';
      items: Array<{ name: string; notes?: string; kind: 'TASK' }>;
    }> = [];

    for (const bucket of TASK_BUCKETS) {
      const bucketTasks = tasksByBucket.get(bucket.key) ?? [];
      if (bucketTasks.length === 0) continue;

      const maxOrder = await prisma.team.aggregate({
        where: { eventId },
        _max: { displayOrder: true },
      });
      const team = await prisma.team.create({
        data: {
          name: bucket.teamName,
          eventId,
          source: 'GENERATED',
          domain: bucket.domain,
          domainConfidence: 'HIGH',
          displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
        },
      });

      let nextDisplayOrder = 1;
      for (const task of bucketTasks) {
        await prisma.item.create({
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

      taskCategories.push({
        name: bucket.teamName,
        emoji: bucket.emoji,
        kind: 'TASK',
        items: bucketTasks.map((t) => ({ name: t.name, notes: t.notes, kind: 'TASK' as const })),
      });
    }

    await recordBulkPlanChange(prisma, {
      eventId,
      actor: await ledgerActorForUser(auth.user, auth.role),
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
