/**
 * GTC-235 — the Moment flow reopens where the plan actually is.
 *
 * THE BUG. `/plan/[eventId]/setup` kept its position in session state only: `showSetup`
 * initialised `true` unconditionally, `showMoment2PlanView` initialised `false`, and the
 * only two callers that ever opened the plan view were callbacks of the Step 2 skeleton.
 * Reload, and a host with a finished plan was back at "Ready to start herding" with no
 * route forward but to generate again — an AI call, and before GTC-237 her edits with it.
 *
 * THREE LAYERS:
 *  1. Pure — the rule's whole truth table, including the V1 case that must not change.
 *  2. DB — the rule run over rows actually read from the database, which is the half a
 *     pure test cannot prove: that the inputs exist, are populated when the flow says
 *     they are, and are shaped the way the rule expects.
 *  3. Structural — the page no longer hard-codes the opening screen, and Ruling 2's
 *     condition is met: the plan view carries a route back to Moment 1.
 *
 * Run with: npm run test:setup-entry-stage
 * Destructive to its own created rows only; cleans up in finally.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { prisma } from '../src/lib/prisma';
import { hasGeneratedPlan, resolveSetupStage } from '../src/lib/setup/entry-stage';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}`);
    failed++;
  }
}

const EVENT_PREFIX = 'GTC-235 Entry Stage';
const HOST_EMAIL = 'host-235-entry@test.local';

async function cleanup() {
  const events = await prisma.event.findMany({
    where: { name: { startsWith: EVENT_PREFIX } },
  });
  for (const e of events) {
    await prisma.team.deleteMany({ where: { eventId: e.id } });
    await prisma.household.deleteMany({ where: { eventId: e.id } });
    await prisma.eventSetup.deleteMany({ where: { eventId: e.id } });
    await prisma.personEvent.deleteMany({ where: { eventId: e.id } });
    await prisma.event.delete({ where: { id: e.id } });
  }
  await prisma.person.deleteMany({ where: { email: HOST_EMAIL } });
}

async function makeEvent(suffix: string, hostId: string) {
  return prisma.event.create({
    data: {
      name: `${EVENT_PREFIX} — ${suffix}`,
      startDate: new Date('2026-12-25'),
      endDate: new Date('2026-12-25'),
      hostId,
      status: 'DRAFT',
    },
  });
}

/** Exactly what the page reads on mount, read the same way. */
async function stageFromDb(eventId: string) {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { setup: { select: { id: true } } },
  });
  const items = await prisma.item.findMany({
    where: { team: { eventId } },
    select: { source: true },
  });
  const householdCount = event.setup ? 0 : await prisma.household.count({ where: { eventId } });
  return resolveSetupStage({ items, hasSetup: Boolean(event.setup), householdCount });
}

