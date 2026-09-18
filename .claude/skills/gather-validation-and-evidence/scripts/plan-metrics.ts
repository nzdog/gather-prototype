/**
 * plan-metrics.ts — READ-ONLY plan quality measurement for one event.
 *
 * Prints the numbers used for plan-quality decisions (the GTC-145 style
 * measurement: 86 items -> 25 items): team count, items per team, critical
 * count, assigned vs unassigned (measured via the Assignment relation, NOT
 * the Item.status cache), item source breakdown, and dietary-tagged counts.
 *
 * Usage:
 *   npx tsx .claude/skills/gather-validation-and-evidence/scripts/plan-metrics.ts <eventId>
 *
 * Find an event id first with: npx tsx scripts/list-events.ts
 *
 * This script performs ZERO writes. Safe against any database.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const eventId = process.argv[2];
  if (!eventId) {
    console.error('Usage: npx tsx plan-metrics.ts <eventId>');
    console.error('List events with: npx tsx scripts/list-events.ts');
    process.exit(1);
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      teams: {
        orderBy: { displayOrder: 'asc' },
        include: {
          items: { include: { assignment: true } },
        },
      },
      _count: { select: { people: true } },
    },
  });

  if (!event) {
    console.error(`Event not found: ${eventId}`);
    process.exit(1);
  }

  const allItems = event.teams.flatMap((t) => t.items);
  const assigned = allItems.filter((i) => i.assignment !== null);
  const critical = allItems.filter((i) => i.critical);
  const criticalUnassigned = critical.filter((i) => i.assignment === null);
  const dietaryTagged = allItems.filter(
    (i) =>
      i.vegetarian ||
      i.glutenFree ||
      i.dairyFree ||
      (i.dietaryTags !== null && JSON.stringify(i.dietaryTags) !== '[]')
  );
  const statusCacheDrift = allItems.filter(
    (i) =>
      (i.status === 'ASSIGNED' && i.assignment === null) ||
      (i.status === 'UNASSIGNED' && i.assignment !== null)
  );
  const bySource: Record<string, number> = {};
  for (const i of allItems) bySource[i.source] = (bySource[i.source] ?? 0) + 1;

  console.log(`Event: ${event.name} (${event.id})  status=${event.status}`);
  console.log(`People (PersonEvent rows): ${event._count.people}`);
  console.log(`Teams: ${event.teams.length}`);
  console.log(`Total items: ${allItems.length}`);
  console.log('');
  console.log('Items per team:');
  for (const t of event.teams) {
    const tCrit = t.items.filter((i) => i.critical).length;
    const tAssigned = t.items.filter((i) => i.assignment !== null).length;
    console.log(`  ${t.name}: ${t.items.length} items (${tCrit} critical, ${tAssigned} assigned)`);
  }
  console.log('');
  console.log(`Critical items: ${critical.length} (${criticalUnassigned.length} unassigned)`);
  console.log(
    `Assigned (via Assignment relation): ${assigned.length} / ${allItems.length} (unassigned: ${allItems.length - assigned.length})`
  );
  console.log(
    `Dietary-tagged items (vegetarian/glutenFree/dairyFree/dietaryTags): ${dietaryTagged.length}`
  );
  console.log(`Item source breakdown: ${JSON.stringify(bySource)}`);
  if (statusCacheDrift.length > 0) {
    console.log(
      `WARNING: Item.status cache disagrees with Assignment relation on ${statusCacheDrift.length} item(s):`
    );
    for (const i of statusCacheDrift.slice(0, 10)) {
      console.log(
        `  - ${i.name} (${i.id}): status=${i.status}, assignment=${i.assignment ? 'present' : 'null'}`
      );
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
