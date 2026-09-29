/**
 * GTC-293 — two people who share one email address.
 *
 * DB-level regression test (house pattern, cf. household-edit-preserves-membership-test.ts).
 * Exercises the identity rule every capture site now shares — `findOrCreateCapturedPerson`
 * in `src/lib/households/capturePerson.ts` — and the household edit path
 * (`reconcileHouseholdMembers`) against a real database with manufactured state.
 *
 * The rule, as ruled (founder, 2026-09-29, Q1 / Q2 / Q8): a typed row is an existing Person
 * only when it carries that Person's address AND first name (the first word of the trimmed
 * name, case-insensitive). Otherwise it is a new Person, with exactly the name typed. The
 * host's own address follows the same rule: with her first name it is her; with another
 * first name it is somebody who shares her inbox, and is asked like any other adult.
 *
 *   A  create: two people at one address are two Persons
 *   B  edit: a partner at the primary's address — no demotion, and the next save works
 *   C  edit: moving a member, or the primary, onto an address another member holds
 *   D  cross-event: both readings of "a name typed at capture is kept" (Q1's trade)
 *   E  re-entry: the same first name at the same address is the same person
 *   F  the host's address, both arms (Q8); she herself is never addressable
 *   G  structural: no capture site finds a Person by a unique email any more
 *
 * RED at 008ab82 (before the fix): A and G fail because the helper does not exist; B, C,
 * D1, E and F2 fail on behaviour.
 *
 * Nothing here sends: no transport is imported, and capture sends nothing.
 *
 * Run: npx tsx tests/shared-address-test.ts
 * Destructive to its own created rows only, found by recorded ids; cleans up in finally.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { reconcileHouseholdMembers } from '../src/lib/households/reconcileMembers';
import type { ReconcileInput } from '../src/lib/households/reconcileMembers';
import { isAddressable, ADDRESSABLE_PERSON_EVENT } from '../src/lib/eligibility/host-exclusion';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}${detail ? `\n    ${detail}` : ''}`);
    failed++;
  }
}

type CaptureModule = typeof import('../src/lib/households/capturePerson');

const stamp = `gtc293-${Date.now()}`;
const addr = (label: string) => `${stamp}-${label}@example.com`;

const eventIds: string[] = [];
const recordedPersonIds = new Set<string>();

async function makeEvent(label: string, host: { name: string; email: string }) {
  const hostPerson = await prisma.person.create({ data: host });
  recordedPersonIds.add(hostPerson.id);
  const start = new Date();
  start.setDate(start.getDate() + 14);
  const event = await prisma.event.create({
    data: { name: `GTC-293 ${label}`, startDate: start, endDate: start, hostId: hostPerson.id },
  });
  eventIds.push(event.id);
  return { event, hostPerson };
}

async function makeHousehold(
  eventId: string,
  primary: { personId: string; role?: 'HOST' | 'PARTICIPANT' }
) {
  const household = await prisma.household.create({ data: { eventId, littleCount: 0 } });
  const row = await prisma.personEvent.create({
    data: {
      personId: primary.personId,
      eventId,
      role: primary.role ?? 'PARTICIPANT',
      householdId: household.id,
      householdRole: 'PRIMARY_CONTACT',
    },
  });
  return { household, row };
}

async function makePerson(name: string, email: string | null) {
  const p = await prisma.person.create({ data: { name, email } });
  recordedPersonIds.add(p.id);
  return p;
}

/**
 * The PUT handler, minus its cookie: load the household, find its PRIMARY_CONTACT (the PUT
 * returns 500 when there is none), and reconcile inside a transaction.
 */
async function edit(
  eventId: string,
  householdId: string,
  input: ReconcileInput
): Promise<{ ok: true } | { ok: false; why: string }> {
  const hh = await prisma.household.findUniqueOrThrow({
    where: { id: householdId },
    include: { members: true },
  });
  const primaryMember = hh.members.find((m) => m.householdRole === 'PRIMARY_CONTACT');
  if (!primaryMember) return { ok: false, why: 'PUT 500: Primary contact not found in household' };
  try {
    await prisma.$transaction((tx) =>
      reconcileHouseholdMembers(tx, {
        eventId,
        household: { id: hh.id, members: hh.members },
        primaryMember,
        sentAt: null,
        input,
      })
    );
    return { ok: true };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { ok: false, why: `${err.code ?? ''} ${(err.message ?? '').split('\n').pop()}` };
  }
}

async function members(householdId: string) {
  return prisma.personEvent.findMany({
    where: { householdId },
    include: { person: true },
    orderBy: { id: 'asc' },
  });
}