async function runTests() {
  console.log('\x1b[33m=== GTC-235: the flow reopens where the plan is ===\x1b[0m\n');

  // -------------------------------------------------------------------------
  console.log('\x1b[33mLayer 1: the rule, whole\x1b[0m');
  {
    const none = { items: [], hasSetup: false, householdCount: 0 };
    assert("nothing done yet → 'opening'", resolveSetupStage(none) === 'opening');
    assert(
      "households but no EventSetup → 'moment1'",
      resolveSetupStage({ ...none, householdCount: 3 }) === 'moment1'
    );
    assert(
      "EventSetup but no plan → 'moment2-step1'",
      resolveSetupStage({ ...none, hasSetup: true }) === 'moment2-step1'
    );
    assert(
      "EventSetup and generated items → 'plan'",
      resolveSetupStage({ items: [{ source: 'GENERATED' }], hasSetup: true, householdCount: 0 }) ===
        'plan'
    );
    assert(
      "a plan she has rewritten end to end still reads as a plan → 'plan'",
      resolveSetupStage({
        items: [{ source: 'HOST_EDITED' }, { source: 'HOST_EDITED' }],
        hasSetup: true,
        householdCount: 0,
      }) === 'plan'
    );
    assert(
      "hand-added rows alone are not a generated plan → 'moment2-step1'",
      resolveSetupStage({
        items: [{ source: 'MANUAL' }],
        hasSetup: true,
        householdCount: 0,
      }) === 'moment2-step1'
    );

    // FOUNDER RULING 4, 2026-09-12: the fix changes nothing for V1. A V1 event has
    // teams and items and no EventSetup, and opening it at the V2 URL must behave
    // exactly as it did before this function existed.
    assert(
      "a V1 event — items, teams, no EventSetup → 'opening', unchanged",
      resolveSetupStage({
        items: [{ source: 'GENERATED' }, { source: 'HOST_EDITED' }],
        hasSetup: false,
        householdCount: 0,
      }) === 'opening'
    );

    assert('hasGeneratedPlan ignores TEMPLATE rows', !hasGeneratedPlan([{ source: 'TEMPLATE' }]));
    assert('hasGeneratedPlan tolerates a missing source', !hasGeneratedPlan([{}]));
  }

  // -------------------------------------------------------------------------
  console.log('\n\x1b[33mLayer 2: the same rule over rows read from the database\x1b[0m');
  {
    await cleanup();
    const host = await prisma.person.create({
      data: { name: 'Entry Stage Host', email: HOST_EMAIL },
    });

    const fresh = await makeEvent('fresh', host.id);
    assert("a freshly paid event → 'opening'", (await stageFromDb(fresh.id)) === 'opening');

    const midM1 = await makeEvent('mid moment 1', host.id);
    await prisma.household.create({ data: { eventId: midM1.id } });
    assert(
      "Moment 1 under way, no EventSetup row yet → 'moment1'",
      (await stageFromDb(midM1.id)) === 'moment1'
    );

    const midM2 = await makeEvent('mid moment 2', host.id);
    await prisma.eventSetup.create({ data: { eventId: midM2.id, eventType: 'bbq' } });
    assert(
      "Step 1 brief saved, nothing generated → 'moment2-step1'",
      (await stageFromDb(midM2.id)) === 'moment2-step1'
    );

    const generated = await makeEvent('generated', host.id);
    await prisma.eventSetup.create({ data: { eventId: generated.id, eventType: 'bbq' } });
    const team = await prisma.team.create({
      data: { name: 'Mains', eventId: generated.id, source: 'GENERATED' },
    });
    await prisma.item.create({
      data: { name: 'Glazed ham', teamId: team.id, source: 'GENERATED' },
    });
    assert("a generated plan → 'plan'", (await stageFromDb(generated.id)) === 'plan');

    // The V1 shape, built for real: teams and items, no EventSetup, no households.
    const v1 = await makeEvent('v1 shape', host.id);
    const v1Team = await prisma.team.create({
      data: { name: 'Mains', eventId: v1.id, source: 'GENERATED' },
    });
    await prisma.item.create({
      data: { name: 'V1 ham', teamId: v1Team.id, source: 'GENERATED' },
    });
    assert("a real V1-shaped event → 'opening'", (await stageFromDb(v1.id)) === 'opening');
  }

  // -------------------------------------------------------------------------
  console.log('\n\x1b[33mLayer 3: the page, structurally\x1b[0m');
  {
    const page = readFileSync(join(process.cwd(), 'src/app/plan/[eventId]/setup/page.tsx'), 'utf8');
    assert(
      'the opening screen is no longer hard-coded on',
      !/const \[showSetup, setShowSetup\] = useState\(true\)/.test(page)
    );
    assert('the mount path resolves a stage', page.includes('resolveSetupStage('));
    assert(
      'the plan view has a mount-path caller, not only Step 2 callbacks',
      page.includes('applyStage(stage)')
    );
    assert('Ruling 2: the plan view routes back to Moment 1', page.includes('onEditGuests='));
    assert('Ruling 3: the plan view has an exit', page.includes('onGoToDashboard='));

    const planView = readFileSync(
      join(process.cwd(), 'src/components/plan/Moment2PlanView.tsx'),
      'utf8'
    );
    assert(
      'the Moment 1 route is a required prop, not an optional one',
      /onEditGuests: \(\) => void;/.test(planView)
    );

    const list = readFileSync(join(process.cwd(), 'src/app/plan/events/page.tsx'), 'utf8');
    assert(
      'the events list is no longer a one-way door for V2 rows',
      /event\.setup && !event\.archived/.test(list)
    );
  }

  console.log(`\n\x1b[33m=== Summary ===\x1b[0m`);
  console.log(`Total: ${passed + failed}`);
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
}

runTests()
  .catch((e) => {
    console.error(e);
    failed++;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  });
