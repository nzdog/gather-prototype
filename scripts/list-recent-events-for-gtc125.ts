/**
 * Read-only: list 10 most recent events with team/item counts for GTC-125 verification.
 * Usage: npx tsx scripts/list-recent-events-for-gtc125.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      lastCheckPlanAt: true,
      teams: {
        select: {
          id: true,
          name: true,
          _count: { select: { items: true } },
        },
      },
      _count: { select: { teams: true } },
    },
  });

  console.log('\n=== 10 most recent events ===\n');
  for (const e of events) {
    const itemCount = e.teams.reduce((sum, t) => sum + t._count.items, 0);
    const maxTeamItems = e.teams.reduce((m, t) => Math.max(m, t._count.items), 0);
    const hasReorderableTeam = e.teams.some((t) => t._count.items >= 2);
    console.log(`• ${e.name}`);
    console.log(`  id: ${e.id}`);
    console.log(`  status: ${e.status}   createdAt: ${e.createdAt.toISOString()}`);
    console.log(
      `  teams: ${e._count.teams}   items: ${itemCount}   maxItemsInOneTeam: ${maxTeamItems}`
    );
    console.log(`  hasTeamWith>=2Items: ${hasReorderableTeam}`);
    console.log(`  lastCheckPlanAt: ${e.lastCheckPlanAt?.toISOString() ?? 'null'}`);
    if (hasReorderableTeam) {
      const reorderable = e.teams.filter((t) => t._count.items >= 2);
      console.log(
        `  reorderableTeams: ${reorderable.map((t) => `${t.name}(${t._count.items})`).join(', ')}`
      );
    }
    console.log('');
  }
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().then(() => process.exit(1));
  });
