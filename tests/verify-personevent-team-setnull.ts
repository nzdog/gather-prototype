// GTC-147 verification script — run BEFORE (RED) and AFTER (GREEN) the
// onDelete change. Destructive: deletes one team from the seeded demo event.
// Run only against a re-seedable dev DB.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find a team that has PersonEvents placed on it
  const team = await prisma.team.findFirst({
    where: { members: { some: {} } },
    include: { _count: { select: { members: true } } },
  });
  if (!team) throw new Error('no seeded team with members found');

  const eventId = team.eventId;
  console.log(
    `Team under test: "${team.name}" (${team.id}), event ${eventId}, members on team: ${team._count.members}`
  );

  const before = await prisma.personEvent.findMany({ where: { eventId } });
  const onTeamBefore = before.filter((pe) => pe.teamId === team.id);
  console.log('PersonEvents in event BEFORE team delete:', before.length);
  console.log('PersonEvents placed on this team BEFORE:', onTeamBefore.length);

  const nudgeLogsBefore = await prisma.nudgeLog.count({
    where: { personEventId: { in: onTeamBefore.map((pe) => pe.id) } },
  });
  console.log('NudgeLog rows for those PersonEvents BEFORE:', nudgeLogsBefore);

  await prisma.team.delete({ where: { id: team.id } });
  console.log('--- team deleted ---');

  const after = await prisma.personEvent.findMany({ where: { eventId } });
  console.log('PersonEvents in event AFTER team delete:', after.length);

  const sameRowsAfter = after.filter((pe) => onTeamBefore.some((b) => b.id === pe.id));
  console.log(
    'Previously-placed PersonEvent rows preserved:',
    `${sameRowsAfter.length}/${onTeamBefore.length}`
  );
  console.log(
    'Their teamId is now null:',
    sameRowsAfter.length > 0 && sameRowsAfter.every((pe) => pe.teamId === null)
  );

  const nudgeLogsAfter = await prisma.nudgeLog.count({
    where: { personEventId: { in: onTeamBefore.map((pe) => pe.id) } },
  });
  console.log('NudgeLog rows for those PersonEvents AFTER:', nudgeLogsAfter);

  const pass =
    after.length === before.length &&
    sameRowsAfter.length === onTeamBefore.length &&
    sameRowsAfter.every((pe) => pe.teamId === null);
  console.log(
    pass
      ? 'RESULT: PASS — rows preserved, teamId nulled'
      : 'RESULT: FAIL — rows lost or teamId not nulled'
  );
}

main().finally(() => prisma.$disconnect());
