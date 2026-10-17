/**
 * GTC-192 — READ ONLY. Derives the replay through the same two modules the page uses and
 * prints it. Writes nothing: `readGlanceReplay` is the read half of the door, and the stamp
 * (`stampGlanceSeen`) is deliberately NOT called here, so running this does not consume the
 * news the browser is meant to show.
 *
 * Run: npx tsx scripts/check-gtc192-replay.ts [eventId]
 */

import { PrismaClient } from '@prisma/client';
import { readEventGlance } from '../src/lib/glance/read';
import { readGlanceReplay } from '../src/lib/glance/replay-entry';
import { scheduleReplay } from '../src/lib/glance/replay';

const prisma = new PrismaClient();
const EVENT_ID = process.argv[2] ?? 'gtc192-replay-arrival';
const HOST_EMAIL = 'nigel@mckorbett.co.nz';

async function main() {
  const now = new Date();
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: EVENT_ID },
    select: {
      name: true,
      createdAt: true,
      status: true,
      sentAt: true,
      endDate: true,
      decideByOffsetHours: true,
      nudgePace: true,
    },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: HOST_EMAIL } });
  const role = await prisma.eventRole.findFirstOrThrow({
    where: { userId: user.id, eventId: EVENT_ID },
    select: { role: true, glanceSeenAt: true },
  });

  const glance = await readEventGlance(prisma, EVENT_ID, now);
  const people = [...glance.households.flatMap((h) => h.members), ...glance.unhoused];
  const nameOf = new Map(people.map((p) => [p.personEventId, p.name]));

  const replay = await readGlanceReplay(
    prisma,
    EVENT_ID,
    role.glanceSeenAt,
    glance,
    {
      status: event.status,
      sentAt: event.sentAt,
      endDate: event.endDate,
      decideByOffsetHours: event.decideByOffsetHours,
      nudgePace: event.nudgePace,
    },
    now
  );

  console.log(`event        : ${event.name}`);
  console.log(`role         : ${role.role}  glanceSeenAt: ${role.glanceSeenAt?.toISOString()}`);
  console.log(
    `anchor is    : ${role.glanceSeenAt ? ((now.getTime() - role.glanceSeenAt.getTime()) / 3_600_000).toFixed(2) : 'null'}h ago`
  );
  console.log(`summary      : ${JSON.stringify(glance.summary)}`);
  console.log('\nBOARD NOW');
  for (const h of glance.households) {
    for (const p of h.members) console.log(`  ${p.state.padEnd(11)} ${p.name}`);
  }
  for (const p of glance.unhoused) console.log(`  ${p.state.padEnd(11)} ${p.name} (unhoused)`);

  const beats = scheduleReplay(replay.steps);
  console.log(`\nREPLAY — ${replay.steps.length} steps`);
  replay.steps.forEach((s, i) => {
    console.log(
      `  ${i + 1}. ${(nameOf.get(s.personEventId) ?? s.personEventId).padEnd(18)} ` +
        `${s.from.padEnd(11)} -> ${s.to.padEnd(11)} ${s.spark ? 'SPARK' : 'quiet'}  ` +
        `@${beats[i].delayMs}ms for ${beats[i].durationMs}ms`
    );
  });
  const last = beats.length ? Math.max(...beats.map((b) => b.delayMs + b.durationMs)) : 0;
  console.log(`  ends at ${last}ms`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
