/**
 * [[GTC-411]] — ONE ACCOUNT PER ADDRESS, WHATEVER THE CAPITALS: the shared rule both doors use to
 * find or make a User from an email (src/lib/accounts/user-by-email.ts).
 *
 * THE RULINGS THIS SUITE PINS (the founder, 27 Oct 2026, option B-plus)
 *   1. One helper finds or makes a User by email in this order: (a) trim; (b) the EXACT spelling,
 *      if it has an account; (c) otherwise a case-blind look, every candidate checked again in
 *      code (trimmed and lower-cased, equal), the OLDEST taken (createdAt, then id); (d)
 *      otherwise a new User, stored trimmed and lower-case. Two sign-ins at once must not make two
 *      Users.
 *   3. New Users are stored lower-case. Old rows are not touched.
 *   4. In a pair of spellings that already exists, the exact spelling still opens its own
 *      account; a third spelling opens the oldest.
 *
 * THE CHECKS
 *   T1 a User stored with capitals; a lower-case sign-in finds it, no second User (and the
 *      sign-in route finds its User through the helper).
 *   T2 the reverse: a lower-case User, capitals typed.
 *   T3 no User yet: one is made, trimmed and lower-case, and found again by another spelling.
 *   T4 two spellings exist: the exact one wins over the oldest; a third spelling gets the oldest.
 *   T5 an address with an underscore (n_gel@) never opens nigel@ (nor % any address).
 *   T6 two calls at once for one new address end with ONE User: a second transaction seen
 *      waiting on the first one's new row, and five calls at once.
 *   P1 CONTROL: nothing here reached a provider (the provider trap counted no request).
 *   C1 CONTROL: every row this run made is gone again; the User count is as it was.
 *
 * It writes to gather_demo only (it refuses to start on any other database), with addresses
 * tagged for this run, and removes them by that tag in any letter case. No dev server.
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient, type User } from '@prisma/client';

import { installProviderTrap, trapCount } from './helpers/provider-trap';
import { findOrCreateUserByEmail } from '../src/lib/accounts/user-by-email';

installProviderTrap();

const ROOT = path.join(__dirname, '..');

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const reds: string[] = [];
function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
  } else {
    failed++;
    reds.push(`[${layer}] ${label}`);
    console.log(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── Where it may write ───────────────────────────────────────────────────────
const DB_URL = process.env.DATABASE_URL ?? '';
if (!/\/gather_demo(\?|$)/.test(DB_URL)) {
  console.error('email-case: refused — DATABASE_URL does not name gather_demo; nothing written');
  process.exit(2);
}
const prisma = new PrismaClient();

// ── This run's tag ───────────────────────────────────────────────────────────
const STAMP = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const TAG = `gtc411-${STAMP}`;
const addr = (local: string) => `${TAG}-${local}@example.com`;

/** Every User whose address carries this run's tag, in any letter case, trimmed or not. */
async function taggedUsers(): Promise<User[]> {
  const rows = await prisma.user.findMany({
    where: { email: { contains: TAG, mode: 'insensitive' } },
  });
  return rows.filter((u) => u.email.trim().toLowerCase().startsWith(TAG));
}
/** How many Users hold this address once capitals and outer spaces are ignored. */
async function usersFor(email: string): Promise<number> {
  const key = email.trim().toLowerCase();
  return (await taggedUsers()).filter((u) => u.email.trim().toLowerCase() === key).length;
}

/** Comments stripped, so a comment naming the old lookup is not read as the code. */
const code = (rel: string) =>
  fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Settles a promise into a value either way, so a race can be read after it ends. */
async function settle<T>(p: Promise<T>): Promise<{ ok: true; v: T } | { ok: false; e: unknown }> {
  try {
    return { ok: true, v: await p };
  } catch (e) {
    return { ok: false, e };
  }
}
const why = (e: unknown) => (e instanceof Error ? e.message.split('\n').slice(-1)[0] : String(e));

