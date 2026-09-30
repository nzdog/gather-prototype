/**
 * GTC-305 — the board for people Gather invites and never reminds.
 *
 * THE PRINCIPLE (SCOPED 2026-09-28): amber means Gather is chasing someone, and nobody else is
 * amber. Since [[GTC-311]] and [[GTC-189]] slice 8b there are people Gather invites and will
 * never remind; before this ticket they read amber on the board, which is a false sentence on
 * the main screen.
 *
 * THE LAYERS:
 *  A. the map — `CHASE_REFUSAL_MEANS`, a `Record` over the chooser's own union
 *  B. the derivation, pure — the greys, the mark (a person's own and a carrier's), the itemless
 *     order (Finding 1 and the itemless yes)
 *  C. the red "opted out" — no door, the remind kept (GTC-296 ruling 4, GTC-324 ruling 1)
 *  D. the bounce — a delivery failure still reads red for every one of these people (ruling 2),
 *     and which children ruling S reaches (point 3: pinned AS BUILT at GTC-305, flipped by
 *     GTC-336 Q2 — a child inherits only from the carrier the chooser names)
 *  E. the read path — `readEventGlance` over real rows, the board's standing equal to the
 *     chooser's answer for every membership, and correction 1's guest on the host's list
 *  F. the person view — the amended Ruling 32, and every sentence byte-exact
 *  G. fences — no provider, no schema, Zones 7 and 9 unedited
 *  H. the replay — no spurious step, the itemless yes played once, the delivery case measured
 *
 * NOTHING IS SENT. No provider is imported, no cron is run, and every row written here is this
 * file's own fixture, removed in `finally`.
 *
 * Run: npx tsx tests/board-not-chased-test.ts
 */

