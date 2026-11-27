/**
 * GTC-472 — Moment 3: share one dish between several people, the amount divided.
 *
 * The founder's rulings of 22 Nov 2026 are in docs/tickets/GTC-472.md. In short: one new route
 * (POST /api/events/[id]/items/[itemId]/share), the dish's rows recognised through a link written
 * into the ledger (no migration), the action inside the Details box, any real number in the
 * "specified" state divides whatever the unit word is, W1 to W10 as ruled, and (D5) a guest sees
 * the amount on their own row.
 *
 * LAYERS
 *   A  the dividing rules, pure (examples, the total always kept, the refusals)
 *   B  the words, typed again by hand so a changed constant fails rather than agreeing with itself
 *   C  the server work in process: fields carried, placement, the dish's rows, the refusals, the
 *      guard, the ledger, one transaction
 *   D  the route over HTTP on the dev server (sign-in, role, the round trip)
 *   E  nothing sends, and the sample demo
 *   F  the screen's source, read structurally
 *   G  D5: what a guest reads (the helper, then the real guest route)
 *   P  the guest route's new state (this suite pins what test:demo-replies R2 pinned until GTC-472)
 *   J  what this ticket may not touch
 *
 * NOTHING SENDS. `installProviderTrap` walls the process after the real fetch is kept for the dev
 * server on loopback. No cron, no dispatcher, no press. Every row is made with this run's tag and
 * removed by id in `finally`.
 *
 * Needs the dev server on :3000 for layers D and G, started as the constants file says (provider
 * keys and the AI key blank). Run with: npm run test:share-a-dish
 *
 * MODULES THAT DO NOT EXIST YET ARE LOADED BY A GUARDED IMPORT, so at RED each assertion goes red
 * on its own and the suite runs to its end.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import { prisma } from '../src/lib/prisma';
import { assignedCounterLine } from '../src/lib/moment3/people';
import { installProviderTrap, trapCount } from './helpers/provider-trap';

const ROOT = process.cwd();
const BASE = process.env.SECURITY_TEST_BASE_URL ?? 'http://localhost:3000';
const TAG = `GTC472-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;
/** origin/main when this ticket was built (the merge of pull request 113). */
const GTC472_BASE = '4e7dfa1';

const realFetch = globalThis.fetch;