async function main() {
  const usersBefore = await prisma.user.count();

  // The sign-in route finds its User through the helper, inside its own transaction, and no
  // longer looks the address up letter for letter.
  const verify = code('src/app/api/auth/verify/route.ts');
  const verifyUsesHelper =
    /findOrCreateUserByEmail\(\s*tx\s*,\s*magicLink\.email\s*\)/.test(verify) &&
    !/\buser\s*\.\s*findUnique\s*\(\s*\{\s*where\s*:\s*\{\s*email\b/.test(verify) &&
    !/\buser\s*\.\s*create\s*\(/.test(verify);

  // ── T1 ──
  {
    const stored = await prisma.user.create({
      data: { email: addr('T1-Host').replace('example.com', 'Example.com') },
    });
    const got = await findOrCreateUserByEmail(prisma, addr('t1-host'));
    const n = await usersFor(addr('t1-host'));
    assert(
      'T',
      'T1 a User stored with capitals exists; a lower-case sign-in finds it, and no second User is made (the sign-in route asks the helper)',
      verifyUsesHelper && got.id === stored.id && n === 1,
      `helper in verify: ${verifyUsesHelper}; got ${got.email}; users for it: ${n}`
    );
  }

  // ── T2 ──
  {
    const stored = await prisma.user.create({ data: { email: addr('t2-host') } });
    const typed = addr('t2-host').toUpperCase();
    const got = await findOrCreateUserByEmail(prisma, typed);
    const n = await usersFor(typed);
    assert(
      'T',
      'T2 the reverse: a lower-case User exists; the address typed in capitals finds it, no second User (the sign-in route asks the helper)',
      verifyUsesHelper && got.id === stored.id && got.email === addr('t2-host') && n === 1,
      `helper in verify: ${verifyUsesHelper}; got ${got.email}; users for it: ${n}`
    );
  }

  // ── T3 ──
  {
    const want = addr('t3-new');
    const typed = `  ${addr('T3-New').replace('example.com', 'Example.COM')}  `;
    const before = await usersFor(want);
    const made = await findOrCreateUserByEmail(prisma, typed);
    const again = await findOrCreateUserByEmail(prisma, want.toUpperCase());
    const n = await usersFor(want);
    assert(
      'T',
      'T3 no User exists: one is made, stored trimmed and lower-case, and another spelling finds that same one',
      before === 0 && made.email === want && again.id === made.id && n === 1,
      `stored "${made.email}"; again ${again.id === made.id}; users for it: ${n}`
    );
  }

  // ── T4 ──
  {
    // The newer spelling is written first, so "oldest" has to come from createdAt, not from the
    // order rows were written or their ids.
    const newer = await prisma.user.create({ data: { email: addr('t4-pair') } });
    const older = await prisma.user.create({
      data: {
        email: addr('T4-Pair'),
        createdAt: new Date(newer.createdAt.getTime() - 24 * 60 * 60 * 1000),
      },
    });
    const exactNewer = await findOrCreateUserByEmail(prisma, addr('t4-pair'));
    const exactOlder = await findOrCreateUserByEmail(prisma, addr('T4-Pair'));
    const third = await findOrCreateUserByEmail(prisma, addr('T4-PAIR').toUpperCase());
    const n = await usersFor(addr('t4-pair'));
    assert(
      'T',
      'T4 two spellings exist: each exact spelling opens its own account (the newer too, over the oldest); a third spelling opens the oldest; no third User',
      exactNewer.id === newer.id && exactOlder.id === older.id && third.id === older.id && n === 2,
      `exact newer→${exactNewer.email}, exact older→${exactOlder.email}, third→${third.email}, users: ${n}`
    );
  }

  // ── T5 ──
  {
    const nigel = await prisma.user.create({ data: { email: addr('t5-nigel') } });
    const underscore = await findOrCreateUserByEmail(prisma, addr('t5-n_gel'));
    const underscoreCaps = await findOrCreateUserByEmail(prisma, addr('T5-N_GEL'));
    const percent = await findOrCreateUserByEmail(prisma, addr('t5-n%l'));
    assert(
      'T',
      'T5 an address with an underscore (n_gel@) never opens nigel@, typed in any capitals; nor does one with % — each gets its own account',
      underscore.id !== nigel.id &&
        underscore.email === addr('t5-n_gel') &&
        underscoreCaps.id === underscore.id &&
        percent.id !== nigel.id &&
        percent.email === addr('t5-n%l'),
      `n_gel→${underscore.email}, N_GEL→${underscoreCaps.email}, n%l→${percent.email}`
    );
  }

  // ── T6 ──
  {
    // A: a transaction makes the new account and holds it, not yet committed.
    const raceAddr = addr('t6-race');
    let releaseA: () => void = () => {};
    const gateA = new Promise<void>((r) => (releaseA = r));
    let madeByA: (u: User) => void = () => {};
    const aMade = new Promise<User>((r) => (madeByA = r));
    const txA = settle(
      prisma.$transaction(
        async (tx) => {
          const u = await findOrCreateUserByEmail(tx, raceAddr);
          madeByA(u);
          await gateA;
          return u;
        },
        { timeout: 30000, maxWait: 10000 }
      )
    );
    const aFirst = await Promise.race([aMade, txA.then(() => null), sleep(10000).then(() => null)]);

    // B: a second transaction, the same address in other capitals, while A still holds its row.
    const txB = settle(
      prisma.$transaction((tx) => findOrCreateUserByEmail(tx, addr('T6-Race').toUpperCase()), {
        timeout: 30000,
        maxWait: 10000,
      })
    );
    // B must reach the insert and wait there on A's row, or this is not the race at all.
    let sawWaiting = false;
    for (let i = 0; i < 50 && aFirst; i++) {
      const rows = await prisma.$queryRaw<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      if (rows[0].n > 0) {
        sawWaiting = true;
        break;
      }
      await sleep(100);
    }
    releaseA();
    const a = await txA;
    const b = await txB;

    // Five at once, outside any transaction, in five spellings.
    const crowd = await Promise.all(
      ['t6-crowd', 'T6-Crowd', 'T6-CROWD', 't6-CROWD', 'T6-crowd'].map((l) =>
        settle(findOrCreateUserByEmail(prisma, addr(l)))
      )
    );
    const crowdIds = new Set(crowd.map((c) => (c.ok ? c.v.id : 'failed')));

    const nRace = await usersFor(raceAddr);
    const nCrowd = await usersFor(addr('t6-crowd'));
    assert(
      'T',
      'T6 two calls at once for one new address end with ONE User: a second transaction, seen waiting on the first one’s new row, ends on that row; five calls at once all end on one',
      !!aFirst &&
        sawWaiting &&
        a.ok &&
        b.ok &&
        a.v.id === b.v.id &&
        nRace === 1 &&
        crowd.every((c) => c.ok) &&
        crowdIds.size === 1 &&
        nCrowd === 1,
      `A made ${!!aFirst}, B seen waiting ${sawWaiting}; A ${a.ok ? 'ok' : why(a.e)}; ` +
        `B ${b.ok ? 'ok' : why(b.e)}; race users ${nRace}; crowd ` +
        `${crowd.map((c) => (c.ok ? 'ok' : why(c.e))).join(',')} users ${nCrowd}`
    );
  }

  // ── P1, C1 ──
  assert('P', 'P1 CONTROL: the provider trap counted no outbound request', trapCount() === 0);

  const mine = await taggedUsers();
  await prisma.user.deleteMany({ where: { id: { in: mine.map((u) => u.id) } } });
  const left = (await taggedUsers()).length;
  const usersAfter = await prisma.user.count();
  assert(
    'C',
    `C1 CONTROL: the ${mine.length} Users this run made are gone again (by its tag, in any letter case); the User count is as it was`,
    mine.length > 0 && left === 0 && usersAfter === usersBefore,
    `left ${left}; users ${usersBefore} → ${usersAfter}`
  );
}

main()
  .catch((err) => {
    failed++;
    reds.push('suite crashed');
    console.error('\x1b[31mSuite crashed:\x1b[0m', err);
  })
  .finally(async () => {
    // Belt and braces: whatever happened above, this run's rows go.
    try {
      const mine = await taggedUsers();
      if (mine.length)
        await prisma.user.deleteMany({ where: { id: { in: mine.map((u) => u.id) } } });
    } catch (e) {
      failed++;
      console.error('\x1b[31mTEARDOWN FAILED — tagged rows may remain:\x1b[0m', TAG, e);
    }
    await prisma.$disconnect();
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.log('RED:');
      for (const r of reds) console.log(`  ${r}`);
    }
    process.exit(failed > 0 ? 1 : 0);
  });