/** Members as the client sends them back on the next save: existing rows carry their id. */
function asInput(rows: Awaited<ReturnType<typeof members>>, role: string) {
  return rows
    .filter((m) => m.householdRole === role)
    .map((m) => ({
      personEventId: m.id,
      name: m.person.name,
      email: m.person.email ?? undefined,
    }));
}

async function main() {
  let capture: CaptureModule | null = null;
  try {
    capture = await import('../src/lib/households/capturePerson');
  } catch {
    capture = null;
  }
  const helperMissing = 'findOrCreateCapturedPerson does not exist at this tree';

  try {
    // ── A. Create: two people at one address are two Persons ───────────────────
    {
      const { event } = await makeEvent('A create', {
        name: 'A Host',
        email: addr('a-host'),
      });
      const shared = addr('a-shared');
      if (!capture) {
        assert('A: primary and partner at one address are two Persons', false, helperMissing);
      } else {
        const aroha = await capture.findOrCreateCapturedPerson(prisma, {
          eventId: event.id,
          hostPersonId: event.hostId,
          name: 'Aroha',
          email: shared,
          phoneNumber: null,
          sentAt: null,
        });
        recordedPersonIds.add(aroha.id);
        await prisma.personEvent.create({
          data: { personId: aroha.id, eventId: event.id, role: 'PARTICIPANT' },
        });
        const tama = await capture.findOrCreateCapturedPerson(prisma, {
          eventId: event.id,
          hostPersonId: event.hostId,
          name: 'Tama',
          email: shared,
          phoneNumber: null,
          sentAt: null,
        });
        recordedPersonIds.add(tama.id);
        const tamaRow = await prisma.personEvent.findUnique({
          where: { personId_eventId: { personId: tama.id, eventId: event.id } },
        });
        assert(
          'A: primary and partner at one address are two Persons, each with the name typed',
          aroha.id !== tama.id && aroha.name === 'Aroha' && tama.name === 'Tama',
          `aroha=${aroha.id} tama=${tama.id}`
        );
        assert(
          'A: and the partner has no membership yet, so the capture site creates one ' +
            '(nothing is silently returned in their place)',
          tamaRow === null
        );
        assert('A: both hold the shared address', aroha.email === shared && tama.email === shared);
      }
    }

    // ── B. Edit: a partner at the primary's address ───────────────────────────
    {
      const { event } = await makeEvent('B edit', { name: 'B Host', email: addr('b-host') });
      const mum = await makePerson('Mum', addr('b-shared'));
      const { household, row: mumRow } = await makeHousehold(event.id, { personId: mum.id });

      const first = await edit(event.id, household.id, {
        primaryContact: { name: 'Mum', email: mum.email! },
        partner: { name: 'Dad', email: mum.email! },
      });
      assert('B: the save that adds the partner succeeds', first.ok, JSON.stringify(first));

      const after = await members(household.id);
      after.forEach((m) => recordedPersonIds.add(m.personId));
      const mumAfter = after.find((m) => m.id === mumRow.id);
      const dad = after.find((m) => m.person.name === 'Dad');
      assert(
        'B: the primary contact is still PRIMARY_CONTACT',
        mumAfter?.householdRole === 'PRIMARY_CONTACT',
        `mum's householdRole is ${mumAfter?.householdRole}`
      );
      assert(
        'B: the partner exists — their own Person, at the shared address, as PARTNER',
        !!dad &&
          dad.personId !== mum.id &&
          dad.person.email === mum.email &&
          dad.householdRole === 'PARTNER',
        `members: ${after.map((m) => `${m.person.name}/${m.householdRole}`).join(', ')}`
      );

      const second = await edit(event.id, household.id, {
        primaryContact: { name: 'Mum', email: mum.email! },
        partner: dad ? { personEventId: dad.id, name: 'Dad', email: mum.email! } : undefined,
      });
      assert(
        'B: a further save of the household succeeds (the PUT finds its PRIMARY_CONTACT)',
        second.ok,
        JSON.stringify(second)
      );
    }

    // ── C. Edit: moving onto an address another member holds ──────────────────
    {
      const { event } = await makeEvent('C move', { name: 'C Host', email: addr('c-host') });
      const pita = await makePerson('Pita', addr('c-pita'));
      const { household } = await makeHousehold(event.id, { personId: pita.id });
      const seeded = await edit(event.id, household.id, {
        primaryContact: { name: 'Pita', email: pita.email! },
        partner: { name: 'Quinn', email: addr('c-quinn') },
        guests: [{ name: 'Rangi', email: addr('c-rangi') }],
      });
      assert('C: setup — a household of three distinct addresses saves', seeded.ok);
      let rows = await members(household.id);
      rows.forEach((m) => recordedPersonIds.add(m.personId));

      const moved = await edit(event.id, household.id, {
        primaryContact: { name: 'Pita', email: pita.email! },
        partner: asInput(rows, 'PARTNER').map((m) => ({ ...m, email: pita.email! }))[0],
        guests: asInput(rows, 'GUEST'),
      });
      assert(
        'C: moving the partner onto the primary’s address saves',
        moved.ok,
        JSON.stringify(moved)
      );
      rows = await members(household.id);
      assert('C: and both hold it', rows.filter((m) => m.person.email === pita.email).length === 2);

      const primaryMoved = await edit(event.id, household.id, {
        primaryContact: { name: 'Pita', email: addr('c-rangi') },
        partner: asInput(rows, 'PARTNER')[0],
        guests: asInput(rows, 'GUEST'),
      });
      assert(
        'C: moving the PRIMARY onto a guest’s address saves',
        primaryMoved.ok,
        JSON.stringify(primaryMoved)
      );
      rows = await members(household.id);
      assert(
        'C: and both hold it, the primary still PRIMARY_CONTACT',
        rows.filter((m) => m.person.email === addr('c-rangi')).length === 2 &&
          rows.find((m) => m.personId === pita.id)?.householdRole === 'PRIMARY_CONTACT'
      );
    }

    // ── D. Cross-event: both readings of Acceptance 4 (Q1's ruled trade) ────────
    {
      const { event: other } = await makeEvent('D other event', {
        name: 'D Other Host',
        email: addr('d-otherhost'),
      });
      const kate = await makePerson('Kate Henderson', addr('d-kate'));
      await makeHousehold(other.id, { personId: kate.id });

      const { event } = await makeEvent('D edit', { name: 'D Host', email: addr('d-host') });
      const hine = await makePerson('Hine', addr('d-hine'));
      const { household } = await makeHousehold(event.id, { personId: hine.id });

      // D1 — a different first name at that address: a new Person, exactly the typed name.
      const d1 = await edit(event.id, household.id, {
        primaryContact: { name: 'Hine', email: hine.email! },
        guests: [{ name: 'Priya Shah', email: kate.email! }],
      });
      let rows = await members(household.id);
      rows.forEach((m) => recordedPersonIds.add(m.personId));
      const priya = rows.find((m) => m.householdRole === 'GUEST');
      assert(
        'D1: a different first name at an address another event holds is a NEW Person ' +
          'with exactly the typed name',
        d1.ok && !!priya && priya.personId !== kate.id && priya.person.name === 'Priya Shah',
        `guest: ${priya?.person.name} (${priya?.personId === kate.id ? 'the other event’s Person' : 'own Person'})`
      );
      const kateAfter = await prisma.person.findUniqueOrThrow({ where: { id: kate.id } });
      assert(
        'D1: and the other event’s Person is unchanged',
        kateAfter.name === 'Kate Henderson' && kateAfter.email === kate.email
      );

      // D2 — the same first name at that address: the same Person, and the name already on
      // that Person shows. The ruled trade (Q1), not a missed assertion.
      const d2 = await edit(event.id, household.id, {
        primaryContact: { name: 'Hine', email: hine.email! },
        guests: [...asInput(rows, 'GUEST'), { name: 'kate', email: kate.email! }],
      });
      rows = await members(household.id);
      rows.forEach((m) => recordedPersonIds.add(m.personId));
      const kateHere = rows.find((m) => m.personId === kate.id);
      assert(
        'D2: the same first name at that address is the SAME Person — the name already on ' +
          'that Person shows',
        d2.ok && !!kateHere && kateHere.person.name === 'Kate Henderson',
        `members: ${rows.map((m) => m.person.name).join(', ')}`
      );
    }

    // ── E. Re-entry: the same first name at the same address is the same person ──
    {
      const { event } = await makeEvent('E re-entry', { name: 'E Host', email: addr('e-host') });
      const kate = await makePerson('Kate', addr('e-kate'));
      const { household, row: kateRow } = await makeHousehold(event.id, { personId: kate.id });

      const e1 = await edit(event.id, household.id, {
        primaryContact: { name: 'Kate', email: kate.email! },
        guests: [{ name: 'kate henderson', email: kate.email!.toUpperCase() }],
      });
      let rows = await members(household.id);
      rows.forEach((m) => recordedPersonIds.add(m.personId));
      assert(
        'E1: "kate henderson" at "KATE’S ADDRESS" is Kate — no second Person, no second membership',
        e1.ok &&
          rows.length === 1 &&
          (await prisma.person.count({
            where: { email: { equals: kate.email!, mode: 'insensitive' } },
          })) === 1,
        `members: ${rows.map((m) => `${m.person.name}/${m.person.email}`).join(', ')}`
      );

      const e2 = await edit(event.id, household.id, {
        primaryContact: { name: 'Kate', email: kate.email! },
        partner: { name: 'Kate', email: kate.email! },
      });
      rows = await members(household.id);
      const kateAfter = rows.find((m) => m.id === kateRow.id);
      assert(
        'E2: the primary retyped as a partner under her first name is NOT demoted',
        e2.ok && kateAfter?.householdRole === 'PRIMARY_CONTACT',
        `her householdRole is ${kateAfter?.householdRole}`
      );
      const e2b = await edit(event.id, household.id, {
        primaryContact: { name: 'Kate', email: kate.email! },
      });
      assert('E2: and the household saves again', e2b.ok, JSON.stringify(e2b));

      if (!capture) {
        assert('E3: two first names at one address are two Persons', false, helperMissing);
        assert('E3: "Kate" and "Kate Henderson" are one first name', false, helperMissing);
        assert('E3: first names compare case-insensitively', false, helperMissing);
      } else {
        const shared = addr('e-lee');
        const args = {
          eventId: event.id,
          hostPersonId: event.hostId,
          phoneNumber: null,
          sentAt: null,
          email: shared,
        };
        const sam = await capture.findOrCreateCapturedPerson(prisma, { ...args, name: 'Sam Lee' });
        recordedPersonIds.add(sam.id);
        const alex = await capture.findOrCreateCapturedPerson(prisma, {
          ...args,
          name: 'Alex Lee',
        });
        recordedPersonIds.add(alex.id);
        assert('E3: two first names at one address are two Persons', sam.id !== alex.id);
        const samAgain = await capture.findOrCreateCapturedPerson(prisma, {
          ...args,
          name: '  Sam  ',
        });
        recordedPersonIds.add(samAgain.id);
        assert('E3: "Sam" and "Sam Lee" are one first name', samAgain.id === sam.id);
        const samUpper = await capture.findOrCreateCapturedPerson(prisma, {
          ...args,
          name: 'SAM Lee-Tahana',
        });
        recordedPersonIds.add(samUpper.id);
        assert('E3: first names compare case-insensitively', samUpper.id === sam.id);
      }
    }

    // ── F. The host's own address, both arms (Q8) ──────────────────────────────
    {
      const { event, hostPerson } = await makeEvent('F host', {
        name: 'Kate Hosting',
        email: addr('f-host'),
      });
      const { household: hostHh, row: hostRow } = await makeHousehold(event.id, {
        personId: hostPerson.id,
        role: 'HOST',
      });
      const gran = await makePerson('Gran', addr('f-gran'));
      const { household: granHh } = await makeHousehold(event.id, { personId: gran.id });
      const hostInput = { name: 'Kate Hosting', email: hostPerson.email! };
      const holders = () => prisma.person.count({ where: { email: hostPerson.email! } });

      // F1 — her address with her first name is her.
      const f1a = await edit(event.id, hostHh.id, {
        primaryContact: hostInput,
        guests: [{ name: 'kate', email: hostPerson.email! }],
      });
      const f1b = await edit(event.id, granHh.id, {
        primaryContact: { name: 'Gran', email: gran.email! },
        partner: { name: 'Kate H', email: hostPerson.email! },
      });
      const hostAfter = await prisma.personEvent.findUniqueOrThrow({ where: { id: hostRow.id } });
      assert(
        'F1: her address with her first name is HER — in her own household and in another, ' +
          'no second Person holds her address',
        f1a.ok && f1b.ok && (await holders()) === 1
      );
      assert(
        'F1: and her row is unmoved — role HOST, PRIMARY_CONTACT, her own household',
        hostAfter.role === 'HOST' &&
          hostAfter.householdRole === 'PRIMARY_CONTACT' &&
          hostAfter.householdId === hostHh.id
      );
      if (!capture) {
        assert(
          'F1: the helper resolves her address + first name to her Person',
          false,
          helperMissing
        );
      } else {
        const her = await capture.findOrCreateCapturedPerson(prisma, {
          eventId: event.id,
          hostPersonId: event.hostId,
          name: 'KATE Smith',
          email: hostPerson.email!.toUpperCase(),
          phoneNumber: null,
          sentAt: null,
        });
        assert(
          'F1: the helper (every POST path) resolves her address + first name to her Person',
          her.id === hostPerson.id
        );
      }

      // F2 — her address with another first name is somebody who shares her inbox.
      const f2a = await edit(event.id, hostHh.id, {
        primaryContact: hostInput,
        guests: [{ name: 'Hemi', email: hostPerson.email! }],
      });
      const granRows = await members(granHh.id);
      const f2b = await edit(event.id, granHh.id, {
        primaryContact: { name: 'Gran', email: gran.email! },
        partner: { name: 'Aroha', email: hostPerson.email! },
        guests: asInput(granRows, 'GUEST'),
      });
      const hostHhRows = await members(hostHh.id);
      const granHhRows = await members(granHh.id);
      [...hostHhRows, ...granHhRows].forEach((m) => recordedPersonIds.add(m.personId));
      const hemi = hostHhRows.find((m) => m.person.name === 'Hemi');
      const aroha = granHhRows.find((m) => m.person.name === 'Aroha');
      assert(
        'F2: her address with ANOTHER first name, in her own household, is a new ' +
          'PARTICIPANT who shares her inbox',
        f2a.ok &&
          !!hemi &&
          hemi.personId !== hostPerson.id &&
          hemi.role === 'PARTICIPANT' &&
          hemi.householdRole === 'GUEST' &&
          hemi.person.email === hostPerson.email,
        `her household: ${hostHhRows.map((m) => `${m.person.name}/${m.role}/${m.householdRole}`).join(', ')}`
      );
      assert(
        'F2: and in another household, the same — a new PARTNER at her address',
        f2b.ok && !!aroha && aroha.personId !== hostPerson.id && aroha.householdRole === 'PARTNER',
        `gran's household: ${granHhRows.map((m) => `${m.person.name}/${m.householdRole}`).join(', ')}`
      );
      assert(
        'F2: both are addressable — asked like any other adult (ruling 3: each their own email)',
        !!hemi &&
          !!aroha &&
          isAddressable(hemi, event.hostId) &&
          isAddressable(aroha, event.hostId) &&
          (await prisma.personEvent.count({
            where: {
              eventId: event.id,
              person: { email: hostPerson.email! },
              ...ADDRESSABLE_PERSON_EVENT(event.hostId),
            },
          })) === 2
      );
      const hostFinal = await prisma.personEvent.findUniqueOrThrow({ where: { id: hostRow.id } });
      assert(
        'F1+F2: the host herself is never addressable, and her row is still unmoved',
        !isAddressable(hostFinal, event.hostId) &&
          hostFinal.role === 'HOST' &&
          hostFinal.householdRole === 'PRIMARY_CONTACT' &&
          hostFinal.householdId === hostHh.id
      );
    }

    // ── G. Structural ──────────────────────────────────────────────────────────
    {
      const root = path.join(__dirname, '..');
      const offenders: string[] = [];
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/\.tsx?$/.test(entry.name)) {
            const src = fs.readFileSync(full, 'utf8');
            if (/person\.findUnique\(\s*\{\s*where:\s*\{\s*email/.test(src)) {
              offenders.push(path.relative(root, full));
            }
          }
        }
      };
      walk(path.join(root, 'src'));
      assert(
        'G: no file in src/ finds a Person by email with findUnique',
        offenders.length === 0,
        offenders.join(', ')
      );
      const sites = [
        'src/app/api/events/[id]/households/route.ts',
        'src/lib/households/reconcileMembers.ts',
        'src/app/api/events/[id]/people/route.ts',
        'src/app/api/events/[id]/people/batch-import/route.ts',
      ];
      const missing = sites.filter(
        (s) => !fs.readFileSync(path.join(root, s), 'utf8').includes('findOrCreateCapturedPerson(')
      );
      assert(
        'G: all four capture sites call findOrCreateCapturedPerson',
        missing.length === 0,
        missing.join(', ')
      );
    }
  } finally {
    // Only what this run can prove it made (GTC-292): its events by recorded id, and the
    // Persons it recorded or that hold one of its stamped addresses.
    const members = await prisma.personEvent.findMany({
      where: { eventId: { in: eventIds } },
      select: { personId: true },
    });
    members.forEach((m) => recordedPersonIds.add(m.personId));
    await prisma.personEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.household.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    const deletable = await prisma.person.findMany({
      where: {
        id: { in: [...recordedPersonIds] },
        email: { startsWith: stamp, mode: 'insensitive' },
        eventMemberships: { none: {} },
      },
      select: { id: true },
    });
    await prisma.person.deleteMany({ where: { id: { in: deletable.map((p) => p.id) } } });
    const left = await prisma.person.count({
      where: { email: { startsWith: stamp, mode: 'insensitive' } },
    });
    console.log(`\ncleanup: ${eventIds.length} events, ${deletable.length} persons; left: ${left}`);
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
