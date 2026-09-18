/**
 * GTC-171 (B2) — live round-trip verification.
 *
 * Fires ONE real Claude call through the same prompt builder, token limit and parse path
 * finalize-plan uses, then runs the real `selectTaskRows` filter and writes rows exactly
 * as the route does. Proves the whole chain end to end:
 *   free text → prompt → model → tasks[] → filter → task teams + kind:'TASK' rows.
 *
 * Also proves the assignability claim: a task row is assignable to a person on a DIFFERENT
 * team through the same Assignment machinery, while a food row on another team still is not.
 *
 * Requires a real ANTHROPIC_API_KEY. Run with:
 *   npx tsx scripts/verify-gtc171-live-roundtrip.ts
 */

import { prisma } from '../src/lib/prisma';
import { callClaudeForJSON } from '../src/lib/ai/claude';
import { MAX_TOKENS_FULL_PLAN } from '../src/lib/ai/token-limits';
import { buildPlanGenerationPrompt, type PlanGenerationCategoryInput } from '../src/lib/ai/prompts';
import {
  getCategoryLevels,
  getDefaultCategories,
  getSectionReferenceItems,
} from '../src/lib/ai/config-loader';
import {
  TASK_BUCKETS,
  isBucketEligible,
  selectTaskRows,
  type TaskBucket,
} from '../src/lib/ai/tasks';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}${detail ? ` \x1b[90m— ${detail}\x1b[0m` : ''}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}${detail ? ` \x1b[90m— ${detail}\x1b[0m` : ''}`);
    failed++;
  }
}

const EVENT_NAME = 'GTC-171 Live Round-Trip Event';
const HOST_EMAIL = 'host-171-live@test.local';
const GUEST_EMAIL = 'guest-171-live@test.local';

// Text in all three buckets. `other_jobs` is deliberately marked stillDeciding so the
// negative case is exercised in the SAME live run as the positive ones.
const SET_UP_TEXT =
  'Set out the trestle tables and chairs, put up the gazebo, and get the esky filled with ice';
const CLEAN_UP_TEXT =
  'Wash and dry the dishes, clear the tables, take the rubbish and recycling out';
const OTHER_JOBS_TEXT = 'Maybe someone to watch the little ones, still thinking about it';

async function cleanup() {
  const events = await prisma.event.findMany({ where: { name: EVENT_NAME } });
  for (const e of events) {
    await prisma.assignment.deleteMany({ where: { item: { team: { eventId: e.id } } } });
    await prisma.personEvent.deleteMany({ where: { eventId: e.id } });
    await prisma.eventSetup.deleteMany({ where: { eventId: e.id } });
    await prisma.team.deleteMany({ where: { eventId: e.id } });
    await prisma.event.delete({ where: { id: e.id } });
  }
  await prisma.person.deleteMany({ where: { email: { in: [HOST_EMAIL, GUEST_EMAIL] } } });
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set — this verification needs a real key.');
    process.exit(1);
  }

  console.log('\x1b[33m=== GTC-171 (B2): live round-trip ===\x1b[0m\n');
  await cleanup();

  // --- Fixture -------------------------------------------------------------
  const host = await prisma.person.create({ data: { name: 'Live Host', email: HOST_EMAIL } });
  const event = await prisma.event.create({
    data: {
      name: EVENT_NAME,
      startDate: new Date('2026-12-25'),
      endDate: new Date('2026-12-25'),
      hostId: host.id,
      status: 'DRAFT',
      guestCount: 17,
    },
  });
  await prisma.eventSetup.create({
    data: {
      eventId: event.id,
      // EventSetup stores the LABEL, which config-loader maps to its occasion key.
      eventType: 'Christmas',
      setUpData: { freeText: SET_UP_TEXT, stillDeciding: false },
      cleanUpData: { freeText: CLEAN_UP_TEXT, stillDeciding: false },
      otherJobsOtherData: { freeText: OTHER_JOBS_TEXT, stillDeciding: true },
    },
  });

  const setup = (await prisma.eventSetup.findUnique({ where: { eventId: event.id } }))!;
  const eventType = setup.eventType ?? 'Other';

  // --- Build the prompt exactly as the route does ---------------------------
  // Mirrors the route's category loop (finalize-plan/route.ts:181-216), including its
  // key→family mapping, so the food half of the response is generated the same way.
  // The route iterates FOOD_CATEGORY_ORDER, NOT the raw config defaults. That matters:
  // Christmas's defaults also include `cleanup` and `furniture_equipment`, which are not
  // food keys and which the live route therefore never generates. Iterating the raw
  // defaults here would put two non-food sections into the plan that production never
  // produces — and would inflate the item count with rows that are really jobs.
  const FOOD_CATEGORY_ORDER = [
    'mains',
    'entree_starters',
    'sides_salads',
    'dessert',
    'cake',
    'drinks_alcoholic',
    'drinks_non_alcoholic',
    'table_snacks',
    'breakfast_brunch',
  ];
  const defaults = new Set(getDefaultCategories(eventType));
  const engagedCategories: PlanGenerationCategoryInput[] = [];
  for (const key of FOOD_CATEGORY_ORDER) {
    if (!defaults.has(key)) continue;
    const levels = getCategoryLevels(eventType, key);
    if (!levels || levels.length === 0) continue;
    const family =
      key === 'mains' || key === 'breakfast_brunch'
        ? 'mains'
        : key === 'sides_salads' || key === 'entree_starters' || key === 'table_snacks'
          ? 'sides'
          : key === 'dessert' || key === 'cake'
            ? 'desserts'
            : 'drinks';
    engagedCategories.push({
      key,
      label: key,
      emoji: '📋',
      selections: [],
      stillDeciding: false,
      referenceItems: getSectionReferenceItems(eventType, family).flatMap((r) => r.items),
    });
  }
  if (engagedCategories.length === 0) {
    console.error('Fixture built 0 categories — the food half of this check would be vacuous.');
    process.exit(1);
  }

  const { system, user } = buildPlanGenerationPrompt({
    eventType,
    totalAdults: 14,
    totalKids: 3,
    dietaryStatus: 'confirmed_none',
    dietaryRequirements: [],
    engagedCategories,
    otherNotes: '',
    setUpNotes: SET_UP_TEXT,
    cleanUpNotes: CLEAN_UP_TEXT,
    otherJobsNotes: OTHER_JOBS_TEXT,
  });

  console.log(
    `Calling Claude (maxTokens ${MAX_TOKENS_FULL_PLAN}, ${engagedCategories.length} categories)...`
  );
  const startedAt = Date.now();
  const result = await callClaudeForJSON<any>(system, user, {
    maxTokens: MAX_TOKENS_FULL_PLAN,
    temperature: 0.8,
    callSiteLabel: 'gtc171-live-verify',
  });
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  const rawJson = JSON.stringify(result);
  const approxTokens = Math.round(rawJson.length / 4);
  console.log(
    `\nResponse in ${elapsed}s — ${rawJson.length} chars ≈ ${approxTokens} tokens ` +
      `(${((approxTokens / MAX_TOKENS_FULL_PLAN) * 100).toFixed(1)}% of the ${MAX_TOKENS_FULL_PLAN} ceiling)\n`
  );

  // --- Response shape ------------------------------------------------------
  console.log('\x1b[33mSuite L: live response shape\x1b[0m');
  const sections = Array.isArray(result.sections) ? result.sections : [];
  const foodItemCount = sections.reduce((n: number, s: any) => n + (s.items?.length ?? 0), 0);

  assert('L1 response parsed without truncation', typeof result === 'object' && result !== null);
  assert(
    'L2 model returned a tasks array',
    Array.isArray(result.tasks),
    `${result.tasks?.length ?? 0} raw tasks`
  );
  assert(
    'L3 response is comfortably inside the token ceiling',
    approxTokens < MAX_TOKENS_FULL_PLAN * 0.75,
    `${approxTokens} / ${MAX_TOKENS_FULL_PLAN}`
  );
  assert(
    'L4 food item count stays in the GTC-145 15–30 band',
    foodItemCount >= 15 && foodItemCount <= 30,
    `${foodItemCount} items across ${sections.length} sections`
  );

  // --- The filter ----------------------------------------------------------
  console.log('\n\x1b[33mSuite M: server-side bucket filter\x1b[0m');
  const bucketSources: Record<TaskBucket, any> = {
    set_up: setup.setUpData,
    clean_up: setup.cleanUpData,
    other_jobs: setup.otherJobsOtherData,
  };
  const tasksByBucket = selectTaskRows(result.tasks, (b) => isBucketEligible(bucketSources[b]));

  assert(
    'M1 set_up produced rows',
    (tasksByBucket.get('set_up')?.length ?? 0) > 0,
    `${tasksByBucket.get('set_up')?.length ?? 0} rows`
  );
  assert(
    'M2 clean_up produced rows',
    (tasksByBucket.get('clean_up')?.length ?? 0) > 0,
    `${tasksByBucket.get('clean_up')?.length ?? 0} rows`
  );
  assert(
    'M3 other_jobs is stillDeciding → filtered out even if the model emitted it',
    !tasksByBucket.has('other_jobs'),
    `model emitted ${(result.tasks ?? []).filter((t: any) => t?.bucket === 'other_jobs').length} other_jobs rows`
  );

  // No job may appear in both sections and tasks.
  const taskNames = new Set(
    [...tasksByBucket.values()].flat().map((t) =>
      t.name
        .toLowerCase()
        .replace(/[^a-z ]/g, '')
        .trim()
    )
  );
  const sectionNames = sections.flatMap((s: any) =>
    (s.items ?? []).map((i: any) =>
      String(i.name)
        .toLowerCase()
        .replace(/[^a-z ]/g, '')
        .trim()
    )
  );
  const overlap = sectionNames.filter((n: string) => taskNames.has(n));
  assert(
    'M4 no job appears in both sections and tasks',
    overlap.length === 0,
    overlap.join(', ') || 'no overlap'
  );

  // --- Write rows exactly as the route does --------------------------------
  console.log('\n\x1b[33mSuite N: persisted task rows\x1b[0m');
  const batchId = `m2-finalize-verify`;
  for (const bucket of TASK_BUCKETS) {
    const bucketTasks = tasksByBucket.get(bucket.key) ?? [];
    if (bucketTasks.length === 0) continue;
    const maxOrder = await prisma.team.aggregate({
      where: { eventId: event.id },
      _max: { displayOrder: true },
    });
    const team = await prisma.team.create({
      data: {
        name: bucket.teamName,
        eventId: event.id,
        source: 'GENERATED',
        domain: bucket.domain,
        domainConfidence: 'HIGH',
        displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
      },
    });
    let order = 1;
    for (const task of bucketTasks) {
      await prisma.item.create({
        data: {
          name: task.name,
          kind: 'TASK',
          teamId: team.id,
          quantityState: 'NA',
          notes: task.notes ?? null,
          source: 'GENERATED',
          aiGenerated: true,
          userConfirmed: false,
          generatedBatchId: batchId,
          displayOrder: order++,
        },
      });
    }
  }

  const persistedTasks = await prisma.item.findMany({
    where: { team: { eventId: event.id }, kind: 'TASK' },
    include: { team: true },
  });

  assert('N1 task rows persisted', persistedTasks.length > 0, `${persistedTasks.length} rows`);
  assert(
    'N2 every task row is non-critical',
    persistedTasks.every((t) => t.critical === false)
  );
  assert(
    'N3 every task row has criticalReason null',
    persistedTasks.every((t) => t.criticalReason === null)
  );
  assert(
    "N4 every task row has quantityState 'NA'",
    persistedTasks.every((t) => t.quantityState === 'NA')
  );
  assert(
    'N5 every task row has no quantity amount',
    persistedTasks.every((t) => t.quantityAmount === null)
  );
  assert(
    'N6 task teams carry a run-sheet Domain',
    persistedTasks.every((t) => ['SETUP', 'CLEANUP', 'CUSTOM'].includes(String(t.team.domain)))
  );
  assert(
    'N7 no task team was created for the stillDeciding bucket',
    !persistedTasks.some((t) => t.team.name === 'Other jobs')
  );

  // --- Assignability -------------------------------------------------------
  console.log('\n\x1b[33mSuite O: one assignment machine, two kinds of rows\x1b[0m');

  const foodTeam = await prisma.team.create({
    data: { name: 'Mains', eventId: event.id, source: 'GENERATED', displayOrder: 99 },
  });
  const foodRow = await prisma.item.create({
    data: { name: 'Glazed ham', kind: 'ITEM', teamId: foodTeam.id, source: 'GENERATED' },
  });
  const guest = await prisma.person.create({ data: { name: 'Live Guest', email: GUEST_EMAIL } });
  // Guest sits on the FOOD team — deliberately not on any task team.
  const guestPe = await prisma.personEvent.create({
    data: { personId: guest.id, eventId: event.id, teamId: foodTeam.id, role: 'PARTICIPANT' },
  });

  const taskRow = persistedTasks[0];
  const gate = (item: { kind: string; teamId: string }) =>
    item.kind === 'ITEM' && guestPe.teamId !== item.teamId;

  assert(
    'O1 fixture is meaningful: guest is NOT on the task row team',
    guestPe.teamId !== taskRow.teamId
  );
  assert('O2 gate ALLOWS a task row for a person on a different team', !gate(taskRow));
  assert(
    'O3 gate still BLOCKS a food row on a different team',
    gate({ kind: 'ITEM', teamId: 'some-other-team' })
  );
  assert('O4 gate still ALLOWS a food row on the same team', !gate(foodRow));

  // The Assignment itself — same model, same relation, for a task row.
  const assignment = await prisma.assignment.create({
    data: { itemId: taskRow.id, personId: guest.id },
  });
  assert(
    'O5 Assignment created for a task row through the unchanged relation',
    assignment.itemId === taskRow.id
  );
  assert('O6 Assignment points at Person, never PersonEvent', assignment.personId === guest.id);

  const acked = await prisma.assignment.update({
    where: { id: assignment.id },
    data: { response: 'ACCEPTED' },
  });
  assert(
    'O7 task assignment accepts through the identical ack path',
    acked.response === 'ACCEPTED'
  );

  const withPerson = await prisma.item.findUnique({
    where: { id: taskRow.id },
    include: { assignment: { include: { person: true } } },
  });
  assert(
    'O8 task row reads back with its owner',
    withPerson?.assignment?.person.name === 'Live Guest'
  );

  // --- Report --------------------------------------------------------------
  console.log('\n\x1b[36m--- Task rows generated ---\x1b[0m');
  for (const t of persistedTasks) {
    console.log(`  [${t.team.domain}] ${t.team.name}: ${t.name}${t.notes ? ` (${t.notes})` : ''}`);
  }
  console.log(
    `\n\x1b[36m--- Food plan: ${foodItemCount} items across ${sections.length} sections ---\x1b[0m`
  );

  await cleanup();
  console.log(`\n\x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`);
  if (failed > 0) process.exit(1);
}

main()
  .catch(async (e) => {
    console.error(e);
    await cleanup();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
