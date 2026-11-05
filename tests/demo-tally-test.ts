/**
 * [[GTC-454]] — the demo tally: one line of totals per clean-up run, counted just before each
 * sample is deleted.
 *
 *   P  preconditions: the local database gather_demo only (refused otherwise; the address is
 *      never printed), and no sample copy at the start
 *   A  the counting, pure: invented readings give a hand-worked line; a failed read is "unread"
 *   B  a real sweep of three local samples at different stages gives the hand-worked line, and
 *      every sample is deleted
 *   C  a read that fails never stops a delete: the sample still goes, counted as unread
 *   D  the line carries no id, no address and no name
 *   S  structure: the read is outside the delete transaction, and selects no forbidden column
 *
 * Writes go only to gather_demo on this machine, and every row it makes is deleted.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';

const ROOT = join(__dirname, '..');
const HOUR = 60 * 60 * 1000;
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function localDemoDb(): boolean {
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    return u.pathname === '/gather_demo' && ['localhost', '127.0.0.1'].includes(u.hostname);
  } catch {
    return false;
  }
}

async function run(): Promise<void> {
  const ok = localDemoDb();
  check('P1 DATABASE_URL names the local database gather_demo (address not printed)', ok);
  if (!ok) {
    console.log('\nRefused: this suite writes, so it runs on the local gather_demo only.');
    process.exitCode = 1;
    return;
  }

  const T = await import('../src/lib/demo/tally');
  const COPY = await import('../src/lib/demo/copy');
  const CLEAN = await import('../src/lib/demo/cleanup');
  const prisma = new PrismaClient();
  const made = { events: new Set<string>(), users: new Set<string>(), persons: new Set<string>() };

  try {
    const before = await prisma.event.count({ where: COPY.copyEventWhere() });
    check('P2 no sample copy at the start', before === 0, `${before}`);

    // ── A. the counting, pure ──
    const t = T.emptyTally();
    T.addReading(t, {
      addedGuests: false,
      reachedM2: false,
      reachedM3: false,
      reachedM4: false,
      guestView: false,
      saves: 0,
    });
    T.addReading(t, {
      addedGuests: true,
      reachedM2: true,
      reachedM3: true,
      reachedM4: false,
      guestView: false,
      saves: 4,
    });
    T.addReading(t, {
      addedGuests: true,
      reachedM2: true,
      reachedM3: true,
      reachedM4: true,
      guestView: true,
      saves: 10,
    });
    T.addReading(t, null);
    t.deletedByVisitor = 2;
    check(
      'A1 four samples, one unread: the hand-worked line',
      T.tallyLine(t) ===
        '[demo-tally] samples 4; added guests 2; reached M2 2, M3 2, M4 1; guest view 1; ' +
          'saves median 4; deleted by visitor 2; unread 1',
      T.tallyLine(t)
    );
    check(
      'A2 nothing deleted: a line of zeros, median none',
      T.tallyLine(T.emptyTally()) ===
        '[demo-tally] samples 0; added guests 0; reached M2 0, M3 0, M4 0; guest view 0; ' +
          'saves median none; deleted by visitor 0; unread 0'
    );

    // ── B. a real sweep ──
    const twoDaysAgo = new Date(Date.now() - 48 * HOUR);
    async function startCopy(): Promise<{ eventId: string; hostId: string }> {
      const c = await COPY.startDemoCopy(prisma, {
        now: new Date(),
        visitorTag: `gtc454-${randomBytes(4).toString('hex')}`,
      });
      made.events.add(c.eventId);
      made.users.add(c.userId);
      const ev = await prisma.event.update({
        where: { id: c.eventId },
        data: { createdAt: twoDaysAgo },
        select: { hostId: true },
      });
      made.persons.add(ev.hostId);
      return { eventId: c.eventId, hostId: ev.hostId };
    }
    async function addGuest(eventId: string): Promise<string> {
      const p = await prisma.person.create({
        data: { name: `Invented Guest ${randomBytes(3).toString('hex')}`, sampleEventId: eventId },
      });
      made.persons.add(p.id);
      await prisma.personEvent.create({ data: { eventId, personId: p.id } });
      return p.id;
    }
    async function addSaves(eventId: string, n: number): Promise<void> {
      for (let i = 0; i < n; i++)
        await prisma.auditEntry.create({
          data: {
            eventId,
            actorKind: 'HOST',
            actionType: 'EDIT_ITEM',
            targetType: 'Item',
            targetId: `x${i}`,
          },
        });
    }

    // a: opened, did nothing. b: a guest, a team, plan approved, 3 saves. c: all of b, held,
    // and a guest link opened, 3 saves. Hand-worked line: samples 3; added guests 2; reached
    // M2 2, M3 2, M4 1; guest view 1; saves median 3 (0, 3, 3); deleted by visitor 0; unread 0.
    const a = await startCopy();
    const b = await startCopy();
    const c = await startCopy();
    for (const x of [b, c]) {
      await addGuest(x.eventId);
      await prisma.team.create({ data: { eventId: x.eventId, name: 'Invented section' } });
      await prisma.eventSetup.update({
        where: { eventId: x.eventId },
        data: { planApprovedAt: new Date(Date.now() - 47 * HOUR) },
      });
      await addSaves(x.eventId, 3);
    }
    await prisma.event.update({
      where: { id: c.eventId },
      data: { transitionedToConfirmingAt: new Date(Date.now() - 46 * HOUR) },
    });
    const guestOnC = await prisma.personEvent.findFirst({
      where: { eventId: c.eventId, personId: { not: c.hostId } },
      select: { personId: true },
    });
    await prisma.accessToken.create({
      data: {
        token: `gtc454-${randomBytes(16).toString('hex')}`,
        scope: 'PARTICIPANT',
        eventId: c.eventId,
        personId: guestOnC!.personId,
        openedAt: new Date(Date.now() - 45 * HOUR),
      },
    });

    const logs: string[] = [];
    const realLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    let counts: { deleted: number };
    try {
      counts = await CLEAN.sweepExpiredCopies(prisma, new Date());
    } finally {
      console.log = realLog;
    }
    const line = logs.find((l) => l.startsWith('[demo-tally]')) ?? '';
    check('B1 the sweep deleted all three samples', counts.deleted === 3, `${counts.deleted}`);
    check(
      'B2 the tally line is the hand-worked one',
      line ===
        '[demo-tally] samples 3; added guests 2; reached M2 2, M3 2, M4 1; guest view 1; ' +
          'saves median 3; deleted by visitor 0; unread 0',
      line
    );
    const left = await prisma.event.count({
      where: { id: { in: [a.eventId, b.eventId, c.eventId] } },
    });
    check('B3 none of the three samples is left', left === 0, `${left}`);
    check(
      'B4 the existing clean-up line still prints first',
      logs.findIndex((l) => l.startsWith('[demo-cleanup] copies found')) < logs.indexOf(line)
    );

    // ── C. a failed read never stops a delete ──
    const d = await startCopy();
    const broken = new Proxy(prisma, {
      get(target, prop, receiver) {
        // Only the tally's read uses team.count; the delete's own transaction never does.
        if (prop === 'team') return { count: () => Promise.reject(new Error('made-up failure')) };
        const v = Reflect.get(target, prop, receiver);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    }) as PrismaClient;
    const logs2: string[] = [];
    console.log = (...args: unknown[]) => logs2.push(args.map(String).join(' '));
    let counts2: { deleted: number };
    try {
      counts2 = await CLEAN.sweepExpiredCopies(broken, new Date());
    } finally {
      console.log = realLog;
    }
    const line2 = logs2.find((l) => l.startsWith('[demo-tally]')) ?? '';
    check(
      'C1 with the read failing, the sample is still deleted',
      counts2.deleted === 1,
      `${counts2.deleted}`
    );
    check(
      'C2 and it is counted as unread',
      line2.includes('samples 1;') && line2.includes('unread 1'),
      line2
    );
    const leftD = await prisma.event.count({ where: { id: d.eventId } });
    check('C3 the sample is gone', leftD === 0);

    // ── D. the line carries nothing personal ──
    const all = [line, line2].join('\n');
    const ids = [a, b, c, d].flatMap((x) => [x.eventId, x.hostId]);
    check(
      'D1 no id in the tally lines',
      ids.every((id) => !all.includes(id))
    );
    check('D2 no address in the tally lines', !all.includes('@'));
    check('D3 no name in the tally lines', !/Invented|Sam\b/.test(all));
  } finally {
    // Remove anything left behind by a failed check.
    await prisma.event
      .deleteMany({ where: { id: { in: [...made.events] } } })
      .catch(() => undefined);
    await prisma.person
      .deleteMany({ where: { id: { in: [...made.persons] } } })
      .catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [...made.users] } } }).catch(() => undefined);
    await prisma.$disconnect();
  }

  // ── S. structure ──
  const clean = readFileSync(join(ROOT, 'src/lib/demo/cleanup.ts'), 'utf8');
  const tallySrc = readFileSync(join(ROOT, 'src/lib/demo/tally.ts'), 'utf8');
  const loop = clean.slice(
    clean.indexOf('const demo = emptyTally()'),
    clean.indexOf('sweepOneCopy(db, copy.id)')
  );
  check(
    'S1 the read happens before, and outside, the copy delete',
    loop.includes('readCopy(db, copy.id).catch(')
  );
  check(
    'S2 the tally selects no name, email, token, metadata or visitor tag',
    !/\b(name|email|token|metadata|visitorTag|phone)\s*:\s*true/.test(tallySrc)
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

void run();
