import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

(async () => {
  const total = await prisma.item.count();
  const nullCount = await prisma.item.count({ where: { displayOrder: null } });
  const perTeam = await prisma.$queryRaw<
    Array<{ teamId: string; null_count: bigint; total: bigint }>
  >`
    SELECT "teamId",
           COUNT(*) FILTER (WHERE "displayOrder" IS NULL)::bigint AS null_count,
           COUNT(*)::bigint AS total
    FROM "Item"
    GROUP BY "teamId"
  `;
  const anyNulls = perTeam.some((t) => Number(t.null_count) > 0);

  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify(
      {
        total,
        nullCount,
        anyNulls,
        teams: perTeam.map((t) => ({
          teamId: t.teamId,
          nulls: Number(t.null_count),
          total: Number(t.total),
        })),
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
  process.exit(anyNulls ? 1 : 0);
})();