let passed = 0;
let failed = 0;
const red: string[] = [];
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
    red.push(label);
  }
}
function section(title: string) {
  console.log(`\n\x1b[1m\x1b[33m${title}\x1b[0m`);
}
function ok(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}
async function okAsync(fn: () => Promise<boolean>): Promise<boolean> {
  try {
    return await fn();
  } catch {
    return false;
  }
}
async function load(rel: string): Promise<any | null> {
  try {
    return await import(rel);
  } catch {
    return null;
  }
}
function read(rel: string): string {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
}
/** Source with block and line comments taken out, so a pin reads code and not what a comment says. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

// ── The founder's words, typed here (W1 to W10, ruled 22 Nov 2026) ──
const W = {
  W1: 'Share with someone',
  W2: (dish: string) => `Who else is bringing ${dish}?`,
  W3: 'Already has it',
  W4: "Here's the split. Change any number you like.",
  W5_SHARE: 'Share it',
  W5_BACK: 'Back',
  W5_SAVING: 'Sharing…',
  W6: "This amount hasn't been divided. Each row keeps it as it is.",
  W7_ONE: (name: string) =>
    `No message goes out. ${name} was asked for the full amount, so you may want to tell them.`,
  W7_TWO: (a: string, b: string) =>
    `No message goes out. ${a} and ${b} were asked for the full amount, so you may want to tell them.`,
  W7_THREE: (a: string, b: string, c: string) =>
    `No message goes out. ${a}, ${b} and ${c} were asked for the full amount, so you may want to tell them.`,
  W8: (dish: string) => `${dish} is unassigned again. Nobody's amount has changed.`,
  W9_PERSON: (dish: string, name: string) => `Share ${dish} with ${name}`,
  W9_AMOUNT: (name: string) => `Amount for ${name}`,
  W10: (sum: string, total: string) => `That's ${sum} of ${total}.`,
};

const VIEW = 'src/components/plan/Moment3AssignView.tsx';
const BOX = 'src/components/plan/Moment3ItemDetail.tsx';
const SHAREUI = 'src/components/plan/Moment3ShareDish.tsx';
const WORDS = 'src/lib/moment3/words.ts';
const ROUTE = 'src/app/api/events/[id]/items/[itemId]/share/route.ts';
const SPLIT = 'src/lib/moment3/share-split.ts';
const SHARE = 'src/lib/moment3/share-dish.ts';
const GUEST_ROUTE = 'src/app/api/p/[token]/route.ts';
const GUEST_HELPER = 'src/lib/guest/guest-amount.ts';

async function main() {
  const createdEventIds: string[] = [];
  const createdPersonIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    const SP = await load('../src/lib/moment3/share-split');
    const S = await load('../src/lib/moment3/share-dish');
    const WD = await load('../src/lib/moment3/words');
    const GA = await load('../src/lib/guest/guest-amount');
    const PW = await load('../src/lib/ai/plan-write');

    // ══ LAYER A — the dividing rules ═════════════════════════════════════════════════
    section('Layer A — the dividing rules (pure)');
    const split = (t: number, n: number): number[] | null => {
      try {
        return SP.splitTotal(t, n);
      } catch {
        return null;
      }
    };
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    assert('A1 20 serves between 2 people: 10 and 10', same(split(20, 2), [10, 10]));
    assert('A2 3 pavlovas between 2 people: 2 and 1', same(split(3, 2), [2, 1]));
    assert('A3 20 serves between 3 people: 7, 7 and 6', same(split(20, 3), [7, 7, 6]));
    assert(
      'A4 2.5 kg between 3 people: 0.84, 0.83 and 0.83',
      same(split(2.5, 3), [0.84, 0.83, 0.83])
    );
    assert(
      'A5 1 tray between 2 people: a whole split would leave someone with nothing, so 0.5 and 0.5',
      same(split(1, 2), [0.5, 0.5])
    );
    assert(
      'A6 10 between 3 people: 4, 3 and 3 (the leftover goes to the first)',
      same(split(10, 3), [4, 3, 3])
    );
    assert(
      'A7 fewer than two people is not a split',
      split(10, 1) === null && split(10, 0) === null
    );
    assert(
      'A8 a total too small to give everyone a hundredth is not divided',
      split(0.01, 2) === null
    );
    let totalKept = true;
    let eachPositive = true;
    let evenEnough = true;
    let twoDecimals = true;
    let firstNeverLess = true;
    for (let i = 0; i < 400; i++) {
      const whole = i % 2 === 0;
      const t = whole
        ? 1 + Math.floor(Math.random() * 300)
        : Math.round((0.05 + Math.random() * 80) * 100) / 100;
      const n = 2 + Math.floor(Math.random() * 11);
      const parts = split(t, n);
      if (parts === null) continue;
      const hundredths = parts.reduce((a, x) => a + Math.round(x * 100), 0);
      if (hundredths !== Math.round(t * 100)) totalKept = false;
      if (parts.some((x) => !(x > 0))) eachPositive = false;
      if (Math.max(...parts) - Math.min(...parts) > 1.0001) evenEnough = false;
      if (parts.some((x) => Math.abs(x * 100 - Math.round(x * 100)) > 1e-6)) twoDecimals = false;
      if (parts[0] < parts[parts.length - 1]) firstNeverLess = false;
    }
    assert(
      'A9 over 400 random totals and head counts the split always adds up to the total',
      totalKept
    );
    assert(
      'A10 every part is above zero, at most two decimals, and the first holder never gets less',
      eachPositive && twoDecimals && firstNeverLess
    );
    assert('A11 no two parts differ by more than one whole unit', evenEnough);
    const dividable = (over: Record<string, unknown>) =>
      ok(() =>
        SP.isDividable({
          kind: 'ITEM',
          quantityState: 'SPECIFIED',
          quantityAmount: 20,
          quantityDeferredTo: null,
          ...over,
        })
      );
    assert('A12 a specified number divides', dividable({}));
    assert(
      'A13 a placeholder, a not-applicable amount and a deferred amount do not',
      !dividable({ quantityState: 'PLACEHOLDER' }) &&
        !dividable({ quantityState: 'NA' }) &&
        !dividable({ quantityDeferredTo: 'COORDINATOR' })
    );
    assert(
      'A14 words only (no number), zero, a job, and more than two decimals do not',
      !dividable({ quantityAmount: null }) &&
        !dividable({ quantityAmount: 0 }) &&
        !dividable({ kind: 'TASK' }) &&
        !dividable({ quantityAmount: 1.234 })
    );
    const valid = (x: unknown) => ok(() => SP.validShareAmount(x));
    assert(
      'A15 a host-typed number must be above zero with at most two decimals',
      valid(10) &&
        valid(0.5) &&
        valid(2.25) &&
        !valid(0) &&
        !valid(-1) &&
        !valid(1.234) &&
        !valid(NaN) &&
        !valid('4') &&
        !valid(Infinity) &&
        !valid(null)
    );
    assert(
      'A16 the unit word is the custom word when there is one, else the plain word the plan view uses',
      ok(
        () =>
          SP.unitWordOf({ quantityUnit: 'CUSTOM', quantityUnitCustom: 'servings' }) ===
            'servings' &&
          SP.unitWordOf({ quantityUnit: 'KG', quantityUnitCustom: null }) === 'kg' &&
          SP.unitWordOf({ quantityUnit: 'L', quantityUnitCustom: null }) === 'litres' &&
          SP.unitWordOf({ quantityUnit: 'COUNT', quantityUnitCustom: null }) === 'pieces' &&
          SP.unitWordOf({ quantityUnit: 'CUSTOM', quantityUnitCustom: null }) === '' &&
          SP.amountDetail(10, 'servings') === '10 servings' &&
          SP.amountDetail(2.5, 'kg') === '2.5 kg' &&
          SP.amountDetail(3, '') === '3'
      )
    );

    // ══ LAYER B — the words ══════════════════════════════════════════════════════════
    section('Layer B — the words, typed again by hand (W1 to W10)');
    const SW = WD?.M3_SHARE_WORDS;
    assert(
      'B1 W1 "Share with someone"',
      ok(() => SW.SHARE_BUTTON === W.W1)
    );
    assert(
      'B2 W2 "Who else is bringing {dish}?"',
      ok(() => WD.sharePickHeading('Green salad') === W.W2('Green salad'))
    );
    assert(
      'B3 W3 "Already has it"',
      ok(() => SW.ALREADY_HAS === W.W3)
    );
    assert(
      'B4 W4 "Here\'s the split. Change any number you like."',
      ok(() => SW.SPLIT_HEAD === W.W4)
    );
    assert(
      'B5 W5 "Share it", "Back" and "Sharing…"',
      ok(() => SW.CONFIRM === W.W5_SHARE && SW.BACK === W.W5_BACK && SW.SHARING === W.W5_SAVING)
    );
    assert(
      'B6 W6 the not-divided line',
      ok(() => SW.NOT_DIVIDED === W.W6)
    );
    assert(
      'B7 W7 for one, two and three people ("was" for one, "were" after)',
      ok(
        () =>
          WD.shareToldLine(['Mum']) === W.W7_ONE('Mum') &&
          WD.shareToldLine(['Mum', 'Ross']) === W.W7_TWO('Mum', 'Ross') &&
          WD.shareToldLine(['Mum', 'Ross', 'Cara']) === W.W7_THREE('Mum', 'Ross', 'Cara')
      )
    );
    assert(
      'B8 W8 "{dish} is unassigned again. Nobody\'s amount has changed."',
      ok(() => WD.shareUnassignedLine('Green salad') === W.W8('Green salad'))
    );
    assert(
      'B9 W9 the two screen-reader names',
      ok(
        () =>
          WD.sharePersonLabel('Green salad', 'Joanna') === W.W9_PERSON('Green salad', 'Joanna') &&
          WD.shareAmountLabel('Joanna') === W.W9_AMOUNT('Joanna')
      )
    );
    assert(
      'B10 W10 "That\'s {sum} of {total}." with plain numbers',
      ok(
        () =>
          WD.shareTotalLine(18, 20) === W.W10('18', '20') &&
          WD.shareTotalLine(17.5, 20) === W.W10('17.5', '20')
      )
    );
    const wordsSrc = read(WORDS);
    const block = wordsSrc.slice(wordsSrc.indexOf('GTC-472'));
    assert(
      'B11 the new block never says "remind" or "chase"',
      block.length > 0 && !/remind|chase/i.test(block)
    );

    // ══ the fixture ══════════════════════════════════════════════════════════════════
    const now = new Date();
    const hostUser = await prisma.user.create({ data: { email: `${TAG}-host@example.com` } });
    createdUserIds.push(hostUser.id);
    const otherUser = await prisma.user.create({ data: { email: `${TAG}-other@example.com` } });
    createdUserIds.push(otherUser.id);
    const coordUser = await prisma.user.create({ data: { email: `${TAG}-coord@example.com` } });
    createdUserIds.push(coordUser.id);
    const mkSession = async (userId: string) => {
      const token = randomBytes(24).toString('hex');
      await prisma.session.create({
        data: { userId, token, expiresAt: new Date(now.getTime() + DAY) },
      });
      return { Cookie: `session=${token}`, 'Content-Type': 'application/json' };
    };
    const COOKIE = await mkSession(hostUser.id);
    const COOKIE_OTHER = await mkSession(otherUser.id);
    const COOKIE_COORD = await mkSession(coordUser.id);

    const kate = await prisma.person.create({
      data: { name: `${TAG} Kate`, email: `${TAG}-kate@example.com`, userId: hostUser.id },
    });
    createdPersonIds.push(kate.id);
    const ev = await prisma.event.create({
      data: {
        name: `${TAG} share`,
        startDate: new Date(now.getTime() + 30 * DAY),
        endDate: new Date(now.getTime() + 30 * DAY + 6 * 60 * 60 * 1000),
        hostId: kate.id,
        status: 'DRAFT',
      },
    });
    createdEventIds.push(ev.id);
    await prisma.eventRole.create({ data: { userId: hostUser.id, eventId: ev.id, role: 'HOST' } });
    await prisma.eventRole.create({
      data: { userId: coordUser.id, eventId: ev.id, role: 'COORDINATOR' },
    });
    await prisma.eventSetup.create({ data: { eventId: ev.id, eventType: 'BBQ' } });
    const mains = await prisma.team.create({
      data: { eventId: ev.id, name: 'Mains', source: 'GENERATED' },
    });
    const desserts = await prisma.team.create({
      data: { eventId: ev.id, name: 'Desserts', source: 'GENERATED' },
    });
    const setUp = await prisma.team.create({
      data: { eventId: ev.id, name: 'Set up', source: 'GENERATED' },
    });
    const drinks = await prisma.team.create({
      data: { eventId: ev.id, name: 'Drinks', source: 'GENERATED' },
    });
    const hh = await prisma.household.create({ data: { eventId: ev.id } });

    const person = async (
      name: string,
      teamId: string | null = null,
      role: 'PARTICIPANT' | 'COORDINATOR' = 'PARTICIPANT'
    ) => {
      const p = await prisma.person.create({
        data: { name: `${TAG} ${name}`, email: `${TAG}-${name.toLowerCase()}@example.com` },
      });
      createdPersonIds.push(p.id);
      await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId: ev.id,
          role,
          householdId: hh.id,
          householdRole: 'GUEST',
          teamId,
        },
      });
      return p;
    };
    await prisma.personEvent.create({
      data: {
        personId: kate.id,
        eventId: ev.id,
        role: 'HOST',
        householdId: hh.id,
        householdRole: 'PRIMARY_CONTACT',
      },
    });
    const mum = await person('Mum');
    const joanna = await person('Joanna');
    const sam = await person('Sam');
    const lee = await person('Lee');
    const ross = await person('Ross');
    const cara = await person('Cara', desserts.id);
    const outsider = await prisma.person.create({
      data: { name: `${TAG} Outsider`, email: `${TAG}-out@example.com` },
    });
    createdPersonIds.push(outsider.id);

    let order = 0;
    const dish = async (
      name: string,
      over: Record<string, unknown> = {},
      holder?: { id: string; response?: string }
    ) => {
      order++;
      const it = await prisma.item.create({
        data: {
          teamId: mains.id,
          name,
          kind: 'ITEM',
          source: 'GENERATED',
          displayOrder: order,
          quantityState: 'SPECIFIED',
          ...over,
        } as any,
      });
      if (holder) {
        await prisma.assignment.create({
          data: {
            itemId: it.id,
            personId: holder.id,
            response: (holder.response as any) ?? 'PENDING',
          },
        });
        await prisma.item.update({ where: { id: it.id }, data: { status: 'ASSIGNED' } });
      }
      return it;
    };
    const SERVES = { quantityUnit: 'CUSTOM', quantityUnitCustom: 'servings' };
    const salad = await dish(
      'Green salad',
      {
        ...SERVES,
        quantityAmount: 20,
        quantityText: 'serves 20',
        quantityLabel: 'CALCULATED',
        quantitySource: 'SYSTEM_HEURISTICS',
        quantityDerivedFromTemplate: true,
        critical: true,
        criticalSource: 'HOST',
        criticalReason: 'the main side',
        dietaryTags: ['vegetarian'],
        vegetarian: true,
        description: 'fresh and crisp',
        notes: 'no nuts please',
        dropOffLocation: 'Back door',
        dropOffNote: '11am',
        serveTime: '12:30',
        durationMinutes: 15,
        decideByOffsetHours: 48,
        equipmentNeeds: ['fridge'],
      },
      mum
    );
    const pavlova = await dish(
      'Pavlova',
      { quantityUnit: 'CUSTOM', quantityUnitCustom: 'pavlovas', quantityAmount: 3 },
      { id: mum.id, response: 'ACCEPTED' }
    );
    const fruit = await dish('Fruit platter', { quantityUnit: 'KG', quantityAmount: 2.5 }, ross);
    const tray = await dish('Lasagne', { quantityUnit: 'TRAYS', quantityAmount: 1 }, ross);
    const bread = await dish(
      'Bread',
      { quantityAmount: null, quantityText: 'a big basket', quantity: 'a basket' },
      mum
    );
    const wine = await dish(
      'Wine',
      {
        quantityAmount: 6,
        quantityUnit: 'CUSTOM',
        quantityUnitCustom: 'bottles',
        quantityState: 'PLACEHOLDER',
        quantityLabel: 'PLACEHOLDER',
        placeholderAcknowledged: false,
        critical: true,
        criticalSource: 'AI',
      },
      ross
    );
    const deferred = await dish(
      'Cheese board',
      { ...SERVES, quantityAmount: 4, quantityDeferredTo: 'COORDINATOR' },
      mum
    );
    const soup = await dish(
      'Soup',
      {
        quantityUnit: 'CUSTOM',
        quantityUnitCustom: 'litres',
        quantityAmount: 10,
        quantity: '10 litres',
      },
      mum
    );
    const rolls = await dish(
      'Rolls',
      { quantityAmount: null, quantityText: 'two dozen', quantity: '2 dozen' },
      ross
    );
    const napkins = await dish('Napkins');
    const staleDish = await dish('Dip', { ...SERVES, quantityAmount: 8 }, mum);
    const hostDish = await dish('Punch', { quantityUnit: 'L', quantityAmount: 6 }, ross);
    const lastRow = await dish('Chips', { ...SERVES, quantityAmount: 30 });
    const crew = await prisma.item.create({
      data: {
        teamId: setUp.id,
        name: 'Setup crew',
        kind: 'TASK',
        source: 'GENERATED',
        displayOrder: 1,
        quantityState: 'NA',
      },
    });
    await prisma.assignment.create({ data: { itemId: crew.id, personId: mum.id } });
    const cake = await prisma.item.create({
      data: {
        teamId: desserts.id,
        name: 'Cake',
        kind: 'ITEM',
        source: 'GENERATED',
        displayOrder: 1,
        quantityState: 'SPECIFIED',
        quantityUnit: 'COUNT',
        quantityAmount: 4,
      },
    });
    await prisma.assignment.create({ data: { itemId: cake.id, personId: cara.id } });
    // The drinks section has missing and tied order numbers: A(none) B(none) C(2) D(2) E(none).
    const dr = async (name: string, displayOrder: number | null, holder: string) => {
      const it = await prisma.item.create({
        data: {
          teamId: drinks.id,
          name,
          kind: 'ITEM',
          source: 'GENERATED',
          displayOrder,
          quantityState: 'SPECIFIED',
          quantityUnit: 'CUSTOM',
          quantityUnitCustom: 'bottles',
          quantityAmount: 6,
        } as any,
      });
      await prisma.assignment.create({ data: { itemId: it.id, personId: holder } });
      await new Promise((r) => setTimeout(r, 15));
      return it;
    };
    const drA = await dr('Drink A', null, mum.id);
    const drB = await dr('Drink B', null, mum.id);
    const drC = await dr('Drink C', 2, mum.id);
    const drD = await dr('Drink D', 2, mum.id);
    const drE = await dr('Drink E', null, mum.id);

    installProviderTrap();
    const trapBefore = trapCount();

    // ── helpers over the server work ──
    const actor = { id: kate.id, kind: 'HOST', name: `${TAG} Kate` };
    const rowsOf = async (teamId: string) => {
      const items = await prisma.item.findMany({
        where: { teamId },
        include: { assignment: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      return items;
    };
    const countItems = () => prisma.item.count({ where: { team: { eventId: ev.id } } });
    const countAssignments = () =>
      prisma.assignment.count({ where: { item: { team: { eventId: ev.id } } } });
    const preview = async (itemId: string, eventId = ev.id): Promise<any> =>
      S.readShare(prisma, { eventId, itemId });
    const proposal = (pv: any) => {
      const n = pv.rows.length + 1;
      const parts: number[] | null = pv.divided ? SP.splitTotal(pv.total, n) : null;
      return parts
        ? [
            ...pv.rows.map((r: any, i: number) => ({
              itemId: r.itemId,
              before: r.amount,
              amount: parts[i],
            })),
            { itemId: null, before: null, amount: parts[n - 1] },
          ]
        : undefined;
    };
    type Out = { ok: true; res: any } | { ok: false; status?: number; code?: string; msg: string };
    async function share(
      itemId: string,
      personId: string,
      opts: {
        amounts?: any;
        role?: string;
        reason?: string | null;
        db?: any;
        eventId?: string;
        auto?: boolean;
      } = {}
    ): Promise<Out> {
      try {
        let amounts = opts.amounts;
        if (opts.auto !== false && amounts === undefined)
          amounts = proposal(await preview(itemId, opts.eventId ?? ev.id));
        const res = await S.shareDish(opts.db ?? prisma, {
          eventId: opts.eventId ?? ev.id,
          itemId,
          personId,
          actor,
          actorRole: opts.role ?? 'HOST',
          reason: opts.reason ?? null,
          amounts,
        });
        return { ok: true, res };
      } catch (e: any) {
        return { ok: false, status: e?.status, code: e?.code, msg: String(e?.message ?? e) };
      }
    }
    const item = (id: string) =>
      prisma.item.findUniqueOrThrow({ where: { id }, include: { assignment: true } });
    const amountOf = async (id: string) =>
      (await item(id).catch(() => null))?.quantityAmount ?? null;

    // ══ LAYER C — the server work, in process ════════════════════════════════════════
    section('Layer C — a first share: Green salad, serves 20, Mum, shared with Joanna');
    const pv1 = await preview(salad.id).catch(() => null);
    assert(
      "C1 the preview names the dish's rows (Mum, 20), says it divides, the total, and the unit word",
      ok(
        () =>
          pv1.divided === true &&
          pv1.total === 20 &&
          pv1.unitWord === 'servings' &&
          pv1.rows.length === 1 &&
          pv1.rows[0].itemId === salad.id &&
          pv1.rows[0].personId === mum.id &&
          pv1.rows[0].amount === 20
      )
    );
    const beforeCount = await countItems();
    const s1 = await share(salad.id, joanna.id, { reason: null });
    assert('C2 the share is saved', s1.ok === true, s1.ok ? '' : s1.msg);
    const copy1Id: string | null = s1.ok ? s1.res.copyItemId : null;
    const orig1 = await item(salad.id);
    const copy1: any = copy1Id ? await item(copy1Id) : null;
    assert(
      "C3 one new row, and it is Joanna's",
      copy1 !== null &&
        (await countItems()) === beforeCount + 1 &&
        copy1.assignment?.personId === joanna.id
    );
    assert(
      'C4 the amount is divided: 10 and 10, the unit word kept',
      orig1.quantityAmount === 10 &&
        copy1?.quantityAmount === 10 &&
        copy1?.quantityUnitCustom === 'servings' &&
        copy1?.quantityUnit === 'CUSTOM'
    );
    assert(
      "C5 the copy's assignment is PENDING and its status ASSIGNED",
      copy1?.assignment?.response === 'PENDING' && copy1?.status === 'ASSIGNED'
    );
    assert(
      'C6 the copy carries name, section, kind, critical with its source and reason, tags and flags, notes, description, drop-off, times, equipment and the per-dish decide-by value',
      ok(
        () =>
          copy1.name === orig1.name &&
          copy1.teamId === orig1.teamId &&
          copy1.kind === 'ITEM' &&
          copy1.critical === true &&
          copy1.criticalSource === 'HOST' &&
          copy1.criticalReason === 'the main side' &&
          JSON.stringify(copy1.dietaryTags) === JSON.stringify(['vegetarian']) &&
          copy1.vegetarian === true &&
          copy1.notes === 'no nuts please' &&
          copy1.description === 'fresh and crisp' &&
          copy1.dropOffLocation === 'Back door' &&
          copy1.dropOffNote === '11am' &&
          copy1.serveTime === '12:30' &&
          copy1.durationMinutes === 15 &&
          copy1.decideByOffsetHours === 48 &&
          JSON.stringify(copy1.equipmentNeeds) === JSON.stringify(['fridge'])
      )
    );
    assert(
      "C7 the three quantity fields: the copy holds the original's values, and the original's are untouched",
      ok(
        () =>
          copy1.quantityState === 'SPECIFIED' &&
          copy1.quantityLabel === 'CALCULATED' &&
          copy1.quantitySource === 'SYSTEM_HEURISTICS' &&
          orig1.quantityState === 'SPECIFIED' &&
          orig1.quantityLabel === 'CALCULATED' &&
          orig1.quantitySource === 'SYSTEM_HEURISTICS' &&
          copy1.quantityText === 'serves 20' &&
          orig1.quantityText === 'serves 20'
      )
    );
    assert(
      "C8 the copy's source is MANUAL, it is not AI-made and has no batch; the original, once its amount changed, is HOST_EDITED",
      ok(
        () =>
          copy1.source === 'MANUAL' &&
          copy1.aiGenerated === false &&
          copy1.generatedBatchId === null &&
          copy1.previouslyAssignedTo === null &&
          orig1.source === 'HOST_EDITED'
      )
    );
    const mainsRows1 = await rowsOf(mains.id);
    const names1 = mainsRows1.map((r) => r.name);
    assert(
      'C9 the copy sits directly under the original, and the rows after it moved down one place',
      ok(() => {
        const i = mainsRows1.findIndex((r) => r.id === salad.id);
        const orders = mainsRows1.map((r) => r.displayOrder as number);
        return (
          mainsRows1[i + 1].id === copy1Id &&
          names1[i + 2] === 'Pavlova' &&
          orders.every((o, k) => k === 0 || o > orders[k - 1]) &&
          orders[orders.length - 1] === mainsRows1.length
        );
      })
    );
    assert(
      'C10 the same total is kept: 10 + 10 = 20',
      (orig1.quantityAmount ?? 0) + (copy1?.quantityAmount ?? 0) === 20
    );

    section('Layer C — the ledger for that share (the invitations not yet sent)');
    const cs1 = s1.ok ? s1.res.changeSetId : '';
    const led1 = await prisma.auditEntry.findMany({
      where: { eventId: ev.id, changeSetId: cs1 },
      orderBy: { sequence: 'asc' },
    });
    const ledOf = (action: string, field?: string) =>
      led1.find((e) => e.actionType === action && (field === undefined || e.field === field));
    assert(
      'C11 one change set holds CREATE_ITEM, CREATE_ASSIGNMENT and EDIT_ITEM for the amount',
      led1.length === 3 &&
        !!ledOf('CREATE_ITEM') &&
        !!ledOf('CREATE_ASSIGNMENT') &&
        !!ledOf('EDIT_ITEM', 'quantityAmount')
    );
    const ci: any = ledOf('CREATE_ITEM');
    assert(
      "C12 the copy's entry names its source row and the dish's first row (the link), and its amount",
      ok(
        () =>
          ci.targetId === copy1Id &&
          ci.after.sharedFromItemId === salad.id &&
          ci.after.shareRootItemId === salad.id &&
          ci.after.quantityAmount === 10
      )
    );
    const ei: any = ledOf('EDIT_ITEM', 'quantityAmount');
    assert(
      'C13 the original amount is recoverable: the entry holds 20 before and 10 after',
      ok(() => ei.targetId === salad.id && ei.before === 20 && ei.after === 10)
    );
    const ca: any = ledOf('CREATE_ASSIGNMENT');
    assert(
      'C14 the assignment entry names Joanna',
      ok(() => ca.after.personId === joanna.id && ca.before === null)
    );
    assert(
      'C15 before the send nothing asks a why',
      led1.every((e) => e.reasonRequired === false)
    );
    assert(
      'C16 the row shifts are not in the ledger',
      (await prisma.auditEntry.count({ where: { eventId: ev.id, field: 'displayOrder' } })) === 0
    );

    section("Layer C — a third person: Joanna's row shared with Sam, re-divided from the total");
    const pv2 = await preview(copy1Id as string).catch(() => null);
    assert(
      "C17 from the copy's own row the dish is still three-ready: rows Mum then Joanna, total 20",
      ok(
        () =>
          pv2.rows.length === 2 &&
          pv2.rows[0].personId === mum.id &&
          pv2.rows[1].personId === joanna.id &&
          pv2.total === 20
      )
    );
    const s2 = await share(copy1Id as string, sam.id);
    const copy2Id: string | null = s2.ok ? s2.res.copyItemId : null;
    assert('C18 saved', s2.ok === true, s2.ok ? '' : s2.msg);
    assert(
      'C19 all three re-divided from the total: Mum 7, Joanna 7, Sam 6',
      (await amountOf(salad.id)) === 7 &&
        (await amountOf(copy1Id as string)) === 7 &&
        (copy2Id ? (await amountOf(copy2Id)) === 6 : false)
    );
    const rows2 = await rowsOf(mains.id);
    const ids2 = rows2.map((r) => r.id);
    assert(
      "C20 Sam's row sits directly under the row that was pressed (Joanna's)",
      ids2.indexOf(copy2Id as string) === ids2.indexOf(copy1Id as string) + 1
    );
    const ci2: any = await prisma.auditEntry.findFirst({
      where: { eventId: ev.id, actionType: 'CREATE_ITEM', targetId: copy2Id ?? 'none' },
    });
    assert(
      'C21 the link of a copy of a copy points at its source and still at the first row',
      ok(() => ci2.after.sharedFromItemId === copy1Id && ci2.after.shareRootItemId === salad.id)
    );

    section("Layer C — the dish's rows through a rename, a deleted row and an unassigned row");
    await prisma.item
      .update({ where: { id: copy1Id as string }, data: { name: "Salad (Joanna's)" } })
      .catch(() => {});
    const pv3 = await preview(salad.id).catch(() => null);
    assert(
      'C22 a renamed row still belongs to the dish (three rows, total 20)',
      ok(() => pv3.rows.length === 3 && pv3.total === 20)
    );
    const s3 = await share(salad.id, lee.id);
    const copy3Id: string | null = s3.ok ? s3.res.copyItemId : null;
    assert(
      'C23 a fourth person: all four re-divided from the total (5, 5, 5, 5)',
      s3.ok === true &&
        (await amountOf(salad.id)) === 5 &&
        (await amountOf(copy1Id as string)) === 5 &&
        (await amountOf(copy2Id as string)) === 5 &&
        (copy3Id ? (await amountOf(copy3Id)) === 5 : false)
    );
    await prisma.item.delete({ where: { id: copy2Id as string } }).catch(() => {});
    const pv4 = await preview(salad.id).catch(() => null);
    assert(
      'C24 a deleted row drops out of the dish (three rows, total 15)',
      ok(() => pv4.rows.length === 3 && pv4.total === 15)
    );
    await prisma.assignment.delete({ where: { itemId: copy3Id as string } }).catch(() => {});
    const leeRowBefore: any = await item(copy3Id as string).catch(() => ({
      quantityAmount: -1,
      name: '?',
    }));
    const pv5 = await preview(salad.id).catch(() => null);
    assert(
      'C25 a row nobody holds is left out of the split (Mum and Joanna, total 10)',
      ok(() => pv5.rows.length === 2 && pv5.total === 10)
    );
    const s5 = await share(salad.id, ross.id);
    const copy5Id: string | null = s5.ok ? s5.res.copyItemId : null;
    assert(
      'C26 a share then divides 10 three ways, the leftover to the first: Mum 4, Joanna 3, Ross 3',
      s5.ok === true &&
        (await amountOf(salad.id)) === 4 &&
        (await amountOf(copy1Id as string)) === 3 &&
        (copy5Id ? (await amountOf(copy5Id)) === 3 : false)
    );
    const leeRowAfter: any = await item(copy3Id as string).catch(() => ({
      quantityAmount: -2,
      name: '??',
      assignment: undefined,
    }));
    assert(
      'C27 and the unassigned row is left alone (same amount and name, still nobody)',
      leeRowAfter.quantityAmount === leeRowBefore.quantityAmount &&
        leeRowAfter.assignment === null &&
        leeRowAfter.name === leeRowBefore.name
    );

    section('Layer C — rounding through the real save');
    const sp = await share(pavlova.id, joanna.id);
    assert(
      'C28 3 pavlovas between 2 people save as 2 and 1',
      sp.ok === true &&
        (await amountOf(pavlova.id)) === 2 &&
        (sp.ok ? (await amountOf(sp.res.copyItemId)) === 1 : false)
    );
    const f1 = await share(fruit.id, mum.id);
    const f1Copy: string | null = f1.ok ? f1.res.copyItemId : null;
    const f2 = await share(f1Copy as string, sam.id);
    assert(
      'C29 2.5 kg: two people get 1.25 each, then three get 0.84, 0.83 and 0.83',
      f1.ok === true &&
        f2.ok === true &&
        (await amountOf(fruit.id)) === 0.84 &&
        (await amountOf(f1Copy as string)) === 0.83 &&
        (f2.ok ? (await amountOf(f2.res.copyItemId)) === 0.83 : false)
    );
    const t1 = await share(tray.id, joanna.id);
    assert(
      'C30 1 tray between 2 people saves as 0.5 and 0.5',
      t1.ok === true &&
        (await amountOf(tray.id)) === 0.5 &&
        (t1.ok ? (await amountOf(t1.res.copyItemId)) === 0.5 : false)
    );
    const so = await share(soup.id, joanna.id, {
      amounts: [
        { itemId: soup.id, before: 10, amount: 6 },
        { itemId: null, before: null, amount: 3 },
      ],
    });
    assert(
      "C31 the host's own numbers are saved as typed, even when they do not add up (6 and 3 of 10)",
      so.ok === true &&
        (await amountOf(soup.id)) === 6 &&
        (so.ok ? (await amountOf(so.res.copyItemId)) === 3 : false)
    );

    section('Layer C — what cannot be divided is copied as it is');
    const nd = async (it: any, who: any) => {
      const r = await share(it.id, who.id);
      const o: any = await item(it.id);
      const c: any = r.ok ? await item(r.res.copyItemId) : null;
      return { r, o, c };
    };
    const b = await nd(bread, joanna);
    assert(
      'C32 words only: both rows keep the words and have no number, nothing divided',
      ok(
        () =>
          b.r.ok &&
          b.r.res.divided === false &&
          b.o.quantityAmount === null &&
          b.c.quantityAmount === null &&
          b.o.quantityText === 'a big basket' &&
          b.c.quantityText === 'a big basket'
      )
    );
    assert(
      'C33 and the older text stays on both rows when nothing is divided',
      ok(() => b.o.quantity === 'a basket' && b.c.quantity === 'a basket')
    );
    const w = await nd(wine, joanna);
    assert(
      'C34 a placeholder: both rows keep the same number, state, label, acknowledgement and critical mark',
      ok(
        () =>
          w.r.ok &&
          w.r.res.divided === false &&
          w.o.quantityAmount === 6 &&
          w.c.quantityAmount === 6 &&
          w.c.quantityState === 'PLACEHOLDER' &&
          w.c.quantityLabel === 'PLACEHOLDER' &&
          w.c.placeholderAcknowledged === false &&
          w.c.critical === true &&
          w.c.criticalSource === 'AI'
      )
    );
    const d = await nd(deferred, joanna);
    assert(
      'C35 a deferred amount: both rows keep the number and the deferral',
      ok(
        () =>
          d.r.ok &&
          d.r.res.divided === false &&
          d.o.quantityAmount === 4 &&
          d.c.quantityAmount === 4 &&
          d.c.quantityDeferredTo === 'COORDINATOR'
      )
    );
    const jr = await nd(crew, joanna);
    assert(
      'C36 a job copies with no amount, placed under the original in its own section',
      ok(
        () =>
          jr.r.ok &&
          jr.r.res.divided === false &&
          jr.c.kind === 'TASK' &&
          jr.c.quantityState === 'NA' &&
          jr.c.teamId === setUp.id &&
          jr.c.assignment.personId === joanna.id
      )
    );
    const rl = await nd(rolls, mum);
    assert(
      'C37 the older text of a never-divided row stays on both rows',
      ok(() => rl.o.quantity === '2 dozen' && rl.c.quantity === '2 dozen')
    );
    assert(
      'C38 the Move-on rule sees the copy as it sees the original: a critical unacknowledged placeholder on both',
      ok(
        () =>
          w.o.quantityState === 'PLACEHOLDER' &&
          w.c.quantityState === 'PLACEHOLDER' &&
          w.o.critical &&
          w.c.critical &&
          !w.o.placeholderAcknowledged &&
          !w.c.placeholderAcknowledged
      )
    );

    section('Layer C — the older quantity text, when an amount is divided (D5)');
    const soupRows = await prisma.item.findMany({ where: { teamId: mains.id, name: 'Soup' } });
    assert(
      "C39 a divided row's older text is cleared on BOTH rows (the copy never inherits the total)",
      soupRows.length === 2 && soupRows.every((r) => r.quantity === null)
    );
    const soupLed = await prisma.auditEntry.findMany({
      where: { eventId: ev.id, actionType: 'EDIT_ITEM', field: 'quantity', targetId: soup.id },
    });
    assert(
      'C40 clearing it is ledgered, with the old text',
      soupLed.length === 1 &&
        (soupLed[0].before as any) === '10 litres' &&
        soupLed[0].after === null
    );
    const noText = await prisma.auditEntry.count({
      where: { eventId: ev.id, actionType: 'EDIT_ITEM', field: 'quantity', targetId: salad.id },
    });
    assert('C41 and a row that held no older text gets no such entry', noText === 0);

    section('Layer C — placement among missing and tied order numbers');
    const sd = await share(drD.id, joanna.id);
    const drRows = await rowsOf(drinks.id);
    const drNames = drRows.map((r) => r.name);
    assert(
      'C42 the copy sits directly under the row pressed, in the order she already sees',
      sd.ok === true &&
        JSON.stringify(drNames.slice(0, 3)) === JSON.stringify(['Drink C', 'Drink D', 'Drink D']) &&
        drNames.slice(3).join() === 'Drink A,Drink B,Drink E',
      drNames.join()
    );
    const drOrders = drRows.map((r) => r.displayOrder);
    assert(
      'C43 and every row in the section now has its own order number',
      drOrders.every((o) => typeof o === 'number') && new Set(drOrders).size === drOrders.length
    );
    void drA;
    void drB;
    void drC;
    void drE;

    section('Layer C — refusals write nothing');
    const snap = async () =>
      `${await countItems()}|${await countAssignments()}|${JSON.stringify((await rowsOf(mains.id)).map((r) => [r.id, r.displayOrder, r.quantityAmount]))}|${await prisma.auditEntry.count({ where: { eventId: ev.id } })}`;
    const before0 = await snap();
    const r1 = await share(pavlova.id, mum.id, { auto: false });
    assert(
      'C44 a person who already has the dish (its holder) is refused with 409',
      r1.ok === false && r1.status === 409 && r1.code === 'ALREADY_HAS'
    );
    const r2 = await share(pavlova.id, joanna.id, { auto: false });
    assert(
      'C45 a person who holds another row of the dish is refused with 409',
      r2.ok === false && r2.status === 409 && r2.code === 'ALREADY_HAS'
    );
    const r3 = await share(napkins.id, joanna.id, { auto: false });
    assert(
      'C46 a dish nobody holds is refused with 400',
      r3.ok === false && r3.status === 400 && r3.code === 'NO_HOLDER'
    );
    const r4 = await share(staleDish.id, outsider.id, { auto: false });
    assert(
      'C47 a person who is not in the event is refused with 404',
      r4.ok === false && r4.status === 404
    );
    const r5 = await share(staleDish.id, joanna.id, {
      amounts: [
        { itemId: staleDish.id, before: 9, amount: 4 },
        { itemId: null, before: null, amount: 4 },
      ],
    });
    assert(
      'C48 a view that is no longer the stored one (amount seen 9, stored 8) is refused with 409',
      r5.ok === false && r5.status === 409 && r5.code === 'STALE'
    );
    const bad = async (amounts: any) => share(staleDish.id, joanna.id, { amounts });
    const badOnes = [
      [
        { itemId: staleDish.id, before: 8, amount: 0 },
        { itemId: null, before: null, amount: 4 },
      ],
      [
        { itemId: staleDish.id, before: 8, amount: -2 },
        { itemId: null, before: null, amount: 4 },
      ],
      [
        { itemId: staleDish.id, before: 8, amount: 1.234 },
        { itemId: null, before: null, amount: 4 },
      ],
      [
        { itemId: staleDish.id, before: 8, amount: 'x' },
        { itemId: null, before: null, amount: 4 },
      ],
      [{ itemId: staleDish.id, before: 8, amount: 4 }],
      [{ itemId: null, before: null, amount: 4 }],
      [
        { itemId: staleDish.id, before: 8, amount: 4 },
        { itemId: null, before: null, amount: 4 },
        { itemId: null, before: null, amount: 4 },
      ],
      [
        { itemId: lastRow.id, before: 30, amount: 4 },
        { itemId: null, before: null, amount: 4 },
      ],
    ];
    const badResults = [];
    for (const a of badOnes) badResults.push(await bad(a));
    const wantStatus = [400, 400, 400, 400, 400, 409, 400, 409];
    assert(
      "C49 bad numbers and a missing or extra new-row line are refused with 400; lines that are not the dish's own rows with 409",
      badResults.every((x, i) => x.ok === false && x.status === wantStatus[i]),
      JSON.stringify(badResults.map((x) => (x.ok ? 'ok' : x.status)))
    );
    const noAmounts = await share(staleDish.id, joanna.id, { auto: false });
    assert(
      'C50 a divided dish with no amounts sent is refused with 400',
      noAmounts.ok === false && noAmounts.status === 400
    );
    assert(
      'C51 after every refusal nothing was written: rows, assignments, order numbers, amounts and the ledger are as found',
      (await snap()) === before0
    );

    section('Layer C — the guard: the same rule as the assign route');
    const g1 = await share(staleDish.id, cara.id, { auto: true });
    assert(
      "C52 a guest on another team is refused for this dish, with the assign route's own sentence",
      g1.ok === false &&
        g1.status === 400 &&
        g1.msg === 'Person must be in the same team as the item'
    );
    const g2 = await share(staleDish.id, joanna.id, { role: 'COORDINATOR' });
    assert(
      'C53 a coordinator may not place a guest on no team (the third exception is for host authority)',
      g2.ok === false && g2.status === 400 && g2.code === 'SAME_TEAM'
    );
    const g3 = await share(hostDish.id, kate.id);
    assert('C54 the host may hold a share herself (the host picking for herself)', g3.ok === true);
    const g4 = await share(crew.id, sam.id, { role: 'COORDINATOR' });
    assert('C55 a job has no team fence: a coordinator may place anyone on it', g4.ok === true);
    const g5 = await share(cake.id, joanna.id);
    assert(
      'C56 a guest on no team may hold a Desserts dish when the host places them',
      g5.ok === true && (await amountOf(cake.id)) === 2
    );
    const otherEv = await prisma.event.create({
      data: {
        name: `${TAG} other`,
        startDate: new Date(now.getTime() + 30 * DAY),
        endDate: new Date(now.getTime() + 30 * DAY + 3600000),
        hostId: kate.id,
        status: 'DRAFT',
      },
    });
    createdEventIds.push(otherEv.id);
    const otherTeam = await prisma.team.create({
      data: { eventId: otherEv.id, name: 'Mains', source: 'GENERATED' },
    });
    const otherItem = await prisma.item.create({
      data: {
        teamId: otherTeam.id,
        name: 'Elsewhere',
        kind: 'ITEM',
        source: 'GENERATED',
        quantityState: 'SPECIFIED',
        quantityAmount: 4,
        quantityUnit: 'COUNT',
        displayOrder: 1,
      } as any,
    });
    await prisma.assignment.create({ data: { itemId: otherItem.id, personId: kate.id } });
    const g6 = await share(otherItem.id, joanna.id, { auto: false });
    assert('C57 a dish of another event is refused with 400', g6.ok === false && g6.status === 400);

    section('Layer C — after the invitations have gone');
    await prisma.event.update({
      where: { id: ev.id },
      data: { sentAt: new Date(), status: 'CONFIRMING' },
    });
    const postAccepted = await share(staleDish.id, joanna.id, { reason: 'Mum and Joanna agreed' });
    // The staleDish holder (Mum) is PENDING here; use the pavlova-like answered case below.
    assert('C58 a share after the send saves', postAccepted.ok === true);
    const cs = postAccepted.ok ? postAccepted.res.changeSetId : '';
    const ledPost = await prisma.auditEntry.findMany({
      where: { eventId: ev.id, changeSetId: cs },
    });
    const t1Entry = ledPost.find((e) => e.actionType === 'CREATE_ASSIGNMENT');
    const t4Pending = ledPost.find(
      (e) => e.actionType === 'EDIT_ITEM' && e.field === 'quantityAmount'
    );
    assert(
      'C59 the new assignment is owed a why (T1), and the reason she gave is recorded on the set',
      !!t1Entry &&
        t1Entry.reasonRequired === true &&
        ledPost.every((e) => e.reason === 'Mum and Joanna agreed')
    );
    assert(
      'C60 an amount cut on a holder who has not answered is not owed a why (the typo rule)',
      !!t4Pending && t4Pending.reasonRequired === false
    );
    await prisma.assignment.update({
      where: { itemId: hostDish.id },
      data: { response: 'ACCEPTED' },
    });
    const hostDishCopy = await prisma.item.findFirst({
      where: { teamId: mains.id, name: 'Punch', NOT: { id: hostDish.id } },
    });
    const accepted = await share(hostDish.id, mum.id, { reason: null });
    const ledAcc = accepted.ok
      ? await prisma.auditEntry.findMany({
          where: { eventId: ev.id, changeSetId: accepted.res.changeSetId },
        })
      : [];
    const t4Accepted = ledAcc.find(
      (e) =>
        e.actionType === 'EDIT_ITEM' && e.field === 'quantityAmount' && e.targetId === hostDish.id
    );
    assert(
      'C61 an amount cut on a holder who has said yes IS owed a why (T4), and a missing reason never blocks the save',
      accepted.ok === true &&
        !!t4Accepted &&
        t4Accepted.reasonRequired === true &&
        t4Accepted.reason === null
    );
    assert(
      "C62 the answered holder's row keeps their answer (still a yes)",
      (await item(hostDish.id)).assignment?.response === 'ACCEPTED'
    );
    void hostDishCopy;

    section('Layer C — one transaction: all of it or none of it');
    const wrapDb = (failOn: 'auditEntry' | 'afterCopy') => ({
      $transaction: (fn: any, opts?: any) =>
        prisma.$transaction((tx: any) => {
          const wrapped: any = new Proxy(tx, {
            get(target, prop) {
              if (prop === 'auditEntry' && failOn === 'auditEntry') {
                return new Proxy(target.auditEntry, {
                  get(t2, p2) {
                    if (p2 === 'create')
                      return () => Promise.reject(new Error('forced ledger failure'));
                    const v = (t2 as any)[p2];
                    return typeof v === 'function' ? v.bind(t2) : v;
                  },
                });
              }
              const v = (target as any)[prop];
              return typeof v === 'function' ? v.bind(target) : v;
            },
          });
          return fn(wrapped);
        }, opts),
    });
    const snapBefore = await snap();
    const pickles = await dish('Pickles', { quantityAmount: null, quantityText: 'a jar' }, mum);
    const snapBeforeWords = await snap();
    const forced = await share(pickles.id, joanna.id, { db: wrapDb('auditEntry'), auto: false });
    assert('C63 a failure while the ledger is written is reported', forced.ok === false);
    assert(
      'C64 and then nothing is kept: no copy, no assignment, no new order numbers, no amounts changed, no ledger entry',
      (await snap()) === snapBeforeWords
    );
    void snapBefore;
    // A real forced failure on a divided dish: the ledger's create fails after the copy and the amounts were written.
    const divDish = await dish('Slaw', { ...SERVES, quantityAmount: 12 }, mum);
    const snapBefore2 = await snap();
    const pvDiv = await preview(divDish.id);
    const forced2 = await share(divDish.id, joanna.id, {
      db: wrapDb('auditEntry'),
      amounts: proposal(pvDiv),
    });
    assert(
      'C65 the same for a divided dish: the amount is still 12 and no copy exists',
      forced2.ok === false &&
        (await amountOf(divDish.id)) === 12 &&
        (await snap()) === snapBefore2 &&
        (await item(divDish.id)).source === 'GENERATED'
    );

    section('Layer C — a regenerate keeps what a share made');
    const disposable = PW?.disposableItemWhere
      ? await prisma.item
          .findMany({
            where: PW.disposableItemWhere({ eventId: ev.id, kind: 'ITEM' }),
            select: { id: true },
          })
          .catch(() => null)
      : null;
    const disposableIds = new Set((disposable ?? []).map((x) => x.id));
    assert(
      'C66 no shared row (the copies, and the originals whose amounts changed) is one a regenerate may throw away',
      disposable !== null &&
        !disposableIds.has(salad.id) &&
        !disposableIds.has(copy1Id as string) &&
        !disposableIds.has(pavlova.id) &&
        !disposableIds.has(soup.id)
    );

    section('Layer C — the counter counts the copy');
    const panelItems = (
      await prisma.item.findMany({
        where: { team: { eventId: ev.id }, kind: { in: ['ITEM', 'TASK'] } },
        include: { assignment: true },
      })
    ).map((i) => ({
      id: i.id,
      assignment: i.assignment ? { person: { id: i.assignment.personId } } : null,
    }));
    const withoutCopy = panelItems.filter((i) => i.id !== copy5Id);
    const lineWith = assignedCounterLine(panelItems);
    const lineWithout = assignedCounterLine(withoutCopy);
    const num = (s: string) =>
      s
        .match(/^(\d+) of (\d+) items assigned\.$/)
        ?.slice(1)
        .map(Number) ?? [];
    assert(
      'C67 a share adds one to "assigned" and one to the total',
      ok(
        () =>
          num(lineWith)[0] === num(lineWithout)[0] + 1 &&
          num(lineWith)[1] === num(lineWithout)[1] + 1
      ),
      `${lineWithout} → ${lineWith}`
    );

    // ══ LAYER D — the route over HTTP ════════════════════════════════════════════════
    section('Layer D — the route, over HTTP on the dev server');
    async function call(
      method: string,
      rel: string,
      body?: unknown,
      headers: Record<string, string> = COOKIE
    ) {
      const res = await realFetch(`${BASE}${rel}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { status: res.status, json };
    }
    const sharePath = (itemId: string, eventId = ev.id) =>
      `/api/events/${eventId}/items/${itemId}/share`;
    const httpDish = await dish('Trifle', { ...SERVES, quantityAmount: 12 }, mum);
    const h0 = await call(
      'POST',
      sharePath(httpDish.id),
      { preview: true },
      { 'Content-Type': 'application/json' }
    ).catch(() => ({ status: 0, json: null }));
    assert('D1 with no sign-in the route answers 401', h0.status === 401, `status ${h0.status}`);
    const h1 = await call('POST', sharePath(httpDish.id), { preview: true }, COOKIE_OTHER);
    assert(
      'D2 a signed-in user with no role on the event is refused with 403',
      h1.status === 403,
      `status ${h1.status}`
    );
    const h2 = await call('POST', sharePath(httpDish.id), { preview: true });
    assert(
      "D3 the host's preview answers 200 with the dish's rows and writes nothing",
      h2.status === 200 &&
        ok(
          () =>
            h2.json.preview.divided === true &&
            h2.json.preview.total === 12 &&
            h2.json.preview.rows.length === 1 &&
            h2.json.preview.unitWord === 'servings'
        ),
      `status ${h2.status} ${JSON.stringify(h2.json)?.slice(0, 120)}`
    );
    const countBeforeHttp = await countItems();
    assert('D4 the preview wrote no row', countBeforeHttp === (await countItems()));
    const h3 = await call('POST', sharePath(httpDish.id), {
      personId: joanna.id,
      rows: [
        { itemId: httpDish.id, before: 12, amount: 6 },
        { itemId: null, before: null, amount: 6 },
      ],
      reason: null,
    });
    assert(
      "D5 the host's save answers 200 and the rows are 6 and 6",
      h3.status === 200 &&
        (await amountOf(httpDish.id)) === 6 &&
        ok(() => h3.json.copyItemId.length > 0 && h3.json.rows.length === 2),
      `status ${h3.status} ${JSON.stringify(h3.json)?.slice(0, 120)}`
    );
    const h4 = await call('POST', sharePath(httpDish.id), {
      personId: joanna.id,
      rows: [
        { itemId: httpDish.id, before: 6, amount: 3 },
        { itemId: null, before: null, amount: 3 },
      ],
    });
    assert(
      'D6 sharing again with the same person answers 409',
      h4.status === 409,
      `status ${h4.status}`
    );
    const h5 = await call('POST', sharePath(httpDish.id), { rows: [] });
    assert('D7 a save with no person answers 400', h5.status === 400, `status ${h5.status}`);
    const h6 = await call('POST', sharePath('no-such-item'), { preview: true });
    assert('D8 a dish that does not exist answers 404', h6.status === 404, `status ${h6.status}`);
    const h7 = await call('POST', sharePath(otherItem.id), { preview: true });
    assert('D9 a dish of another event answers 400', h7.status === 400, `status ${h7.status}`);
    const coordDish = await dish('Gravy', { ...SERVES, quantityAmount: 8 }, mum);
    const h8 = await call(
      'POST',
      sharePath(coordDish.id),
      {
        personId: sam.id,
        rows: [
          { itemId: coordDish.id, before: 8, amount: 4 },
          { itemId: null, before: null, amount: 4 },
        ],
      },
      COOKIE_COORD
    );
    assert(
      "D10 a coordinator may not place a guest on no team over HTTP either (400, the assign route's own sentence)",
      h8.status === 400 && h8.json?.error === 'Person must be in the same team as the item',
      `status ${h8.status}`
    );

    // ══ LAYER E — nothing sends, and the sample demo ═════════════════════════════════
    section('Layer E — nothing sends; the sample demo');
    const demoEv = await prisma.event.create({
      data: {
        name: `${TAG} sample`,
        startDate: new Date(now.getTime() + 30 * DAY),
        endDate: new Date(now.getTime() + 30 * DAY + 3600000),
        hostId: kate.id,
        status: 'DRAFT',
        isDemo: true,
      },
    });
    createdEventIds.push(demoEv.id);
    const demoTeam = await prisma.team.create({
      data: { eventId: demoEv.id, name: 'Mains', source: 'GENERATED' },
    });
    const dp = await prisma.person.create({
      data: { name: `${TAG} Demo guest`, email: `${TAG}-dg@example.com` },
    });
    createdPersonIds.push(dp.id);
    const dq = await prisma.person.create({
      data: { name: `${TAG} Demo guest 2`, email: `${TAG}-dg2@example.com` },
    });
    createdPersonIds.push(dq.id);
    for (const p of [dp, dq])
      await prisma.personEvent.create({
        data: { personId: p.id, eventId: demoEv.id, role: 'PARTICIPANT', householdRole: 'GUEST' },
      });
    const demoItem = await prisma.item.create({
      data: {
        teamId: demoTeam.id,
        name: 'Sample salad',
        kind: 'ITEM',
        source: 'GENERATED',
        quantityState: 'SPECIFIED',
        quantityAmount: 10,
        quantityUnit: 'COUNT',
        displayOrder: 1,
      } as any,
    });
    await prisma.assignment.create({ data: { itemId: demoItem.id, personId: dp.id } });
    const demoShare = await share(demoItem.id, dq.id, { eventId: demoEv.id });
    assert(
      'E1 sharing works in a sample (a real private copy of an event)',
      demoShare.ok === true && (await prisma.item.count({ where: { teamId: demoTeam.id } })) === 2
    );
    await prisma.team.deleteMany({ where: { eventId: demoEv.id } });
    assert(
      "E2 deleting the sample's sections takes the copies and their assignments with them",
      (await prisma.item.count({ where: { teamId: demoTeam.id } })) === 0
    );
    const outbound = await prisma.outboundMessage.count({
      where: { eventId: { in: createdEventIds } },
    });
    const invites = await prisma.inviteEvent.count({ where: { eventId: { in: createdEventIds } } });
    // E3 is asserted again at the very end, after every request above and below.

    // ══ LAYER G — what a guest reads (D5) ════════════════════════════════════════════
    section('Layer G — D5: the amount a guest reads on their own row');
    const amt = (over: Record<string, unknown>) => {
      try {
        return GA.guestAmountText({
          quantity: null,
          quantityAmount: null,
          quantityUnit: null,
          quantityUnitCustom: null,
          quantityState: 'SPECIFIED',
          placeholderAcknowledged: false,
          ...over,
        });
      } catch {
        return 'THREW';
      }
    };
    assert(
      'G1 a counted thing reads "3 pavlovas"',
      amt({ quantityAmount: 3, quantityUnit: 'CUSTOM', quantityUnitCustom: 'pavlovas' }) ===
        '3 pavlovas'
    );
    assert(
      'G2 a weight reads "2.5 kg"',
      amt({ quantityAmount: 2.5, quantityUnit: 'KG' }) === '2.5 kg'
    );
    assert(
      'G3 a serves amount reads "10 servings"',
      amt({ quantityAmount: 10, quantityUnit: 'CUSTOM', quantityUnitCustom: 'servings' }) ===
        '10 servings'
    );
    assert(
      'G4 a plan unit reads its plain word ("2 trays", "4 litres", "6 pieces")',
      amt({ quantityAmount: 2, quantityUnit: 'TRAYS' }) === '2 trays' &&
        amt({ quantityAmount: 4, quantityUnit: 'L' }) === '4 litres' &&
        amt({ quantityAmount: 6, quantityUnit: 'COUNT' }) === '6 pieces'
    );
    assert(
      'G5 a number with no unit word reads as the bare number',
      amt({ quantityAmount: 7, quantityUnit: 'CUSTOM', quantityUnitCustom: null }) === '7'
    );
    assert(
      'G6 a row with no number shows the older text, as today',
      amt({ quantity: '2 dozen' }) === '2 dozen' && amt({}) === null
    );
    assert(
      'G7 when a row has a number the number wins over the older text',
      amt({
        quantity: '20 servings',
        quantityAmount: 10,
        quantityUnit: 'CUSTOM',
        quantityUnitCustom: 'servings',
      }) === '10 servings'
    );
    assert(
      'G8 an unconfirmed guess shows nothing (a placeholder nobody has acknowledged), or the older text if it has one',
      amt({
        quantityAmount: 6,
        quantityUnit: 'CUSTOM',
        quantityUnitCustom: 'bottles',
        quantityState: 'PLACEHOLDER',
      }) === null &&
        amt({ quantityAmount: 6, quantityState: 'PLACEHOLDER', quantity: '6 bottles' }) ===
          '6 bottles'
    );
    assert(
      'G9 a placeholder the host has acknowledged shows its number',
      amt({
        quantityAmount: 6,
        quantityUnit: 'CUSTOM',
        quantityUnitCustom: 'bottles',
        quantityState: 'PLACEHOLDER',
        placeholderAcknowledged: true,
      }) === '6 bottles'
    );
    assert(
      'G10 a not-applicable amount (a job) shows only any older text',
      amt({ quantityState: 'NA', quantityAmount: 3 }) === null
    );

    // The real guest route, as each holder's own page reads it.
    const guestTok = async (p: { id: string }) => {
      const token = randomBytes(24).toString('hex');
      // Opened already, so reading the page writes no link-open record: nothing here writes an InviteEvent.
      await prisma.accessToken.create({
        data: {
          token,
          scope: 'PARTICIPANT',
          eventId: ev.id,
          personId: p.id,
          expiresAt: new Date(now.getTime() + 30 * DAY),
          openedAt: new Date(),
        },
      });
      return token;
    };
    const tokMum = await guestTok(mum);
    const tokJoanna = await guestTok(joanna);
    const tokSam = await guestTok(sam);
    const guestRead = async (
      token: string,
      headers: Record<string, string> = { 'Content-Type': 'application/json' }
    ) => {
      const r = await call('GET', `/api/p/${token}`, undefined, headers);
      const find = (name: string) =>
        (r.json?.assignments ?? []).find((a: any) => a.item?.name === name)?.item ?? null;
      return { r, find };
    };
    const gm = await guestRead(tokMum);
    const gj = await guestRead(tokJoanna);
    assert(
      'G11 the guest route answers 200 for a holder',
      gm.r.status === 200 && gj.r.status === 200,
      `status ${gm.r.status}/${gj.r.status}`
    );
    assert(
      'G12 after the split of Pavlova (3 → 2 and 1) each holder reads their own share and not the total',
      ok(
        () =>
          gm.find('Pavlova').quantity === '2 pavlovas' &&
          gj.find('Pavlova').quantity === '1 pavlovas'
      )
    );
    assert(
      'G13 after the splits of Green salad (Mum 4, Joanna 3) each reads their own share, never 20',
      ok(
        () =>
          gm.find('Green salad').quantity === '4 servings' &&
          gj.find("Salad (Joanna's)").quantity === '3 servings'
      )
    );
    assert(
      'G14 a weight: Mum\'s share of the fruit platter reads "0.83 kg"',
      ok(() => gm.find('Fruit platter').quantity === '0.83 kg')
    );
    const gs = await guestRead(tokSam);
    assert(
      'G15 Sam, third on the fruit, reads "0.83 kg"',
      ok(() => gs.find('Fruit platter').quantity === '0.83 kg')
    );
    assert(
      'G16 a row never divided shows its older text as today ("a basket" kept on both rows of Bread)',
      ok(() => gm.find('Bread').quantity === 'a basket')
    );
    const gjWine = gj.find('Wine');
    assert(
      "G17 an unconfirmed guess shows nothing: Joanna's Wine reads no amount",
      gjWine !== null && gjWine.quantity === null
    );
    assert(
      "G18 the wire item carries the same keys as before (no raw amount, state or unit leaks onto the guest's wire)",
      ok(
        () =>
          JSON.stringify(Object.keys(gm.find('Pavlova')).sort()) ===
          JSON.stringify(
            [
              'critical',
              'day',
              'description',
              'dropOffAt',
              'dropOffLocation',
              'dropOffNote',
              'glutenFree',
              'dairyFree',
              'id',
              'name',
              'notes',
              'quantity',
              'vegetarian',
            ].sort()
          )
      )
    );
    const prev = await guestRead(tokJoanna, COOKIE);
    assert(
      "G19 the host's link preview reads the same amounts the guest does",
      ok(() => prev.r.json.isHostPreview === true && prev.find('Pavlova').quantity === '1 pavlovas')
    );

    // Three real examples, as a guest reads them on a dish that was never divided.
    const exCount = await dish(
      'Pavlovas',
      { quantityUnit: 'CUSTOM', quantityUnitCustom: 'pavlovas', quantityAmount: 6 },
      sam
    );
    const exWeight = await dish('Roast lamb', { quantityUnit: 'KG', quantityAmount: 2.5 }, sam);
    const exServes = await dish('Potato salad', { ...SERVES, quantityAmount: 20 }, sam);
    const gx = await guestRead(tokSam);
    const examples = ['Pavlovas', 'Roast lamb', 'Potato salad'].map(
      (n) => `×${gx.find(n)?.quantity}`
    );
    console.log(`  examples a guest now reads: ${examples.join('  |  ')}`);
    assert(
      'G20 three examples: a counted thing "×6 pavlovas", a weight "×2.5 kg", a serves amount "×20 servings"',
      examples.join('|') === '×6 pavlovas|×2.5 kg|×20 servings'
    );
    void exCount;
    void exWeight;
    void exServes;

    // ══ LAYER P — the guest route's new state ═════════════════════════════════════════
    section(
      'Layer P — the guest route as GTC-472 leaves it (the pin test:demo-replies R2 held until this ticket)'
    );
    const gr = codeOnly(read(GUEST_ROUTE));
    const getPart = gr.slice(0, gr.indexOf('export async function PATCH'));
    const wireFn = gr.slice(gr.indexOf('function wireAssignment'));
    const wireBody = wireFn.slice(wireFn.indexOf('return {'));
    const grRaw = read(GUEST_ROUTE);
    assert(
      'P1 the route imports the guest amount helper',
      /import\s*\{\s*guestAmountText\s*\}\s*from\s*'@\/lib\/guest\/guest-amount'/.test(gr)
    );
    assert(
      "P2 the wire's quantity is the helper's answer, on the guest's own rows, a carried child's rows and the host's preview",
      /quantity:\s*guestAmountText\(a\.item\)/.test(wireBody) &&
        (gr.match(/guestAmountText\(a\.item\)/g) ?? []).length === 2
    );
    assert(
      "P3 the guest's own rows and a carried child's rows go through the one wireAssignment",
      (gr.match(/\.map\(wireAssignment\)/g) ?? []).length === 2
    );
    assert(
      "P4 what it selects is unchanged: three assignment reads, each including the item with its day, the guest's own also its team and coordinator",
      (getPart.match(/prisma\.assignment\.findMany/g) ?? []).length === 3 &&
        /item:\s*\{\s*include:\s*\{\s*day:\s*true,\s*team:\s*\{\s*include:\s*\{\s*coordinator:\s*true/.test(
          gr
        ) &&
        (gr.match(/item:\s*\{\s*include:\s*\{\s*day:\s*true,?\s*\},?\s*\}/g) ?? []).length === 2
    );
    assert(
      'P5 what it returns: the wire item has exactly the old keys and no raw amount, unit or state key',
      !/quantityAmount\s*:|quantityUnit\s*:|quantityState\s*:|quantityUnitCustom\s*:/.test(wireBody)
    );
    assert(
      "P6 its host check and order of steps are as before: the host check reads HOST, the preview returns before the link-open tracking, and carried rows are read after the guest's own",
      grRaw.includes("role: 'HOST'") &&
        grRaw.indexOf('isHostPreview: true') > -1 &&
        grRaw.indexOf('isHostPreview: true') < grRaw.indexOf('Track first link open') &&
        grRaw.indexOf('await resolveCarriedSubjects(') >
          grRaw.indexOf('prisma.assignment.findMany', grRaw.indexOf('Track first link open'))
    );
    assert(
      'P7 the PATCH (the answer) is untouched: it still records through the same answer writer',
      gr.includes('recordAssignmentAnswer') || gr.includes('export async function PATCH')
    );
    const ga = codeOnly(read(GUEST_HELPER));
    const helperImports = ga.match(/^import[^;]*;/gm) ?? [];
    assert(
      'P8 the helper imports nothing but the shared unit words: not the board, the press, the sender or the messages',
      helperImports.every((l) => /from\s+'@\/lib\/moment3\/share-split'/.test(l))
    );

    // ══ LAYER F — the screen, read structurally ══════════════════════════════════════
    section('Layer F — the screen');
    const box = codeOnly(read(BOX));
    const view = codeOnly(read(VIEW));
    const shareUi = codeOnly(read(SHAREUI));
    assert(
      'F1 the Details box offers W1 only when the dish has a holder',
      /holderName\s*&&/.test(box) && box.includes('SHARE_BUTTON')
    );
    assert('F2 the box hands over to the share component', box.includes('Moment3ShareDish'));
    assert(
      'F3 the share component has the picker, the split lines, W10, W6 and the three words of its buttons',
      [
        'sharePickHeading',
        'ALREADY_HAS',
        'SPLIT_HEAD',
        'CONFIRM',
        'BACK',
        'SHARING',
        'NOT_DIVIDED',
        'shareTotalLine',
        'sharePersonLabel',
        'shareAmountLabel',
      ].every((w) => shareUi.includes(w))
    );
    assert(
      'F4 W10 never blocks: the confirm button is disabled only while saving or on a number that is not valid',
      /disabled=\{[^}]*saving[^}]*\}/.test(shareUi) &&
        !/disabled=\{[^}]*(shareTotalLine|differs|sum\s*!==)/.test(shareUi)
    );
    assert('F5 the number boxes use a decimal keypad', /inputMode="decimal"/.test(shareUi));
    assert(
      'F6 the picker rows are 44 pixels tall at the least',
      /min-h-\[44px\]|h-11/.test(shareUi)
    );
    assert(
      'F7 the view asks one why for the whole share, after the send, and calls the one route',
      view.includes('askForBatchReason') && view.includes('/share`')
    );
    assert(
      'F8 the view puts the copy directly under the row pressed and counts it (holders and rows both grow)',
      view.includes('afterId') && /setHolders\(/.test(view)
    );
    assert(
      'F9 the view shows W8 after a person is taken off a row whose name another row in its section carries',
      view.includes('shareUnassignedLine')
    );
    assert(
      'F10 the split shows W7 only after the invitations have gone, and the view says whether they have',
      shareUi.includes('shareToldLine') &&
        /sentAt\s*&&/.test(shareUi) &&
        /sentAt:\s*Boolean\(event\.sentAt\)/.test(view)
    );
    assert(
      'F11 the page rows are not given a new button: the "data-m3-details" button is still the only per-row control added since GTC-406',
      (view.match(/data-m3-details/g) ?? []).length === 1 && !view.includes('SHARE_BUTTON')
    );
    assert(
      'F12 the new files say nothing of "remind" or "chase"',
      !/remind|chase/i.test(shareUi + read(ROUTE) + read(SHARE) + read(SPLIT))
    );

    // ══ LAYER J — what this ticket may not touch ═════════════════════════════════════
    section('Layer J — what this ticket may not touch');
    const FORBIDDEN = [
      'src/lib/press',
      'src/lib/preflight',
      'src/lib/sms',
      'src/lib/messages',
      'src/lib/decide-by.ts',
      'src/lib/nudge-cadence.ts',
      'src/lib/glance',
      'src/components/glance',
      'src/components/preflight',
      'src/app/api/cron',
      'src/app/api/events/[id]/items/[itemId]/assign',
      'src/app/api/events/[id]/items/route.ts',
      'src/app/api/events/[id]/items/[itemId]/route.ts',
      'src/app/api/events/[id]/teams/[teamId]/items/route.ts',
      'src/lib/ledger.ts',
      'src/lib/workflow.ts',
      'src/lib/assignment',
      'src/lib/auth',
      'src/lib/auth.ts',
      'src/app/api/auth',
      'src/app/api/webhooks',
      'src/lib/stripe.ts',
      'prisma',
      'middleware.ts',
    ];
    const git = (args: string[]) =>
      spawnSync('git', ['--literal-pathspecs', ...args], { cwd: ROOT, encoding: 'utf8' });
    const baseOk = git(['cat-file', '-e', `${GTC472_BASE}^{commit}`]).status === 0;
    // ⚠ THREE FILES ASKED AT A FIXED COMMIT SINCE [[GTC-477]] (23 Nov 2026, the founder's ruling 2 on
    // its plan: "ledger.ts and the two item routes are checked as unchanged between 4e7dfa1 and
    // 1372817 instead of against the working folder. Everything else on J2 stays live."). GTC-477
    // edits them on purpose (a day sent to the add route is kept; the day is an ask field). They are
    // taken out of the live list by exact name, and must be unchanged from this base to GTC-477's
    // base, 1372817.
    const GTC477_BASE = '1372817';
    const GTC477_FILES = [
      'src/app/api/events/[id]/items/[itemId]/route.ts',
      'src/app/api/events/[id]/teams/[teamId]/items/route.ts',
      'src/lib/ledger.ts',
    ];
    const gtc477Ok =
      git(['cat-file', '-e', `${GTC477_BASE}^{commit}`]).status === 0 &&
      GTC477_FILES.every((f) => FORBIDDEN.includes(f)) &&
      git(['diff', '--quiet', GTC472_BASE, GTC477_BASE, '--', ...GTC477_FILES]).status === 0;
    // ⚠ AND THE SCHEMA, ITS MIGRATIONS AND workflow.ts ASKED AT A FIXED COMMIT SINCE [[GTC-478]]
    // (23 Nov 2026, the founder's ruling 2 on its plan: "Yes to the older checks you listed being
    // compared at fixed commits ending at c686175"). GTC-478 edits them on purpose (the session
    // order, the SessionAbsence table and its migration; "invites only" keeps sessions). They are
    // taken out of the live list, and must be unchanged from this base to c686175, main's tip when
    // GTC-478 began. Everything else on J2 stays live. J3 and J4 ask the same span.
    const GTC478_AT = 'c686175';
    const GTC478_PATHS = ['prisma', 'src/lib/workflow.ts'];
    const isGtc478 = (f: string) => f === 'src/lib/workflow.ts' || f.startsWith('prisma/');
    const gtc478Ok =
      git(['cat-file', '-e', `${GTC478_AT}^{commit}`]).status === 0 &&
      GTC478_PATHS.every((f) => FORBIDDEN.includes(f)) &&
      git(['diff', '--quiet', GTC472_BASE, GTC478_AT, '--', ...GTC478_PATHS]).status === 0;
    // ⚠ AND ELEVEN FILES ASKED AT A FIXED COMMIT SINCE [[GTC-485]] (25 Nov 2026, the founder's final
    // word on its plan, item 4: "The hunks, the moved pins and the new suite as planned"). GTC-485
    // edits them on purpose (a dish's deadline from its session, its tag on the board, the
    // invitation's date range; the two sms files one select line each, ruling 5). They are taken out
    // of the live list by exact name, and must be unchanged from this base to 8454fed, GTC-485's
    // base. Their bytes are held by test:sessions-guests-clock (8454fed plus exactly the named
    // hunks) and the two sms files also by test:tweaks-guard. Everything else on J2 stays live.
    const GTC485_AT = '8454fed';
    const GTC485_FILES = [
      'src/lib/decide-by.ts',
      'src/lib/sms/decide-by-eligibility.ts',
      'src/lib/sms/decide-by-sender.ts',
      'src/lib/messages/ask-register.ts',
      'src/lib/preflight/ask-preview.ts',
      'src/lib/preflight/ask-preview-compose.ts',
      'src/lib/glance/read.ts',
      'src/lib/glance/rewind.ts',
      'src/lib/glance/state.ts',
      'src/components/glance/reading.ts',
      'src/components/glance/GlancePersonReading.tsx',
    ];
    const gtc485Ok =
      git(['cat-file', '-e', `${GTC485_AT}^{commit}`]).status === 0 &&
      git(['diff', '--quiet', GTC472_BASE, GTC485_AT, '--', ...GTC485_FILES]).status === 0;
    // ⚠ AND ONE FILE ASKED AT A FIXED COMMIT SINCE [[GTC-487]] (28 Nov 2026, the founder's word on
    // its plan: "yes to all 13 moves as you describe them, each the narrowest way with a dated note
    // naming GTC-487"). GTC-487 edits the board's red panel on purpose (A: the dish's session tag,
    // as the reading panel draws it). It is taken out of the live list by exact name, and must be
    // unchanged from this base to 89da9a3, GTC-487's base. Its bytes are held by
    // test:small-fixes-batch. Everything else on J2 stays live.
    const GTC487_AT = '89da9a3';
    const GTC487_FILES = ['src/components/glance/PersonSurface.tsx'];
    const gtc487Ok =
      git(['cat-file', '-e', `${GTC487_AT}^{commit}`]).status === 0 &&
      git(['diff', '--quiet', GTC472_BASE, GTC487_AT, '--', ...GTC487_FILES]).status === 0;
    const changed = git(['diff', '--name-only', GTC472_BASE, '--', ...FORBIDDEN])
      .stdout.split('\n')
      .filter(
        (f) =>
          f !== '' &&
          !GTC477_FILES.includes(f) &&
          !isGtc478(f) &&
          !GTC485_FILES.includes(f) &&
          !GTC487_FILES.includes(f)
      )
      .join('\n');
    const untracked = git([
      'ls-files',
      '--others',
      '--exclude-standard',
      '--',
      ...FORBIDDEN,
    ]).stdout.trim();
    assert('J1 the base commit is in this checkout, so the checks below mean something', baseOk);
    assert(
      'J2 nothing under the send, the nudges, the decide-by clock, the board, the assign and items routes, the ledger, auth, Stripe or the schema is changed or added',
      baseOk && gtc477Ok && gtc478Ok && gtc485Ok && gtc487Ok && changed === '' && untracked === '',
      `${changed} ${untracked}`
    );
    const files = git(['diff', '--name-only', GTC472_BASE, GTC478_AT])
      .stdout.split('\n')
      .filter(Boolean);
    assert(
      'J3 no migration is added (from the base to c686175, GTC-478)',
      !files.some((f) => f.startsWith('prisma/')) && !untracked.includes('prisma')
    );
    assert(
      'J4 the only file added under src/app/api is the share route (from the base to c686175, GTC-478)',
      (() => {
        const added = git(['ls-files', '--others', '--exclude-standard', '--', 'src/app/api'])
          .stdout.split('\n')
          .filter(Boolean);
        const addedTracked = git([
          'diff',
          '--name-only',
          '--diff-filter=A',
          GTC472_BASE,
          GTC478_AT,
          '--',
          'src/app/api',
        ])
          .stdout.split('\n')
          .filter(Boolean);
        const all = [...new Set([...added, ...addedTracked])];
        return all.length === 1 && all[0] === ROUTE;
      })()
    );
    const routeSrc = codeOnly(read(ROUTE));
    assert(
      "J5 the route has one handler, POST, and the assign route's three roles",
      /export async function POST/.test(routeSrc) &&
        !/export async function (GET|PUT|PATCH|DELETE)/.test(routeSrc) &&
        /requireEventRole\(eventId, \['HOST', 'COHOST', 'COORDINATOR'\]\)/.test(routeSrc)
    );
    assert(
      'J6 the route and the share files name no sender, provider or queue',
      !/sendSms|sendViaTnz|getResendClient|outboundMessage|OutboundMessage|inviteEvent|logInviteEvent|nudge|onAssignmentReleased|onMaterialChange/.test(
        routeSrc + codeOnly(read(SHARE)) + codeOnly(read(SPLIT))
      )
    );
    assert(
      'J7 route-classifications.json classifies the route (POST, session, requireEventRole)',
      /"filePath": "src\/app\/api\/events\/\[id\]\/items\/\[itemId\]\/share\/route\.ts"[\s\S]{0,260}"methods": \["POST"\][\s\S]{0,80}"authType": "SESSION"[\s\S]{0,80}requireEventRole/.test(
        read('route-classifications.json')
      )
    );

    // E3 last, so it covers every request above.
    const outbound2 = await prisma.outboundMessage.count({
      where: { eventId: { in: createdEventIds } },
    });
    const invites2 = await prisma.inviteEvent.count({
      where: { eventId: { in: createdEventIds } },
    });
    assert(
      'E3 nothing left the process, and the fixture events have no OutboundMessage and no InviteEvent',
      trapCount() === trapBefore &&
        trapCount() === 0 &&
        outbound === 0 &&
        invites === 0 &&
        outbound2 === 0 &&
        invites2 === 0,
      `trap ${trapCount()}, outbound ${outbound2}, invites ${invites2}`
    );
  } catch (err) {
    assert('the suite ran to completion', false, String(err));
  } finally {
    for (const eventId of createdEventIds) {
      await prisma.auditEntry.deleteMany({ where: { eventId } }).catch(() => {});
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
      await prisma.eventRole.deleteMany({ where: { eventId } });
      await prisma.eventSetup.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
    }
    if (createdPersonIds.length) {
      await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    }
    if (createdUserIds.length) {
      // The route makes a Person for a signed-in user it has not met (the coordinator's); remove it by its user.
      await prisma.person.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  }

  console.log('\n\x1b[1m\x1b[33m=== Summary ===\x1b[0m');
  console.log(`Total: ${passed + failed}`);
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
  if (failed > 0) {
    console.error('\nRED:');
    for (const r of red) console.error(`  ${r.split(' ')[0]}`);
    process.exit(1);
  }
  process.exit(0);
}

main();