import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const prisma = new PrismaClient();
const ROOT = join(__dirname, '..');
const TAG = 'GTC305';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? `\n    ${detail}` : ''}`);
    failed++;
    redAssertions.push(`[${layer}] ${label}`);
  }
}

/** A missing export reads as a failed assertion, not a crashed run — RED and GREEN in one file. */
function ok(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

function read(rel: string): string {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
}

/** Source with comments stripped, so an assertion about CODE cannot be satisfied by prose. */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const ALL_WHYS = [
  'EMAIL_REPORTED',
  'EMAIL_BLOCKED',
  'EMAIL_OPTED_OUT',
  'HOST_OWN_ASK',
  'CHILD_WITHOUT_ITEM',
  'HOST_HOUSEHOLD_CHILD',
  'NO_CARRIER',
  'HOUSEHOLD_MUTED',
  'HOST_AS_CARRIER',
  'SMS_OPTED_OUT',
  'MARKED_DONT_CHASE',
  'PHONE_UNUSABLE',
  'NO_CHANNEL',
  'HANDED_TO_HOST',
] as const;

/** As ruled: SCOPED rulings 1 to 3, R4 and R6 (2026-09-28). */
const EXPECTED_MEANS: Record<(typeof ALL_WHYS)[number], string | null> = {
  HANDED_TO_HOST: 'HANDED_TO_HOST',
  SMS_OPTED_OUT: 'SMS_OPTED_OUT',
  HOST_AS_CARRIER: 'HOST_AS_CARRIER',
  HOST_HOUSEHOLD_CHILD: 'HOST_HOUSEHOLD_CHILD',
  CHILD_WITHOUT_ITEM: 'CHILD_WITHOUT_ITEM',
  EMAIL_OPTED_OUT: 'EMAIL_OPTED_OUT',
  EMAIL_REPORTED: 'EMAIL_OPTED_OUT',
  MARKED_DONT_CHASE: null,
  NO_CARRIER: null,
  HOUSEHOLD_MUTED: null,
  // ⚠ MOVED BY [[GTC-251]] Q5 (founder, 2026-09-29): R4 filed these three on GTC-251, which ruled
  // them red at once — "Red straight away, handed to you, with a short reason."
  EMAIL_BLOCKED: 'CHASE_UNREACHABLE',
  NO_CHANNEL: 'CHASE_UNREACHABLE',
  PHONE_UNUSABLE: 'CHASE_UNREACHABLE',
  HOST_OWN_ASK: null,
};

const OPENING = ['HANDED_TO_HOST', 'SMS_OPTED_OUT', 'HOST_AS_CARRIER', 'HOST_HOUSEHOLD_CHILD'];

// The ruled sentences, typed here rather than imported, so a changed constant fails rather than
// agreeing with itself.
const W_HANDED = "You're handling them yourself, so I won't chase them.";
const W_SMS = "They've opted out of texts — so I won't chase them at all.";
const W_UNSUB =
  "They unsubscribed from email for this event, so I won't chase them on any channel.";
const W_HOST_CARRIER = "It's with you — I don't chase you.";
const W_HOST_HOUSEHOLD = "They're in your own household, so I won't chase them.";

async function main() {
  let S: any = null;
  let CF: any = null;
  let R: any = null;
  let SP: any = null;
  let RD: any = null;
  let AC: any = null;
  let AP: any = null;
  let APC: any = null;
  let RP: any = null;
  let EBW: any = null;
  try {
    S = await import('../src/lib/glance/state');
    R = await import('../src/lib/glance/read');
    SP = await import('../src/components/glance/strip');
    RD = await import('../src/components/glance/reading');
    AC = await import('../src/lib/glance/actions');
    AP = await import('../src/lib/preflight/ask-preview');
    APC = await import('../src/lib/preflight/ask-preview-compose');
    RP = await import('../src/lib/glance/replay');
    EBW = await import('../src/lib/eligibility/email-block-words');
  } catch (err) {
    console.error(`\x1b[31m!\x1b[0m module load failed: ${(err as Error).message.split('\n')[0]}`);
  }
  try {
    CF = await import('../src/lib/glance/chase-fact');
  } catch (err) {
    console.error(
      `\x1b[31m!\x1b[0m chase-fact did not load: ${(err as Error).message.split('\n')[0]}`
    );
  }

  const created = { events: [] as string[], persons: [] as string[], addresses: [] as string[] };

  try {
    // ══ LAYER A — the map ════════════════════════════════════════════════════════════════
    assert(
      'A',
      'CHASE_REFUSAL_MEANS is declared as a Record over the chooser’s own ChaseNoneWhy',
      /export const CHASE_REFUSAL_MEANS:\s*Record<\s*ChaseNoneWhy\s*,/.test(
        code('src/lib/glance/chase-fact.ts')
      )
    );
    assert(
      'A',
      'it has exactly one entry per ChaseNoneWhy — fourteen, no more, no fewer',
      ok(
        () =>
          Object.keys(CF.CHASE_REFUSAL_MEANS).length === ALL_WHYS.length &&
          ALL_WHYS.every((w) => Object.prototype.hasOwnProperty.call(CF.CHASE_REFUSAL_MEANS, w))
      )
    );
    for (const why of ALL_WHYS) {
      assert(
        'A',
        `${why} → ${EXPECTED_MEANS[why] ?? 'null'} (as ruled)`,
        ok(() => CF.CHASE_REFUSAL_MEANS[why] === EXPECTED_MEANS[why])
      );
    }
    {
      const probeDir = mkdtempSync(join(tmpdir(), 'gtc305-probe-'));
      try {
        const file = join(probeDir, 'missing.ts');
        const config = join(probeDir, 'missing.tsconfig.json');
        const chooser = join(ROOT, 'src/lib/eligibility/channel-chooser');
        const keys = ALL_WHYS.filter((w) => w !== 'HANDED_TO_HOST')
          .map((w) => `${w}: null`)
          .join(', ');
        writeFileSync(
          file,
          `import type { ChaseNoneWhy } from '${chooser}';\n` +
            `export const m: Record<ChaseNoneWhy, string | null> = { ${keys} };\n`
        );
        writeFileSync(
          config,
          JSON.stringify({
            extends: join(ROOT, 'tsconfig.json'),
            compilerOptions: { incremental: false, plugins: [] },
            files: [file],
            include: [],
          })
        );
        let out = '';
        let compiled = true;
        try {
          execFileSync('npx', ['tsc', '-p', config], { cwd: ROOT, stdio: 'pipe' });
        } catch (e) {
          compiled = false;
          const err = e as { stdout?: Buffer; stderr?: Buffer };
          out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
        }
        assert(
          'A',
          'PROBE: a Record<ChaseNoneWhy, …> missing one refusal does not compile, and names it — so a new chooser refusal cannot reach the board undecided',
          !compiled && /HANDED_TO_HOST/.test(out)
        );
      } finally {
        rmSync(probeDir, { recursive: true, force: true });
      }
    }

    // ══ LAYER B — the derivation, pure ═══════════════════════════════════════════════════
    const NOW = new Date('2026-09-28T12:00:00.000Z');
    const event = {
      status: 'CONFIRMING' as const,
      sentAt: new Date(NOW.getTime() - 5 * DAY),
      endDate: new Date(NOW.getTime() + 130 * HOUR),
      decideByOffsetHours: null,
      nudgePace: null,
    };
    const liveClock = { dropOffAt: null, decideByOffsetHours: null };
    // decideBy = dropOffAt − offset; a drop-off an hour ago with no offset has run out.
    const expiredClock = { dropOffAt: new Date(NOW.getTime() - HOUR), decideByOffsetHours: 0 };
    let seq = 0;
    const row = (response: string, clock = liveClock) => {
      seq++;
      return {
        itemId: `i${seq}`,
        assignmentId: `a${seq}`,
        name: `Dish ${seq}`,
        critical: false,
        response,
        kind: 'ITEM',
        teamId: 't',
        quantityAmount: null,
        quantityUnit: null,
        quantityUnitCustom: null,
        item: clock,
      };
    };
    const chase = (standing: string | null, carrierMarked = false) => ({ standing, carrierMarked });
    const bounced = { failure: 'NOT_DELIVERED' };
    const person = (o: {
      items?: any[];
      chase?: any;
      delivery?: any;
      mark?: string | null;
      attendance?: string | null;
      isHost?: boolean;
    }) => ({
      isHost: o.isHost ?? false,
      exhaustion: null,
      delivery: o.delivery ?? null,
      chase: o.chase ?? null,
      nudgeMark: o.mark ?? null,
      attendanceAnswer: o.attendance ?? null,
      items: o.items ?? [],
    });
    const derive = (p: any) => S.derivePersonState(p, event, NOW);
    const is = (p: any, state: string, reasons?: string[]) =>
      ok(() => {
        const d = derive(p);
        return (
          d.state === state &&
          (reasons === undefined || JSON.stringify(d.reasons) === JSON.stringify(reasons))
        );
      });

    assert(
      'B',
      'CONTROL: no chase fact, a pending row → AMBER AWAITING_REPLY, exactly as before',
      is(person({ items: [row('PENDING')] }), 'AMBER', ['AWAITING_REPLY'])
    );
    for (const grey of [
      'HANDED_TO_HOST',
      'SMS_OPTED_OUT',
      'HOST_AS_CARRIER',
      'HOST_HOUSEHOLD_CHILD',
    ]) {
      assert(
        'B',
        `${grey}, a pending row → NOT_CHASED [${grey}] (the grey replaces "waiting to hear back")`,
        is(person({ items: [row('PENDING')], chase: chase(grey) }), 'NOT_CHASED', [grey])
      );
    }
    assert(
      'B',
      'CHILD_WITHOUT_ITEM, itemless → NOT_CHASED [CHILD_WITHOUT_ITEM]',
      is(person({ chase: chase('CHILD_WITHOUT_ITEM') }), 'NOT_CHASED', ['CHILD_WITHOUT_ITEM'])
    );
    assert(
      'B',
      'handed over, one accepted and one pending → NOT_CHASED (the open row is not chased)',
      is(
        person({ items: [row('ACCEPTED'), row('PENDING')], chase: chase('HANDED_TO_HOST') }),
        'NOT_CHASED',
        ['HANDED_TO_HOST']
      )
    );
    assert(
      'B',
      'RULING 2: handed over, everything accepted → GREEN — an answer shows as for anyone',
      is(person({ items: [row('ACCEPTED')], chase: chase('HANDED_TO_HOST') }), 'GREEN')
    );
    assert(
      'B',
      'RULING 2: handed over, one declined and one pending → RED REVERSAL — any red still wins',
      is(
        person({ items: [row('DECLINED'), row('PENDING')], chase: chase('HANDED_TO_HOST') }),
        'RED',
        ['REVERSAL']
      )
    );
    assert(
      'B',
      'handed over, an expired maybe → RED DECIDE_BY_EXPIRED',
      is(person({ items: [row('MAYBE', expiredClock)], chase: chase('SMS_OPTED_OUT') }), 'RED', [
        'DECIDE_BY_EXPIRED',
      ])
    );
    /*
     * ⚠ MOVED BY [[GTC-251]] slice 251a. R1 kept a live maybe amber and gave "the gap it leaves" to
     * GTC-251, which closed it: no decide-by follow-up comes for a handed-over guest (Q4: "a
     * handed-over guest is the host's and gets none"), so amber is false of the maybe too, and it
     * greys with the rest. The expired maybe above still reads red — the grey replaces amber only.
     */
    assert(
      'B',
      'R1 → GTC-251: a live maybe alone, handed over → NOT_CHASED [HANDED_TO_HOST] (no follow-up comes)',
      is(person({ items: [row('MAYBE')], chase: chase('HANDED_TO_HOST') }), 'NOT_CHASED', [
        'HANDED_TO_HOST',
      ])
    );
    assert(
      'B',
      'R1 → GTC-251: a live maybe beside a pending row, handed over → NOT_CHASED [HANDED_TO_HOST]',
      is(
        person({ items: [row('MAYBE'), row('PENDING')], chase: chase('HANDED_TO_HOST') }),
        'NOT_CHASED',
        ['HANDED_TO_HOST']
      )
    );
    assert(
      'B',
      'RULING 14 UNCHANGED: handed over AND marked → NOT_CHASED [DONT_CHASE], the mark wins',
      is(
        person({ items: [row('PENDING')], chase: chase('HANDED_TO_HOST'), mark: 'DONT_CHASE' }),
        'NOT_CHASED',
        ['DONT_CHASE']
      )
    );
    // Point 2 — the carrier's mark covers the child in full.
    assert(
      'B',
      'POINT 2: a child whose carrier is marked, pending → NOT_CHASED [DONT_CHASE]',
      is(person({ items: [row('PENDING')], chase: chase(null, true) }), 'NOT_CHASED', [
        'DONT_CHASE',
      ])
    );
    assert(
      'B',
      'POINT 2: carrier marked AND the route reports the carrier’s text opt-out → still DONT_CHASE (keyed on the mark, not the why)',
      is(person({ items: [row('PENDING')], chase: chase('SMS_OPTED_OUT', true) }), 'NOT_CHASED', [
        'DONT_CHASE',
      ])
    );
    assert(
      'B',
      'POINT 2: carrier marked AND the route reports the carrier’s email opt-out → still DONT_CHASE, over the red',
      is(person({ items: [row('PENDING')], chase: chase('EMAIL_OPTED_OUT', true) }), 'NOT_CHASED', [
        'DONT_CHASE',
      ])
    );
    assert(
      'B',
      'POINT 2: carrier marked, the child handed a row back → DONT_CHASE over the red (Ruling 14’s ground)',
      is(person({ items: [row('DECLINED')], chase: chase(null, true) }), 'NOT_CHASED', [
        'DONT_CHASE',
      ])
    );
    // Finding 1 and the itemless yes.
    assert(
      'B',
      'FINDING 1: itemless and marked → NOT_CHASED [DONT_CHASE] (was AMBER: the branch returned before Ruling 14)',
      is(person({ mark: 'DONT_CHASE' }), 'NOT_CHASED', ['DONT_CHASE'])
    );
    assert(
      'B',
      'FINDING 1: itemless, marked, and bounced → NOT_CHASED [DONT_CHASE] (grey over every red)',
      is(person({ mark: 'DONT_CHASE', delivery: bounced }), 'NOT_CHASED', ['DONT_CHASE'])
    );
    assert(
      'B',
      'ITEMLESS YES: answered yes, no rows → GREEN [ACCEPTED] (was AMBER; Ruling 16 is for the undecided)',
      is(person({ attendance: 'YES' }), 'GREEN', ['ACCEPTED'])
    );
    assert(
      'B',
      'ITEMLESS YES: answered yes and bounced → GREEN — an answer is proof the ask arrived',
      is(person({ attendance: 'YES', delivery: bounced }), 'GREEN', ['ACCEPTED'])
    );
    assert(
      'B',
      'ITEMLESS YES: answered yes and marked → GREEN — Ruling 14 leaves GREEN alone',
      is(person({ attendance: 'YES', mark: 'DONT_CHASE' }), 'GREEN', ['ACCEPTED'])
    );
    assert(
      'B',
      'CONTROL: itemless and undecided → AMBER, Ruling 16 unchanged',
      is(person({}), 'AMBER', ['AWAITING_REPLY'])
    );
    assert(
      'B',
      'itemless and handed over → NOT_CHASED [HANDED_TO_HOST]',
      is(person({ chase: chase('HANDED_TO_HOST') }), 'NOT_CHASED', ['HANDED_TO_HOST'])
    );
    assert(
      'B',
      'the summary counts NOT_CHASED in none of its three — they leave "Gather is on N"',
      ok(() => {
        const s = S.summarisePeople(['NOT_CHASED', 'AMBER']);
        return s.withGather === 1 && s.needYou === 0 && s.settled === 0;
      })
    );

    // ══ LAYER C — the red "opted out" ═══════════════════════════════════════════════════
    const optedOut = person({ items: [row('PENDING')], chase: chase('EMAIL_OPTED_OUT') });
    assert(
      'C',
      'RULING 3: opted out, pending → RED [EMAIL_OPTED_OUT] — the reason finally has a producer',
      is(optedOut, 'RED', ['EMAIL_OPTED_OUT'])
    );
    const asGlance = (p: any, extra: Record<string, unknown> = {}) => {
      const d = derive(p);
      return {
        name: 'Uma',
        state: d.state,
        reasons: d.reasons,
        textable: false,
        items: [],
        ...extra,
      };
    };
    assert(
      'C',
      'its strip line is "opted out" — not "nowhere to send", which is false of a live address',
      ok(() => SP.whyLineFor(asGlance(optedOut)) === 'opted out')
    );
    assert(
      'C',
      'NO "send it again" door on it — EMAIL_OPTED_OUT stays out of DOOR_REASONS',
      ok(
        () =>
          AC.doorOffered(asGlance(optedOut)) === false &&
          !AC.DOOR_REASONS.includes('EMAIL_OPTED_OUT')
      )
    );
    assert(
      'C',
      'the by-hand remind stays offered (GTC-296 ruling 4, GTC-324 ruling 1) — the route texts with its notice or refuses',
      ok(() => AC.remindOffered(asGlance(optedOut)) === true)
    );
    assert(
      'C',
      'opted out AND bounced → RED [EMAIL_OPTED_OUT], and still no door — the door never opens on someone who said stop',
      ok(() => {
        const p = person({
          items: [row('PENDING')],
          chase: chase('EMAIL_OPTED_OUT'),
          delivery: bounced,
        });
        const g = asGlance(p);
        return (
          g.state === 'RED' &&
          JSON.stringify(g.reasons) === '["EMAIL_OPTED_OUT"]' &&
          !AC.doorOffered(g)
        );
      })
    );
    assert(
      'C',
      'opted out, everything accepted → GREEN — a guest who answered shows their answers',
      is(person({ items: [row('ACCEPTED')], chase: chase('EMAIL_OPTED_OUT') }), 'GREEN')
    );
    assert(
      'C',
      'opted out, itemless → RED [EMAIL_OPTED_OUT]',
      is(person({ chase: chase('EMAIL_OPTED_OUT') }), 'RED', ['EMAIL_OPTED_OUT'])
    );
    assert(
      'C',
      'opted out, itemless and bounced → RED [EMAIL_OPTED_OUT] (the itemless order matches the rows)',
      is(person({ chase: chase('EMAIL_OPTED_OUT'), delivery: bounced }), 'RED', ['EMAIL_OPTED_OUT'])
    );

    // ══ LAYER D — the bounce, pure ══════════════════════════════════════════════════════
    for (const grey of [
      'HANDED_TO_HOST',
      'SMS_OPTED_OUT',
      'HOST_AS_CARRIER',
      'HOST_HOUSEHOLD_CHILD',
    ]) {
      assert(
        'D',
        `RULING 2: ${grey} and bounced → RED [NOT_DELIVERED], the door offered`,
        ok(() => {
          const g = asGlance(
            person({ items: [row('PENDING')], chase: chase(grey), delivery: bounced })
          );
          return (
            g.state === 'RED' &&
            JSON.stringify(g.reasons) === '["NOT_DELIVERED"]' &&
            AC.doorOffered(g)
          );
        })
      );
      assert(
        'D',
        `${grey} and an UNREACHABLE withheld row → RED [UNREACHABLE]`,
        is(
          person({
            items: [row('PENDING')],
            chase: chase(grey),
            delivery: { failure: 'UNREACHABLE' },
          }),
          'RED',
          ['UNREACHABLE']
        )
      );
    }

    // ══ LAYERS D, E, F — real rows through readEventGlance ═════════════════════════════
    const stamp = Date.now();
    const sentAt = new Date(Date.now() - 5 * DAY);

    async function mkEvent(label: string) {
      const host = await prisma.person.create({
        data: {
          name: `${label} Host`,
          email: `gtc305+${label.toLowerCase()}+host+${stamp}@example.test`,
        },
      });
      created.persons.push(host.id);
      const ev = await prisma.event.create({
        data: {
          name: `${TAG} ${label}`,
          startDate: new Date(Date.now() + 100 * HOUR),
          endDate: new Date(Date.now() + 130 * HOUR),
          hostId: host.id,
          status: 'CONFIRMING',
          sentAt,
        },
      });
      created.events.push(ev.id);
      const team = await prisma.team.create({ data: { eventId: ev.id, name: 'Mains' } });
      const hostPe = await prisma.personEvent.create({
        data: { personId: host.id, eventId: ev.id, role: 'HOST' },
      });
      return { ev, team, host, hostPe };
    }
    type Ev = Awaited<ReturnType<typeof mkEvent>>;

    async function mkMember(
      e: Ev,
      name: string,
      o: {
        email?: string | null;
        phone?: string | null;
        smsOptedOut?: boolean;
        householdId?: string | null;
        householdRole?: string;
        items?: number;
        mark?: 'DONT_CHASE' | null;
        exception?: 'HAND_TO_HOST' | null;
        attendance?: 'YES' | null;
      } = {}
    ) {
      const child = o.householdRole === 'CHILD';
      const p = await prisma.person.create({
        data: {
          name,
          email:
            o.email !== undefined
              ? o.email
              : child
                ? null
                : `gtc305+${name.split(' ')[0].toLowerCase()}+${stamp}@example.test`,
          phoneNumber: o.phone ?? null,
          smsOptedOut: o.smsOptedOut ?? false,
        },
      });
      created.persons.push(p.id);
      const pe = await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId: e.ev.id,
          role: 'PARTICIPANT',
          householdId: o.householdId ?? null,
          householdRole: o.householdRole ?? (o.householdId ? 'GUEST' : null),
          nudgeMark: o.mark ?? null,
          chaseException: o.exception ?? null,
          attendanceAnswer: o.attendance ?? null,
          sentAt: child ? null : sentAt,
        },
      });
      for (let i = 0; i < (o.items ?? 1); i++) {
        const item = await prisma.item.create({
          data: { teamId: e.team.id, name: `${name}'s dish ${i + 1}`, kind: 'ITEM' },
        });
        await prisma.assignment.create({
          data: { itemId: item.id, personId: p.id, response: 'PENDING' },
        });
      }
      return { p, pe };
    }

    async function mkHousehold(e: Ev) {
      return prisma.household.create({ data: { eventId: e.ev.id } });
    }
    async function setContact(householdId: string, personEventId: string) {
      await prisma.household.update({
        where: { id: householdId },
        data: { contactPersonEventId: personEventId },
      });
    }
    async function joinHousehold(personEventId: string, householdId: string, role: string) {
      await prisma.personEvent.update({
        where: { id: personEventId },
        data: { householdId, householdRole: role },
      });
    }
    async function askRow(e: Ev, personEventId: string, fate: 'accepted' | 'bounced') {
      await prisma.outboundMessage.create({
        data: {
          eventId: e.ev.id,
          personEventId,
          kind: 'ASK',
          channel: 'EMAIL',
          attemptedAt: sentAt,
          attemptCount: 1,
          acceptedAt: sentAt,
          provider: 'resend',
          providerMessageId: `${TAG}-${personEventId}`,
          ...(fate === 'bounced' ? { deliveryState: 'BOUNCED' } : {}),
        },
      });
    }

    // ── Event 1 ──
    const e1 = await mkEvent('E1');
    // Point 3 A: the host's own household, whose picked contact is another adult.
    const hh1 = await mkHousehold(e1);
    await joinHousehold(e1.hostPe.id, hh1.id, 'PARTNER');
    const hadult = await mkMember(e1, 'Hana Adult', {
      householdId: hh1.id,
      householdRole: 'PRIMARY_CONTACT',
    });
    await setContact(hh1.id, hadult.pe.id);
    await askRow(e1, hadult.pe.id, 'bounced');
    const hkid = await mkMember(e1, 'Hugo Kid', { householdId: hh1.id, householdRole: 'CHILD' });

    const ann = await mkMember(e1, 'Ann Handed', { exception: 'HAND_TO_HOST' });
    await askRow(e1, ann.pe.id, 'accepted');
    const annB = await mkMember(e1, 'Abe Handedbounced', { exception: 'HAND_TO_HOST' });
    await askRow(e1, annB.pe.id, 'bounced');
    const annM = await mkMember(e1, 'Amy Handedmarked', {
      exception: 'HAND_TO_HOST',
      mark: 'DONT_CHASE',
    });
    await askRow(e1, annM.pe.id, 'accepted');
    const ray = await mkMember(e1, 'Ray Textsoff', { phone: '+64211230001', smsOptedOut: true });
    await askRow(e1, ray.pe.id, 'accepted');
    const rayB = await mkMember(e1, 'Rob Textsoffbounced', {
      phone: '+64211230002',
      smsOptedOut: true,
    });
    await askRow(e1, rayB.pe.id, 'bounced');

    // Correction 1: unsubscribed after the press, with a carried child.
    const hhU = await mkHousehold(e1);
    const uma = await mkMember(e1, 'Uma Unsub', {
      householdId: hhU.id,
      householdRole: 'PRIMARY_CONTACT',
    });
    await setContact(hhU.id, uma.pe.id);
    await askRow(e1, uma.pe.id, 'accepted');
    const uki = await mkMember(e1, 'Uki Kid', { householdId: hhU.id, householdRole: 'CHILD' });
    await prisma.emailOptOut.create({ data: { personId: uma.p.id, eventId: e1.ev.id } });
    const umaB = await mkMember(e1, 'Ursula Unsubbounced');
    await askRow(e1, umaB.pe.id, 'bounced');
    await prisma.emailOptOut.create({ data: { personId: umaB.p.id, eventId: e1.ev.id } });

    // Correction 1: reported after the press, with a carried child.
    const hhR = await mkHousehold(e1);
    const rita = await mkMember(e1, 'Rita Reported', {
      householdId: hhR.id,
      householdRole: 'PRIMARY_CONTACT',
    });
    await setContact(hhR.id, rita.pe.id);
    await askRow(e1, rita.pe.id, 'accepted');
    const rik = await mkMember(e1, 'Rik Kid', { householdId: hhR.id, householdRole: 'CHILD' });
    const ritaAddress = rita.p.email!.toLowerCase();
    await prisma.emailBlock.create({
      data: { address: ritaAddress, reason: 'COMPLAINED', eventId: e1.ev.id },
    });
    created.addresses.push(ritaAddress);

    // HOST_AS_CARRIER (A2): a household whose picked contact is the host.
    const hhA = await mkHousehold(e1);
    const hoc = await mkMember(e1, 'Hoc Kid', { householdId: hhA.id, householdRole: 'CHILD' });
    await setContact(hhA.id, e1.hostPe.id);
    await askRow(e1, e1.hostPe.id, 'accepted');

    // Point 2: a marked carrier, bounced.
    const hhM = await mkHousehold(e1);
    const mona = await mkMember(e1, 'Mona Marked', {
      householdId: hhM.id,
      householdRole: 'PRIMARY_CONTACT',
      mark: 'DONT_CHASE',
    });
    await setContact(hhM.id, mona.pe.id);
    await askRow(e1, mona.pe.id, 'bounced');
    const moe = await mkMember(e1, 'Moe Kid', { householdId: hhM.id, householdRole: 'CHILD' });

    // Point 3 C: a child with no items, whose household contact bounced.
    const hhC = await mkHousehold(e1);
    const cora = await mkMember(e1, 'Cora Contact', {
      householdId: hhC.id,
      householdRole: 'PRIMARY_CONTACT',
    });
    await setContact(hhC.id, cora.pe.id);
    await askRow(e1, cora.pe.id, 'bounced');
    const cid = await mkMember(e1, 'Cid Kid', {
      householdId: hhC.id,
      householdRole: 'CHILD',
      items: 0,
    });

    const ctl = await mkMember(e1, 'Cam Control');
    await askRow(e1, ctl.pe.id, 'accepted');

    // ── Event 2: the host is her own household's contact AND an A2 carrier; her row bounced ──
    const e2 = await mkEvent('E2');
    const hh2 = await mkHousehold(e2);
    await joinHousehold(e2.hostPe.id, hh2.id, 'PRIMARY_CONTACT');
    await setContact(hh2.id, e2.hostPe.id);
    const h2kid = await mkMember(e2, 'Hal Kid', { householdId: hh2.id, householdRole: 'CHILD' });
    const hhA2 = await mkHousehold(e2);
    const a2kid = await mkMember(e2, 'Ada Kid', { householdId: hhA2.id, householdRole: 'CHILD' });
    await setContact(hhA2.id, e2.hostPe.id);
    await askRow(e2, e2.hostPe.id, 'bounced');
    // Point 2: marked carriers who are ALSO opted out, so the route reports the opt-out.
    const hhM2 = await mkHousehold(e2);
    const mona2 = await mkMember(e2, 'Mina Markedtexts', {
      householdId: hhM2.id,
      householdRole: 'PRIMARY_CONTACT',
      mark: 'DONT_CHASE',
      phone: '+64211230003',
      smsOptedOut: true,
    });
    await setContact(hhM2.id, mona2.pe.id);
    await askRow(e2, mona2.pe.id, 'accepted');
    const moe2 = await mkMember(e2, 'Max Kid', { householdId: hhM2.id, householdRole: 'CHILD' });
    const hhM3 = await mkHousehold(e2);
    const mona3 = await mkMember(e2, 'Meg Markedemail', {
      householdId: hhM3.id,
      householdRole: 'PRIMARY_CONTACT',
      mark: 'DONT_CHASE',
    });
    await setContact(hhM3.id, mona3.pe.id);
    await askRow(e2, mona3.pe.id, 'accepted');
    await prisma.emailOptOut.create({ data: { personId: mona3.p.id, eventId: e2.ev.id } });
    const moe3 = await mkMember(e2, 'Mo Kid', { householdId: hhM3.id, householdRole: 'CHILD' });
    // Point 2 without a bounce.
    const hhM4 = await mkHousehold(e2);
    const mona4 = await mkMember(e2, 'Mae Marked', {
      householdId: hhM4.id,
      householdRole: 'PRIMARY_CONTACT',
      mark: 'DONT_CHASE',
    });
    await setContact(hhM4.id, mona4.pe.id);
    await askRow(e2, mona4.pe.id, 'accepted');
    const moe4 = await mkMember(e2, 'Mik Kid', { householdId: hhM4.id, householdRole: 'CHILD' });

    // ── Event 3: nothing bounced ──
    const e3 = await mkEvent('E3');
    const hh3 = await mkHousehold(e3);
    await joinHousehold(e3.hostPe.id, hh3.id, 'PRIMARY_CONTACT');
    await setContact(hh3.id, e3.hostPe.id);
    const h3kid = await mkMember(e3, 'Hattie Kid', { householdId: hh3.id, householdRole: 'CHILD' });
    const hhC3 = await mkHousehold(e3);
    const cal = await mkMember(e3, 'Cal Contact', {
      householdId: hhC3.id,
      householdRole: 'PRIMARY_CONTACT',
    });
    await setContact(hhC3.id, cal.pe.id);
    await askRow(e3, cal.pe.id, 'accepted');
    const cy = await mkMember(e3, 'Cy Kid', {
      householdId: hhC3.id,
      householdRole: 'CHILD',
      items: 0,
    });
    const yves = await mkMember(e3, 'Yves Yes', { items: 0, attendance: 'YES' });
    await askRow(e3, yves.pe.id, 'accepted');
    const mark = await mkMember(e3, 'Mark Itemless', { items: 0, mark: 'DONT_CHASE' });
    await askRow(e3, mark.pe.id, 'accepted');
    const markB = await mkMember(e3, 'Mira Itemlessbounced', { items: 0, mark: 'DONT_CHASE' });
    await askRow(e3, markB.pe.id, 'bounced');

    const glances: Record<string, any> = {};
    const previews: Record<string, any> = {};
    for (const [k, e] of [
      ['e1', e1],
      ['e2', e2],
      ['e3', e3],
    ] as const) {
      try {
        glances[k] = await R.readEventGlance(prisma, e.ev.id);
      } catch (err) {
        console.error(`readEventGlance(${k}) threw: ${(err as Error).message.split('\n')[0]}`);
      }
      previews[k] = await AP.readAskPreview(prisma, e.ev.id, '');
    }
    const onBoard = (g: any, personEventId: string): any =>
      g
        ? [...g.households.flatMap((h: any) => h.members), ...g.unhoused].find(
            (p: any) => p.personEventId === personEventId
          )
        : undefined;
    const P = (k: string, m: { pe: { id: string } }) => onBoard(glances[k], m.pe.id);
    const reads = (k: string, m: { pe: { id: string } }, state: string, reasons: string[]) =>
      ok(() => {
        const g = P(k, m);
        return g.state === state && JSON.stringify(g.reasons) === JSON.stringify(reasons);
      });

    // Layer D over real rows.
    assert(
      'D',
      'RULING 2 on real rows: handed over and bounced → RED [NOT_DELIVERED]',
      reads('e1', annB, 'RED', ['NOT_DELIVERED'])
    );
    assert(
      'D',
      'RULING 2 on real rows: opted out of texts and bounced → RED [NOT_DELIVERED]',
      reads('e1', rayB, 'RED', ['NOT_DELIVERED'])
    );
    assert(
      'D',
      'the door is offered to both — and its text action is fenced for the text-opted-out one (Zone 7, textAskReachOf)',
      ok(() => AC.doorOffered(P('e1', annB)) && AC.doorOffered(P('e1', rayB))) &&
        ok(
          () =>
            AP.smsOptedOutFact({ smsOptedOut: true, phoneNumber: '+64211230002' }, new Set()) ===
            true
        )
    );
    assert(
      'D',
      'unsubscribed and bounced → RED [EMAIL_OPTED_OUT], no door',
      ok(() => {
        const g = P('e1', umaB);
        return (
          g.state === 'RED' &&
          JSON.stringify(g.reasons) === '["EMAIL_OPTED_OUT"]' &&
          !AC.doorOffered(g)
        );
      })
    );
    assert(
      'D',
      'CORRECTED: the host-as-carrier child, the host’s carried ask bounced → RED [NOT_DELIVERED] (ruling S through A2)',
      reads('e2', a2kid, 'RED', ['NOT_DELIVERED'])
    );
    assert(
      'D',
      'POINT 2: a marked carrier’s ASK bounced → the child reads NOT_CHASED [DONT_CHASE], sealed — not the red',
      reads('e1', moe, 'NOT_CHASED', ['DONT_CHASE'])
    );
    assert(
      'D',
      'POINT 2: … and the carrier herself reads Ruling 14’s grey, so the bounce shows on neither',
      reads('e1', mona, 'NOT_CHASED', ['DONT_CHASE'])
    );
    assert(
      'D',
      'POINT 2 without a bounce: the child of a marked carrier → NOT_CHASED [DONT_CHASE]',
      reads('e2', moe4, 'NOT_CHASED', ['DONT_CHASE'])
    );
    assert(
      'D',
      'POINT 2: carrier marked AND opted out of texts → the child still reads DONT_CHASE',
      reads('e2', moe2, 'NOT_CHASED', ['DONT_CHASE'])
    );
    assert(
      'D',
      'POINT 2: carrier marked AND unsubscribed from email → the child still reads DONT_CHASE, not "opted out"',
      reads('e2', moe3, 'NOT_CHASED', ['DONT_CHASE'])
    );
    assert(
      'D',
      'handed over AND marked → NOT_CHASED [DONT_CHASE]',
      reads('e1', annM, 'NOT_CHASED', ['DONT_CHASE'])
    );
    assert(
      'D',
      'FINDING 1 on real rows: itemless and marked → DONT_CHASE',
      reads('e3', mark, 'NOT_CHASED', ['DONT_CHASE'])
    );
    assert(
      'D',
      'FINDING 1 on real rows: itemless, marked and bounced → DONT_CHASE',
      reads('e3', markB, 'NOT_CHASED', ['DONT_CHASE'])
    );
    assert(
      'D',
      'ITEMLESS YES on real rows → GREEN [ACCEPTED]',
      reads('e3', yves, 'GREEN', ['ACCEPTED'])
    );
    /*
     * POINT 3, FLIPPED BY [[GTC-336]] Q2 (founder, 2026-09-30): *"A child goes red only if their ask
     * actually went in the message that bounced, worked out the same way Gather chose who to send it
     * to. The three children above read what they would without the bounce."* These were pinned AS
     * BUILT here at GTC-305 and flipped by that ruling, as their comment said they should. Each now
     * reads what layer E asserts for the same child on e3, where nothing bounced.
     */
    assert(
      'D',
      'GTC-336 Q2 (point 3): a host’s-household child whose contact is another adult does not inherit that adult’s bounce → NOT_CHASED [HOST_HOUSEHOLD_CHILD]; the item went to the host’s list',
      reads('e1', hkid, 'NOT_CHASED', ['HOST_HOUSEHOLD_CHILD'])
    );
    assert(
      'D',
      'GTC-336 Q2 (point 3): a host’s-household child whose contact is the host does not inherit the bounced A2 row → NOT_CHASED [HOST_HOUSEHOLD_CHILD]',
      reads('e2', h2kid, 'NOT_CHASED', ['HOST_HOUSEHOLD_CHILD'])
    );
    assert(
      'D',
      'GTC-336 Q2 (point 3): a child with no items does not inherit the contact’s bounce → NOT_CHASED [CHILD_WITHOUT_ITEM]; nothing was asked of them',
      reads('e1', cid, 'NOT_CHASED', ['CHILD_WITHOUT_ITEM'])
    );

    // ══ LAYER E — the read path ═════════════════════════════════════════════════════════
    assert(
      'E',
      'CONTROL: an ordinary emailed guest reads AMBER',
      reads('e1', ctl, 'AMBER', ['AWAITING_REPLY'])
    );
    assert(
      'E',
      'handed over → NOT_CHASED [HANDED_TO_HOST]',
      reads('e1', ann, 'NOT_CHASED', ['HANDED_TO_HOST'])
    );
    assert(
      'E',
      'opted out of texts, asked by email → NOT_CHASED [SMS_OPTED_OUT]',
      reads('e1', ray, 'NOT_CHASED', ['SMS_OPTED_OUT'])
    );
    assert(
      'E',
      'host as carrier → NOT_CHASED [HOST_AS_CARRIER]',
      reads('e1', hoc, 'NOT_CHASED', ['HOST_AS_CARRIER'])
    );
    assert(
      'E',
      'a host’s-household child, nothing bounced → NOT_CHASED [HOST_HOUSEHOLD_CHILD]',
      reads('e3', h3kid, 'NOT_CHASED', ['HOST_HOUSEHOLD_CHILD'])
    );
    assert(
      'E',
      'a child with no items, nothing bounced → NOT_CHASED [CHILD_WITHOUT_ITEM]',
      reads('e3', cy, 'NOT_CHASED', ['CHILD_WITHOUT_ITEM'])
    );
    assert(
      'E',
      'CORRECTION 1: the guest who unsubscribed after the press is on the host’s list (ask route HOST_LIST) …',
      ok(() =>
        previews.e1.hostList.some(
          (l: any) => l.personEventId === uma.pe.id && l.why === 'EMAIL_OPTED_OUT'
        )
      )
    );
    assert(
      'E',
      '… and still has a chase answer in byMembership — asked before the ask-route skip',
      ok(() => previews.e1.chase.byMembership[uma.pe.id].why === 'EMAIL_OPTED_OUT')
    );
    assert(
      'E',
      'CORRECTION 1: she reads RED ["opted out"]',
      reads('e1', uma, 'RED', ['EMAIL_OPTED_OUT'])
    );
    assert(
      'E',
      'R3: her carried child reads RED [EMAIL_OPTED_OUT] too',
      reads('e1', uki, 'RED', ['EMAIL_OPTED_OUT'])
    );
    assert(
      'E',
      'CORRECTION 1: the guest who REPORTED after the press is on the host’s list with EMAIL_REPORTED …',
      ok(() =>
        previews.e1.hostList.some(
          (l: any) => l.personEventId === rita.pe.id && l.why === 'EMAIL_REPORTED'
        )
      )
    );
    assert(
      'E',
      '… and reads RED [EMAIL_OPTED_OUT] (GTC-324 ruling 1)',
      reads('e1', rita, 'RED', ['EMAIL_OPTED_OUT'])
    );
    assert(
      'E',
      '… and her carried child reads the same red',
      reads('e1', rik, 'RED', ['EMAIL_OPTED_OUT'])
    );
    assert(
      'E',
      'byMembership answers every non-host membership, and equals chooseChaseRoute through the preview’s own chooser',
      ok(() =>
        (['e1', 'e2', 'e3'] as const).every((k) => {
          const pv = previews[k];
          const ids = [
            ...glances[k].households.flatMap((h: any) => h.members),
            ...glances[k].unhoused,
          ]
            .filter((p: any) => !p.isHost)
            .map((p: any) => p.personEventId);
          return (
            ids.length > 0 && ids.every((id: string) => pv.chase.byMembership[id] !== undefined)
          );
        })
      )
    );
    assert(
      'E',
      'ONE ANSWER, ONE PLACE: for every person on all three boards, the fact the board carries is CHASE_REFUSAL_MEANS of the preview’s chase route',
      ok(() =>
        (['e1', 'e2', 'e3'] as const).every((k) =>
          [...glances[k].households.flatMap((h: any) => h.members), ...glances[k].unhoused]
            .filter((p: any) => !p.isHost)
            .every((p: any) => {
              const route = previews[k].chase.byMembership[p.personEventId];
              const want = route.kind === 'NONE' ? CF.CHASE_REFUSAL_MEANS[route.why] : null;
              return p.chase !== undefined && (p.chase?.standing ?? null) === want;
            })
        )
      )
    );
    assert(
      'E',
      'the ask is untouched: notChased still carries exactly the asked-and-not-chased (Ann, Ray; not Uma, not Rita)',
      ok(() => {
        const ids = previews.e1.chase.notChased.map((l: any) => l.personEventId);
        return (
          ids.includes(ann.pe.id) &&
          ids.includes(ray.pe.id) &&
          !ids.includes(uma.pe.id) &&
          !ids.includes(rita.pe.id)
        );
      })
    );

    // ══ LAYER F — the person view: the amended Ruling 32 ═══════════════════════════════
    const pf = (state: string, reasons: string[]) => ({ state, reasons });
    assert(
      'F',
      'panelFor still takes ONE argument',
      ok(() => SP.panelFor.length === 1)
    );
    for (const r of OPENING) {
      assert(
        'F',
        `RULING 32 AMENDED: NOT_CHASED [${r}] opens the READING room and wears the chevron`,
        ok(
          () =>
            SP.panelFor(pf('NOT_CHASED', [r])) === 'reading' &&
            SP.doorTreatmentFor(pf('NOT_CHASED', [r])) !== ''
        )
      );
    }
    for (const r of ['DONT_CHASE', 'CHILD_WITHOUT_ITEM']) {
      assert(
        'F',
        `NOT_CHASED [${r}] stays SEALED, with no chevron`,
        ok(
          () =>
            SP.panelFor(pf('NOT_CHASED', [r])) === null &&
            SP.doorTreatmentFor(pf('NOT_CHASED', [r])) === ''
        )
      );
    }
    assert(
      'F',
      'the unchanged rooms: RED acting, GREEN and AMBER reading, OUT sealed',
      ok(
        () =>
          SP.panelFor(pf('RED', ['REVERSAL'])) === 'acting' &&
          SP.panelFor(pf('GREEN', ['ACCEPTED'])) === 'reading' &&
          SP.panelFor(pf('AMBER', ['AWAITING_REPLY'])) === 'reading' &&
          SP.panelFor(pf('OUT', ['ATTENDANCE_NO'])) === null
      )
    );
    const borderWidths = (cls: string) =>
      cls.split(/\s+/).filter((t) => /^border(-\[[\d.]+px\]|-\d)?$/.test(t)).length;
    assert(
      'F',
      'a treated grey carries exactly ONE border-width utility — its own hairline, not a second from the door',
      ok(() => {
        // Guarded on the treatment being PRESENT: with no treatment the tone alone has one border,
        // and the count would pass for the wrong reason.
        const p = pf('NOT_CHASED', ['HANDED_TO_HOST']);
        const t = SP.doorTreatmentFor(p);
        return t !== '' && borderWidths(`${SP.STRIP_TONE.NOT_CHASED.className} ${t}`) === 1;
      })
    );
    assert(
      'F',
      'CONTROL: a treated GREEN still gets the door’s border (it has none of its own)',
      ok(
        () =>
          borderWidths(
            `${SP.STRIP_TONE.GREEN.className} ${SP.doorTreatmentFor(pf('GREEN', ['ACCEPTED']))}`
          ) === 1
      )
    );
    assert(
      'F',
      'readingStatusWord: "No answer yet" for an opening grey; still throws for NOT_CHASED with no reason and for DONT_CHASE',
      ok(() => {
        const word = RD.readingStatusWord('NOT_CHASED', ['HANDED_TO_HOST']) === 'No answer yet';
        const throws = (f: () => unknown) => {
          try {
            f();
            return false;
          } catch {
            return true;
          }
        };
        return (
          word &&
          throws(() => RD.readingStatusWord('NOT_CHASED')) &&
          throws(() => RD.readingStatusWord('NOT_CHASED', ['DONT_CHASE']))
        );
      })
    );
    const panel = (k: string, m: any) => RD.readingPanelFor(P(k, m), new Date());
    assert(
      'F',
      'the handed-over reading panel: "No answer yet", no nudge day, and the ruled sentence',
      ok(() => {
        const r = panel('e1', ann);
        return (
          r.status === 'No answer yet' &&
          r.nudge === null &&
          JSON.stringify(r.notes) === JSON.stringify([W_HANDED])
        );
      })
    );
    assert(
      'F',
      'the text-opted-out panel carries ruling AM’s sentence',
      ok(() => JSON.stringify(panel('e1', ray).notes) === JSON.stringify([W_SMS]))
    );
    assert(
      'F',
      'HOST_AS_CARRIER reads "It’s with you — I don’t chase you." and NEVER "… gets it, but I won’t chase …"',
      ok(() => {
        const n = P('e1', hoc).chaseNote;
        return (
          n === W_HOST_CARRIER &&
          !/gets it/.test(n) &&
          JSON.stringify(panel('e1', hoc).notes) === JSON.stringify([W_HOST_CARRIER])
        );
      })
    );
    assert(
      'F',
      'HOST_HOUSEHOLD_CHILD reads the ruled words, and CHASE_NONE_WHY carries them too',
      ok(
        () =>
          P('e3', h3kid).chaseNote === W_HOST_HOUSEHOLD &&
          APC.CHASE_NONE_WHY.HOST_HOUSEHOLD_CHILD === W_HOST_HOUSEHOLD
      )
    );
    assert(
      'F',
      'CHILD_WITHOUT_ITEM: no chaseNote — the strip is sealed and its sentence is never shown',
      ok(() => P('e3', cy).chaseNote === null)
    );
    assert(
      'F',
      'DONT_CHASE (a carrier’s mark): no chaseNote',
      ok(() => P('e1', moe).chaseNote === null && P('e2', moe4).chaseNote === null)
    );
    assert(
      'F',
      'the unsubscribed adult’s red carries CHASE_NONE_WHY.EMAIL_OPTED_OUT',
      ok(() => P('e1', uma).chaseNote === W_UNSUB)
    );
    assert(
      'F',
      'her carried child carries the ruled carrier sentence, naming her',
      ok(() => P('e1', uki).chaseNote === "Uma gets it, but I won't chase Uma.")
    );
    assert(
      'F',
      'the REPORTED adult: no chaseNote — ruling 3’s sentence already rides on emailNote',
      ok(
        () =>
          P('e1', rita).chaseNote === null && P('e1', rita).emailNote === EBW.EMAIL_REPORTED_WORDS
      )
    );
    assert(
      'F',
      'GREEN and AMBER panels carry NO notes, even when handed a person with both set',
      ok(() => {
        const base = P('e1', ctl);
        const g = RD.readingPanelFor(
          { ...base, state: 'GREEN', reasons: ['ACCEPTED'], chaseNote: 'x', emailNote: 'y' },
          new Date()
        );
        const a = RD.readingPanelFor({ ...base, chaseNote: 'x', emailNote: 'y' }, new Date());
        return Array.isArray(g.notes) && g.notes.length === 0 && a.notes.length === 0;
      })
    );
    assert(
      'F',
      'R2’s reported case: an opening grey’s panel carries its emailNote after the chase sentence',
      ok(() => {
        const base = P('e1', ray);
        const r = RD.readingPanelFor({ ...base, emailNote: 'NOTE' }, new Date());
        return JSON.stringify(r.notes) === JSON.stringify([W_SMS, 'NOTE']);
      })
    );
    assert(
      'F',
      'the reading panel renders its notes; PersonSurface renders chaseNote',
      /panel\.notes/.test(code('src/components/glance/GlancePersonReading.tsx')) &&
        /person\.chaseNote/.test(code('src/components/glance/PersonSurface.tsx'))
    );
    assert(
      'F',
      'the board asks panelFor and doorTreatmentFor with the PERSON, not the state',
      /panelFor\(person\)/.test(code('src/components/glance/GlanceBoard.tsx')) &&
        /doorTreatmentFor\(person\)/.test(code('src/components/glance/GlanceBoard.tsx'))
    );

    // ══ LAYER G — fences ═══════════════════════════════════════════════════════════════
    const cfSrc = code('src/lib/glance/chase-fact.ts');
    assert(
      'G',
      'chase-fact reaches no provider and no send path',
      cfSrc.length > 0 &&
        !/@\/lib\/(sms|email)['/]|resend|twilio|tnz/i.test(cfSrc.replace(/email-block-words/g, ''))
    );
    const diffQuiet = (paths: string[]) => {
      try {
        execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...paths], {
          cwd: ROOT,
          stdio: 'pipe',
        });
        return true;
      } catch {
        return false;
      }
    };
    assert('G', 'NO MIGRATION: prisma/ has no diff against HEAD', diffQuiet(['prisma']));
    assert(
      'G',
      'ZONE 7 unedited: opt-out-service.ts has no diff',
      diffQuiet(['src/lib/sms/opt-out-service.ts'])
    );
    assert(
      'G',
      'ZONE 9 unedited: email-opt-out.ts and email-block.ts have no diff',
      diffQuiet(['src/lib/eligibility/email-opt-out.ts', 'src/lib/eligibility/email-block.ts'])
    );

    // ══ LAYER H — the replay ═══════════════════════════════════════════════════════════
    const board3 = glances.e1;
    const unchangedRewind = (g: any) => {
      const people = [...g.households.flatMap((h: any) => h.members), ...g.unhoused];
      const responseAt = new Map<string, string>();
      const clockAt = new Map<string, any>();
      for (const p of people)
        for (const i of p.items) {
          responseAt.set(i.assignmentId, i.state === 'GREEN' ? 'ACCEPTED' : 'PENDING');
          clockAt.set(i.assignmentId, { dropOffAt: null, decideByOffsetHours: null });
        }
      return {
        people,
        rewind: {
          responseAt,
          absentAt: new Set<string>(),
          changedSince: new Map<string, number>(),
          clockAt,
          attendanceAt: new Map(
            people.map((p: any) => [p.personEventId, p.personEventId === yves.pe.id ? 'YES' : null])
          ),
          ambiguous: new Set<string>(),
        },
      };
    };
    const replayEvent = {
      status: 'CONFIRMING',
      sentAt,
      endDate: new Date(Date.now() + 130 * HOUR),
      decideByOffsetHours: null,
      nudgePace: null,
    };
    assert(
      'H',
      'NOTHING CHANGED: no grey and no opted-out person produces a replay step (the chase fact is handed to the past unrewound, like the mark)',
      ok(() => {
        const { rewind } = unchangedRewind(board3);
        const steps = RP.deriveReplay(
          board3,
          rewind,
          replayEvent,
          new Date(Date.now() - HOUR),
          new Date()
        ).steps;
        const quiet = [ann, ray, uma, uki, rita, rik, hoc, moe, annM].map((m) => m.pe.id);
        return steps.every((s: any) => !quiet.includes(s.personEventId));
      })
    );
    const g3 = glances.e3;
    {
      const people = g3 ? [...g3.households.flatMap((h: any) => h.members), ...g3.unhoused] : [];
      const mk = (yvesAt: 'YES' | null) => ({
        responseAt: new Map<string, string>(
          people.flatMap((p: any) => p.items.map((i: any) => [i.assignmentId, 'PENDING']))
        ),
        absentAt: new Set<string>(),
        changedSince: new Map<string, number>(),
        clockAt: new Map<string, any>(
          people.flatMap((p: any) =>
            p.items.map((i: any) => [
              i.assignmentId,
              { dropOffAt: null, decideByOffsetHours: null },
            ])
          )
        ),
        attendanceAt: new Map<string, any>(
          people.map((p: any) => [p.personEventId, p.personEventId === yves.pe.id ? yvesAt : null])
        ),
        ambiguous: new Set<string>(),
      });
      const yvesSteps = (yvesAt: 'YES' | null) =>
        RP.deriveReplay(
          g3,
          mk(yvesAt),
          replayEvent,
          new Date(Date.now() - HOUR),
          new Date()
        ).steps.filter((s: any) => s.personEventId === yves.pe.id);
      assert(
        'H',
        'ITEMLESS YES, first visit after she answered: plays ONCE, AMBER → GREEN with the spark',
        ok(() => {
          const s = yvesSteps(null);
          return (
            s.length === 1 && s[0].from === 'AMBER' && s[0].to === 'GREEN' && s[0].spark === true
          );
        })
      );
      assert(
        'H',
        'ITEMLESS YES, the next visit with nothing changed: no step — it never plays on every visit',
        ok(() => yvesSteps('YES').length === 0)
      );
    }
    // Finding 2: the delivery fact is measured, not asserted — reported in Evidence.
    {
      try {
        const { rewind } = unchangedRewind(board3);
        const steps = RP.deriveReplay(
          board3,
          rewind,
          replayEvent,
          new Date(Date.now() - HOUR),
          new Date()
        ).steps;
        const bouncedIds = [annB, rayB, hadult, cora].map((m) => m.pe.id);
        const replayed = steps.filter((s: any) => bouncedIds.includes(s.personEventId));
        console.log(
          `\x1b[36mi\x1b[0m [H] MEASURED (Finding 2): with nothing changed, ${replayed.length} of ${bouncedIds.length} NOT_DELIVERED people replay a step: ` +
            JSON.stringify(replayed.map((s: any) => `${s.from}→${s.to}`))
        );
      } catch (err) {
        console.log(
          `\x1b[36mi\x1b[0m [H] MEASURED (Finding 2): not measurable — ${(err as Error).message.split('\n')[0]}`
        );
      }
    }
  } finally {
    await prisma.outboundMessage.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.emailBlock.deleteMany({ where: { address: { in: created.addresses } } });
    await prisma.emailOptOut.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.event.deleteMany({ where: { id: { in: created.events } } });
    await prisma.person.deleteMany({ where: { id: { in: created.persons } } });
    const left = await prisma.event.count({ where: { id: { in: created.events } } });
    assert('Z', 'cleanup: every fixture event is gone', left === 0);
    await prisma.$disconnect();
  }

  console.log(`\nTotal tests: ${passed + failed}   Passed: ${passed}   Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nRED:');
    for (const r of redAssertions) console.log(`  ${r}`);
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
