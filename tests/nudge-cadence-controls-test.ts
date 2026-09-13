/**
 * GTC-179 (E2, phase 3) — the cutover: the sweep obeys the pace and the mark.
 *
 * Phase 1 built the resolver and proved it pure. Phase 2 added the columns and proved
 * them inert. This file proves the two are actually WIRED TOGETHER, which is the one
 * thing neither earlier phase could assert and the one thing the type system cannot
 * catch.
 *
 * WHY THE TYPE SYSTEM CANNOT CATCH IT — the hazard phase 1 flagged at its own call site.
 * `NudgeMarkSource` and `NudgePaceSource` are all-optional by design, because a narrow
 * Prisma `select` has to satisfy them. So ANY object type-checks, and a column left out
 * of the query reads as `undefined` — no opinion — which resolves to the system default
 * for everybody, silently, with every other suite still green. Measured on the tree at
 * `4b3ee57`, the asymmetry was live and invisible:
 *
 *     'nudgeMark' in membership       -> true   (the top-level `include` returns all
 *                                                PersonEvent scalars, so the mark
 *                                                arrived BY ACCIDENT)
 *     'nudgePace' in membership.event -> false  (the nested `select` names four fields;
 *                                                the pace did not arrive at all)
 *
 * Every assertion below that turns a column into an OUTCOME is therefore a select-proof:
 * it fails if the field stops being fetched, whichever of the two mechanisms delivers it.
 *
 * FIVE LAYERS:
 *  1. The direct sweep reads both columns, and composes them by quieter-wins (Ruling 4).
 *  2. Ruling 6 — don't-chase records a skip, and is not silent.
 *  3. Ruling 7 — (a) sent stays sent across a pace change; (b) at most ONE nudge per
 *     person per run. (b) is a BUG FIX: on the pre-phase-3 tree one person lands in both
 *     eligible arrays and `processNudges` sends both, 500ms apart.
 *  4. Ruling 3 — don't-chase suppresses the PROXY path too, gated AFTER the child rule
 *     and AFTER opt-out, never through either.
 *  5. Structural — the selects, and the two paths sharing one reason constant.
 *  8. Ruling 19 (GTC-192, 2026-09-01) — the THIRD path: the host's own press. The mark
 *     was a rule about the automated sweeps until this ruling; it is now a rule about the
 *     system, so `resolveManualNudgeRecipient` refuses a marked person beside the child
 *     and host gates, and BOTH doors into that route — V1's composer and the Moment 4
 *     glance — refuse with it.
 *
 * `now` IS INJECTED for the direct sweep, so day boundaries are hit exactly rather than
 * approximately. `findProxyNudgeCandidates` takes no clock and needs none — it has no
 * time gate at all, which is GTC-178's recorded Ruling 3 determination — so its fixture
 * uses real wall-clock-valid dates.
 *
 * NO SMS IS SENT. `processNudges` and `processProxyNudges` are never invoked; every
 * assertion is at the layer where candidacy is decided.
 *
 * Run: npx tsx tests/nudge-cadence-controls-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { findNudgeCandidates } from '../src/lib/sms/nudge-eligibility';
import { findProxyNudgeCandidates } from '../src/lib/sms/proxy-nudge-eligibility';
import { resolveManualNudgeRecipient } from '../src/lib/sms/manual-nudge-recipient';

const prisma = new PrismaClient();

const TAG = 'GTC179P3';
const DAY = 24 * 60 * 60 * 1000;

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(phase: string, label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}`);
    failed++;
    redAssertions.push(`[${phase}] ${label}`);
  }
}

/** Source with comments stripped — naming a thing you excluded must not read as using it. */
function code(rel: string): string {
  return readFileSync(join(__dirname, '..', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Mechanism-agnostic: the reason must NAME don't-chase, whatever string is chosen. */
const NAMES_DONT_CHASE = /don'?t[- ]?chase/i;

/** Likewise for the pace. Both paths must report the same fact the same way. */
const NAMES_OFF = /pace is off|nudge pace.*off|paused for this event/i;

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdOptOutIds: string[] = [];

  try {
    const now = new Date();
    const T0 = new Date(now.getTime() - 30 * DAY); // the send, long ago; `now` moves
    // Must outlive clock(365) — which is now + 335 days, because T0 is 30 days back.
    // At 90 days the event left SENT_AND_LIVE before the day-365 sweep and those three
    // assertions passed VACUOUSLY: nobody was a candidate because the EVENT was gone.
    const future = new Date(now.getTime() + 500 * DAY);
    const clock = (d: number) => new Date(T0.getTime() + d * DAY);

    const host = await prisma.person.create({ data: { name: `${TAG} Host` } });
    createdPersonIds.push(host.id);

    async function makeEvent(name: string, pace: 'STANDARD' | 'RELAXED' | 'OFF' | null) {
      const e = await prisma.event.create({
        data: {
          name: `${TAG} ${name}`,
          startDate: future,
          endDate: future,
          hostId: host.id,
          status: 'CONFIRMING',
          sentAt: T0,
          ...(pace ? { nudgePace: pace } : {}),
        } as any,
      });
      createdEventIds.push(e.id);
      return e;
    }

    let phoneSeq = 0;
    async function makePerson(
      eventId: string,
      name: string,
      opts: {
        mark?: 'GENTLE' | 'DONT_CHASE' | null;
        first?: Date | null;
        second?: Date | null;
        role?: 'PRIMARY_CONTACT' | 'PARTNER' | 'GUEST' | 'CHILD' | null;
        householdId?: string;
        sentAt?: Date;
      } = {}
    ) {
      phoneSeq += 1;
      const phone = `+6421${String(500000 + phoneSeq)}`;
      const person = await prisma.person.create({
        data: {
          name: `${TAG} ${name}`,
          email: `${TAG.toLowerCase()}-${phoneSeq}@example.test`,
          phoneNumber: phone,
        },
      });
      createdPersonIds.push(person.id);
      const pe = await prisma.personEvent.create({
        data: {
          personId: person.id,
          eventId,
          role: 'PARTICIPANT',
          reachabilityTier: 'DIRECT',
          contactMethod: 'SMS',
          sentAt: opts.sentAt ?? T0,
          firstNudgeSentAt: opts.first ?? null,
          secondNudgeSentAt: opts.second ?? null,
          ...(opts.mark ? { nudgeMark: opts.mark } : {}),
          ...(opts.role ? { householdRole: opts.role } : {}),
          ...(opts.householdId ? { householdId: opts.householdId } : {}),
        } as any,
      });
      await prisma.accessToken.create({
        data: {
          token: `${TAG}-${person.id}-${eventId}`,
          scope: 'PARTICIPANT',
          eventId,
          personId: person.id,
          openedAt: null,
        },
      });
      return { person, pe, phone };
    }

    // ══ FIXTURE ═════════════════════════════════════════════════════════
    const evStandard = await makeEvent('pace unset (default 4/7)', null);
    const evOff = await makeEvent('pace OFF', 'OFF');
    const evRelaxed = await makeEvent('pace RELAXED (6/12)', 'RELAXED');

    const control = await makePerson(evStandard.id, 'control (unmarked)');
    const dontChase = await makePerson(evStandard.id, 'dont-chase', { mark: 'DONT_CHASE' });
    const gentle = await makePerson(evStandard.id, 'gentle', { mark: 'GENTLE' });
    const offPerson = await makePerson(evOff.id, 'on an OFF event');
    // A SECOND person on the same OFF event. Ruling 11 records the skip PER PERSON, and a
    // one-person fixture cannot tell "per person" from "per event" — the count would be 1
    // either way.
    const offPerson2 = await makePerson(evOff.id, 'also on the OFF event');
    // And a GENTLE person on the OFF event: quieter-wins makes them [] too, but the CAUSE
    // is the pace, so they must be counted under the OFF reason and not the mark's.
    const gentleOnOff = await makePerson(evOff.id, 'gentle on an OFF event', {
      mark: 'GENTLE',
    });
    const relaxedPerson = await makePerson(evRelaxed.id, 'on a RELAXED event');
    const gentleOnRelaxed = await makePerson(evRelaxed.id, 'gentle on RELAXED', {
      mark: 'GENTLE',
    });
    // Stamped on day 4 under the old pace, then the host switched the event to RELAXED.
    const stampedThenRelaxed = await makePerson(evRelaxed.id, 'stamped then retimed', {
      first: clock(4),
    });

    const sweep = async (at: Date) => {
      const r = await findNudgeCandidates(at);
      return {
        first: (id: string) => r.eligibleFirst.some((c) => c.personEventId === id),
        second: (id: string) => r.eligibleSecond.some((c) => c.personEventId === id),
        raw: r,
      };
    };

    // ══ LAYER 1 — both columns are read, and compose ════════════════════
    const d4 = await sweep(clock(4));

    assert(
      'layer1 control',
      'an unmarked person on a pace-unset event is a first-leg candidate at day 4',
      d4.first(control.pe.id)
    );

    // SELECT-PROOF for Event.nudgePace. On the pre-phase-3 tree the nested `select` did
    // not fetch it, so this person resolves to the default and IS eligible at day 4.
    assert(
      'layer1 pace',
      'OFF EVENT: nobody is a candidate at day 4 — proves Event.nudgePace is selected',
      !d4.first(offPerson.pe.id) && !d4.second(offPerson.pe.id)
    );

    // SELECT-PROOF for PersonEvent.nudgeMark.
    assert(
      'layer1 mark',
      "DON'T-CHASE: not a candidate at day 4 — proves PersonEvent.nudgeMark is read",
      !d4.first(dontChase.pe.id) && !d4.second(dontChase.pe.id)
    );

    assert(
      'layer1 gentle',
      'GENTLE is NOT due at day 4 — gentle is [5], not [4, 7] (Ruling 1)',
      !d4.first(gentle.pe.id)
    );

    assert(
      'layer1 relaxed',
      'RELAXED is NOT due at day 4 — relaxed is [6, 12] (Ruling 2)',
      !d4.first(relaxedPerson.pe.id)
    );

    const d5 = await sweep(clock(5));
    assert(
      'layer1 gentle',
      'GENTLE IS due at day 5 — one nudge, on its own day (Ruling 1)',
      d5.first(gentle.pe.id)
    );
    assert('layer1 relaxed', 'RELAXED still not due at day 5', !d5.first(relaxedPerson.pe.id));

    // RULING 4 THROUGH THE DATABASE. Quieter wins: GENTLE [5] beats RELAXED [6,12]
    // because one message beats two, even though it lands EARLIER. Under the override
    // ladder phase 1 corrected, this person would have waited until day 6.
    assert(
      'layer1 ruling4',
      'GENTLE on a RELAXED event is due at day 5, not day 6 — quieter wins, end to end',
      d5.first(gentleOnRelaxed.pe.id)
    );

    const d6 = await sweep(clock(6));
    assert('layer1 relaxed', 'RELAXED first leg IS due at day 6', d6.first(relaxedPerson.pe.id));

    const d365 = await sweep(clock(365));
    assert(
      'layer1 gentle',
      'GENTLE never grows a second leg — still no second-leg candidacy at day 365',
      !d365.second(gentle.pe.id)
    );
    assert(
      'layer1 pace',
      'an OFF event is still silent at day 365 — off is off, not merely later',
      !d365.first(offPerson.pe.id) && !d365.second(offPerson.pe.id)
    );
    assert(
      'layer1 mark',
      "don't-chase is still silent at day 365 — §10.3's off-switch, not a delay",
      !d365.first(dontChase.pe.id) && !d365.second(dontChase.pe.id)
    );

    // ══ LAYER 2 — Ruling 6: the skip is RECORDED, not silent ════════════
    const reasons = d4.raw.skipped;
    assert(
      'layer2 ruling6',
      "don't-chase records a skip reason naming don't-chase — not a silent fallthrough",
      reasons.some((s) => NAMES_DONT_CHASE.test(s.reason))
    );
    assert(
      'layer2 ruling6',
      'exactly one person is counted under it — the marked one, not the whole event',
      reasons.find((s) => NAMES_DONT_CHASE.test(s.reason))?.count === 1
    );
    assert(
      'layer2 ruling6',
      'the control is NOT swept into that skip — suppression keys on the mark, not the event',
      d4.first(control.pe.id) && reasons.find((s) => NAMES_DONT_CHASE.test(s.reason))?.count === 1
    );

    // ══ LAYER 3 — Ruling 7 ══════════════════════════════════════════════
    // (a) SENT STAYS SENT. Stamped on day 4 under the old pace; the host then switched
    // the event to RELAXED, whose first leg would not have been due until day 6. The
    // stamp is not cleared, and the leg is not re-opened.
    const d5r = await sweep(clock(5));
    assert(
      'layer3 ruling7a',
      'a stamped leg is not re-opened by a pace change to a LATER cadence',
      !d5r.first(stampedThenRelaxed.pe.id)
    );
    const reread = await prisma.personEvent.findUnique({
      where: { id: stampedThenRelaxed.pe.id },
      select: { firstNudgeSentAt: true, secondNudgeSentAt: true },
    });
    assert(
      'layer3 ruling7a',
      'and the sweep does not CLEAR the stamp — what has been sent stays sent',
      reread?.firstNudgeSentAt?.getTime() === clock(4).getTime()
    );
    assert(
      'layer3 ruling7a',
      'nor does it invent a second stamp',
      reread?.secondNudgeSentAt === null
    );

    // (b) AT MOST ONE NUDGE PER PERSON PER RUN. At day 9 the control is past BOTH
    // default legs with both stamps null, so both legs are due at once. On the
    // pre-phase-3 tree this person is in BOTH arrays and processNudges sends twice,
    // 500ms apart. THIS IS THE BUG FIX, and it is reachable with no pace change at all.
    const d9 = await sweep(clock(9));
    assert(
      'layer3 ruling7b',
      'day 9, both legs due, both stamps null: the FIRST leg is the candidate',
      d9.first(control.pe.id)
    );
    assert(
      'layer3 ruling7b',
      'and the SECOND leg is NOT also a candidate in the same run — no double send',
      !d9.second(control.pe.id)
    );
    const bothArrays = d9.raw.eligibleSecond.filter((c) =>
      d9.raw.eligibleFirst.some((f) => f.personEventId === c.personEventId)
    );
    assert(
      'layer3 ruling7b',
      'NOBODY anywhere in the sweep is in both arrays — the general rule, not a special case',
      bothArrays.length === 0
    );

    // The next tick picks the second leg up. Stamp the first, re-sweep.
    await prisma.personEvent.update({
      where: { id: control.pe.id },
      data: { firstNudgeSentAt: clock(9) },
    });
    const d9b = await sweep(clock(9));
    assert(
      'layer3 ruling7b',
      'once the first leg is stamped, the next run takes the second — deferred, not dropped',
      !d9b.first(control.pe.id) && d9b.second(control.pe.id)
    );

    // ══ LAYER 6 — Ruling 11: an OFF event records a skip, PER PERSON ════
    //
    // PLACED BEFORE THE PROXY FIXTURE, DELIBERATELY. The skip COUNTS below are only
    // attributable while the only marked people in the database are this layer's — the
    // proxy fixture adds three more DONT_CHASE rows on its own SENT_AND_LIVE event, which
    // the DIRECT sweep also sees, so running this afterwards made "exactly one under the
    // mark" a statement about the whole fixture rather than about the subject. Caught by
    // that assertion failing rather than by reading the fixture, which is the point of
    // asserting counts and not just membership.
    const off = await sweep(clock(9));
    const offSkip = off.raw.skipped.find((sk) => NAMES_OFF.test(sk.reason));
    const chaseSkip = off.raw.skipped.find((sk) => NAMES_DONT_CHASE.test(sk.reason));

    assert(
      'layer6 ruling11',
      'an OFF event records a skip reason naming the pace — not a silent fallthrough',
      offSkip !== undefined
    );
    assert(
      'layer6 ruling11',
      "and it is DISTINCT from don't-chase — the two causes are told apart",
      offSkip !== undefined && chaseSkip !== undefined && offSkip.reason !== chaseSkip.reason
    );
    assert(
      'layer6 ruling11',
      'counted PER PERSON: three people on the OFF event, count of three',
      offSkip?.count === 3
    );
    assert(
      'layer6 ruling11',
      'a GENTLE person on an OFF event is counted under the PACE, not under the mark',
      chaseSkip?.count === 1
    );
    assert(
      'layer6 ruling11',
      'and all three are still absent from both eligible arrays',
      !off.first(offPerson.pe.id) &&
        !off.first(offPerson2.pe.id) &&
        !off.first(gentleOnOff.pe.id) &&
        !off.second(offPerson.pe.id) &&
        !off.second(offPerson2.pe.id) &&
        !off.second(gentleOnOff.pe.id)
    );

    // ══ LAYER 4 — Ruling 3: the proxy path ══════════════════════════════
    // Real wall-clock dates: findProxyNudgeCandidates takes no injectable clock, and
    // needs none — it has no time gate of any kind (GTC-178's Ruling 3 determination).
    const evProxy = await makeEvent('proxy', null);

    async function makeHousehold(label: string, eventId: string = evProxy.id) {
      const h = await prisma.household.create({
        data: { eventId, littleCount: 0 },
      });
      return h;
    }

    const hControl = await makeHousehold('control');
    const pControl = await makePerson(evProxy.id, 'proxy control channel', {
      role: 'PRIMARY_CONTACT',
      householdId: hControl.id,
    });

    const hMarked = await makeHousehold('marked');
    const pMarked = await makePerson(evProxy.id, 'proxy channel dont-chase', {
      role: 'PRIMARY_CONTACT',
      householdId: hMarked.id,
      mark: 'DONT_CHASE',
    });

    // ORDERING PROOF 1 — the child rule must fire FIRST. A channel that is BOTH a CHILD
    // and DONT_CHASE must report the CHILD reason. §10.6 is absolute and must not be
    // reachable-through by a later gate.
    const hChild = await makeHousehold('child channel');
    const pChild = await makePerson(evProxy.id, 'proxy channel child+dont-chase', {
      role: 'CHILD',
      householdId: hChild.id,
      mark: 'DONT_CHASE',
    });
    // The channel must be PICKED explicitly. resolveHouseholdChannel falls back to the
    // household's PRIMARY_CONTACT, and this household deliberately has none — without
    // this the household skips as 'No primary contact' and never reaches the child rule,
    // so the ordering proof would assert nothing. Writing a CHILD here is exactly the
    // corrupt-data case GTC-172 documents: the picker omits children and the API rejects
    // them, so the only way in is a direct write, and the eligibility layer must still
    // fail closed.
    await prisma.household.update({
      where: { id: hChild.id },
      data: { contactPersonEventId: pChild.pe.id },
    });

    // ORDERING PROOF 2 — opt-out must fire FIRST. Zone 7: the mark is layered ON TOP of
    // opt-out, never through it.
    const hOptOut = await makeHousehold('opted out channel');
    const pOptOut = await makePerson(evProxy.id, 'proxy channel optout+dont-chase', {
      role: 'PRIMARY_CONTACT',
      householdId: hOptOut.id,
      mark: 'DONT_CHASE',
    });
    const optOutRow = await prisma.smsOptOut.create({
      data: { phoneNumber: pOptOut.phone, hostId: host.id },
    });
    createdOptOutIds.push(optOutRow.id);

    const proxy = await findProxyNudgeCandidates();
    const proxyEligible = (hid: string) => proxy.eligible.some((c) => c.householdId === hid);

    assert(
      'layer4 ruling3',
      'PROXY control: an unmarked channel is still eligible — the fixture reaches the path',
      proxyEligible(hControl.id)
    );
    assert(
      'layer4 ruling3',
      "PROXY: a DON'T-CHASE channel's household is NOT eligible — §10.3's paradigm case",
      !proxyEligible(hMarked.id)
    );
    assert(
      'layer4 ruling3',
      "PROXY: and it records a skip naming don't-chase, not a silent drop",
      proxy.skipped.some((s) => NAMES_DONT_CHASE.test(s.reason))
    );
    assert(
      'layer4 ordering',
      'PROXY: a CHILD channel is excluded, and the child rule is not reachable-through',
      !proxyEligible(hChild.id) && proxy.skipped.some((s) => /child/i.test(s.reason))
    );
    assert(
      'layer4 ordering',
      "PROXY: an OPTED-OUT channel reports OPT-OUT, not don't-chase — Zone 7 gate runs first",
      !proxyEligible(hOptOut.id) && proxy.skipped.some((s) => /opted out/i.test(s.reason))
    );
    // Both ordering subjects are also DONT_CHASE. If the mark gate had been placed
    // BEFORE the child rule or before opt-out, the don't-chase count would be 3, not 1.
    assert(
      'layer4 ordering',
      "exactly ONE household is counted under don't-chase — the other two were caught earlier",
      proxy.skipped.find((s) => NAMES_DONT_CHASE.test(s.reason))?.count === 1
    );

    // ── Ruling 12: an OFF EVENT suppresses the proxy path too ────────────
    //
    // Ruling 3 suppressed don't-chase on both paths; Ruling 11 addressed OFF on the
    // DIRECT path only. That asymmetry left a host who switched the pace off silenced on
    // one path while findProxyNudgeCandidates kept returning her households on every
    // tick — a failure spanning EVERY household rather than one person, which is why the
    // argument behind Ruling 3 applies here with more force, not less.
    const evProxyOff = await makeEvent('proxy on an OFF event', 'OFF');

    const hOffControl = await makeHousehold('off control', evProxyOff.id);
    await makePerson(evProxyOff.id, 'proxy channel on OFF event', {
      role: 'PRIMARY_CONTACT',
      householdId: hOffControl.id,
    });

    // ORDERING PROOF — the MARK is checked before the PACE, matching the direct sweep.
    // The mark is the more specific fact and survives the host switching the pace back
    // on, so it is the reason reported. If the two paths disagreed about this ordering,
    // the same household would be explained two different ways depending on which sweep
    // saw it.
    const hOffMarked = await makeHousehold('off + marked', evProxyOff.id);
    await makePerson(evProxyOff.id, 'proxy channel dont-chase on OFF event', {
      role: 'PRIMARY_CONTACT',
      householdId: hOffMarked.id,
      mark: 'DONT_CHASE',
    });

    const proxy2 = await findProxyNudgeCandidates();
    const proxy2Eligible = (hid: string) => proxy2.eligible.some((c) => c.householdId === hid);
    const proxy2Off = proxy2.skipped.find((sk) => NAMES_OFF.test(sk.reason));
    const proxy2Chase = proxy2.skipped.find((sk) => NAMES_DONT_CHASE.test(sk.reason));

    assert(
      'layer4 ruling12',
      'PROXY: a household on an OFF event is NOT eligible — the pace covers both paths',
      !proxy2Eligible(hOffControl.id)
    );
    assert(
      'layer4 ruling12',
      'PROXY: and it records the OFF skip reason, per household, consistent with Ruling 11',
      proxy2Off !== undefined
    );
    assert(
      'layer4 ruling12',
      'PROXY: the pace-unset control household is STILL eligible — OFF is the difference',
      proxy2Eligible(hControl.id)
    );
    assert(
      'layer4 ruling12',
      "PROXY ordering: a DON'T-CHASE channel on an OFF event reports the MARK, not the pace",
      proxy2Chase !== undefined &&
        proxy2Chase.count === 2 &&
        proxy2Off !== undefined &&
        proxy2Off.count === 1
    );
    assert(
      'layer4 ruling12',
      'PROXY: the two reasons are distinct strings — the causes are told apart',
      proxy2Off !== undefined &&
        proxy2Chase !== undefined &&
        proxy2Off.reason !== proxy2Chase.reason
    );

    // ══ LAYER 8 — Ruling 19: the manual path, the host's own press ══════
    //
    // NUMBERED 8 BECAUSE 6 AND 7 ARE TAKEN. This file's layer numbers were assigned as
    // layers were added and are already out of sequence in the source (6 sits above 4);
    // renumbering them is churn in a file this phase only extends.
    //
    // GTC-192's Ruling 19 (2026-09-01), on the founder's own reading of Ruling 14: "no
    // surface, old or new, can nudge a person the host said to leave alone." Until this
    // ruling the mark suppressed the two AUTOMATED paths above and had never gated a host
    // pressing a button — so V1's composer could nudge a marked person, and it did.
    //
    // ⚠ CHANGING V1's BEHAVIOUR IS THE POINT, NOT A SIDE EFFECT. The gate is in
    // `resolveManualNudgeRecipient`, which is the single thing both doors into
    // POST /api/events/[id]/people/[personId]/nudge go through, so there is no second
    // place for the two to disagree.
    const manualMarked = await resolveManualNudgeRecipient(evStandard.id, dontChase.person.id);
    const manualControl = await resolveManualNudgeRecipient(evStandard.id, control.person.id);
    const manualGentle = await resolveManualNudgeRecipient(evStandard.id, gentle.person.id);

    assert(
      'layer8 ruling19',
      "MANUAL: a DON'T-CHASE person is REFUSED the host's own nudge — 403, the child gate's shape",
      manualMarked.ok === false && manualMarked.status === 403
    );
    assert(
      'layer8 ruling19',
      'MANUAL: and the refusal NAMES the mark, so the host knows which of her own settings did it',
      manualMarked.ok === false && NAMES_DONT_CHASE.test(manualMarked.error)
    );
    assert(
      'layer8 ruling19',
      'MANUAL control: an unmarked person still resolves — the fixture reaches the path',
      manualControl.ok === true
    );
    assert(
      'layer8 ruling19',
      'MANUAL: GENTLE is a volume control, not an off-switch — it is NOT refused',
      manualGentle.ok === true
    );

    // ORDERING — the child rule must still fire FIRST, exactly as it does on the proxy
    // path above. A person who is BOTH a CHILD and DONT_CHASE reports the CHILD reason;
    // §10.6 is absolute and must not become reachable-through by a gate added later.
    const manualChildMarked = await makePerson(evStandard.id, 'manual child+dont-chase', {
      role: 'CHILD',
      mark: 'DONT_CHASE',
    });
    const manualChild = await resolveManualNudgeRecipient(
      evStandard.id,
      manualChildMarked.person.id
    );
    assert(
      'layer8 ordering',
      'MANUAL: a CHILD who is also marked reports the CHILD reason — §10.6 is not reachable-through',
      manualChild.ok === false && /child/i.test(manualChild.error)
    );

    // ── Ruling 19, structural: ONE definition, and BOTH doors ────────────
    const manualSrc = code('src/lib/sms/manual-nudge-recipient.ts');
    const nudgeRouteSrc = code('src/app/api/events/[id]/people/[personId]/nudge/route.ts');
    const v1ComposerSrc = code('src/components/plan/NudgeComposer.tsx');
    const glanceActionsSrc = code('src/lib/glance/actions.ts');

    assert(
      'layer8 structural',
      'MANUAL: the gate asks isChaseable — the same predicate both sweeps ask',
      manualSrc.length > 0 && /isChaseable/.test(manualSrc)
    );
    // THE QUOTED LITERAL, NOT THE BARE WORD. A second definition of §10.3's off-switch
    // looks like `mark !== 'DONT_CHASE'`; importing a constant NAMED after the mark from
    // the module that owns it is the opposite of that, and a bare-substring test cannot
    // tell them apart. The mutation this guards against still trips it.
    const DONT_CHASE_LITERAL = /['"`]DONT_CHASE['"`]/;
    assert(
      'layer8 structural',
      "MANUAL: and never spells 'DONT_CHASE' as a literal — that would be a second definition",
      manualSrc.length > 0 && !DONT_CHASE_LITERAL.test(manualSrc)
    );
    assert(
      'layer8 structural',
      'MANUAL: the route resolves the recipient BEFORE it reaches any provider',
      nudgeRouteSrc.length > 0 &&
        nudgeRouteSrc.indexOf('resolveManualNudgeRecipient') > 0 &&
        nudgeRouteSrc.indexOf('resolveManualNudgeRecipient') <
          Math.min(nudgeRouteSrc.indexOf('sendSms('), nudgeRouteSrc.indexOf('sendNudgeEmail('))
    );
    // "Assert the V1 button path refuses too." There is no second route to gate: V1's
    // composer and the Moment 4 glance build the SAME URL, so the refusal above covers
    // both by construction. This is the assertion that keeps it that way.
    const NUDGE_PATH = /\/api\/events\/\$\{[^}]+\}\/people\/\$\{[^}]+\}\/nudge/;
    assert(
      'layer8 structural',
      "V1: the composer's button posts to the very route the gate now guards",
      v1ComposerSrc.length > 0 && NUDGE_PATH.test(v1ComposerSrc)
    );
    assert(
      'layer8 structural',
      'GLANCE: and so does the Moment 4 surface — one gate, both doors, no second path',
      glanceActionsSrc.length > 0 && NUDGE_PATH.test(glanceActionsSrc)
    );

    // ══ LAYER 5 — structural: the selects, and one shared reason ════════
    const elig = code('src/lib/sms/nudge-eligibility.ts');
    assert(
      'layer5 select',
      "nudge-eligibility.ts's event select names nudgePace — the column phase 1 warned about",
      /nudgePace:\s*true/.test(elig)
    );
    assert(
      'layer5 select',
      'and the resolver is called with the row, not an empty object',
      /resolveNudgeOffsetDays\(\s*\{[^}]*person:/.test(elig) &&
        !/resolveNudgeOffsetDays\(\{\}\)/.test(elig)
    );
    assert(
      'layer5 shared',
      'both eligibility paths import the SAME skip-reason constant — they cannot drift',
      /DONT_CHASE_SKIP_REASON/.test(elig) &&
        /DONT_CHASE_SKIP_REASON/.test(code('src/lib/sms/proxy-nudge-eligibility.ts'))
    );
    assert(
      'layer5 shared',
      'and the SAME pace reason — one fact, one string, on both paths (Ruling 12)',
      /PACE_OFF_SKIP_REASON/.test(elig) &&
        /PACE_OFF_SKIP_REASON/.test(code('src/lib/sms/proxy-nudge-eligibility.ts'))
    );
    assert(
      'layer5 proxy',
      'the proxy suppression is a boolean read, with no clock and no window added',
      !/dueNudgeIndices|resolveNudgeOffsetDays|nextNudgeAt/.test(
        code('src/lib/sms/proxy-nudge-eligibility.ts')
      )
    );
    assert(
      'layer5 summary',
      'invite-status selects nudgeMark, so pendingFirst/pendingSecond can exclude it',
      /nudgeMark:\s*true/.test(code('src/app/api/events/[id]/invite-status/route.ts'))
    );
    assert(
      'layer5 summary',
      'and both pending terms actually reference the mark — the sweep and the summary agree',
      (() => {
        const src = code('src/app/api/events/[id]/invite-status/route.ts');
        const block = src.slice(src.indexOf('const nudgeSummary'));
        const pending = block.slice(0, block.indexOf('};'));
        return (
          (pending.match(/pendingFirst[\s\S]*?nudgeMark|nudgeMark[\s\S]*?pendingFirst/) !== null ||
            /isChaseable|DONT_CHASE/.test(pending)) &&
          /pendingSecond/.test(pending)
        );
      })()
    );

    // ══ LAYER 7 — phase 5: the labels, ordinal throughout ═══════════════
    // Structural, on comment-stripped source: a comment that CITES days 4 and 7 must not
    // be able to satisfy an assertion about host-facing copy. The behavioural half —
    // pendingFirst/pendingSecond actually changing — is driven live against the running
    // dev server, the same way GTC-178 proved its own summary change.
    const ROUTE = 'src/app/api/events/[id]/invite-status/route.ts';
    const MODAL = 'src/components/plan/PersonInviteDetailModal.tsx';
    const SECTION = 'src/components/plan/InviteStatusSection.tsx';
    const DAY_LABEL = /day[-\s]?[47]\b/i;

    for (const rel of [ROUTE, MODAL, SECTION]) {
      assert(
        'layer7 labels',
        `${rel.split('/').pop()} names no day count in host-facing copy`,
        !DAY_LABEL.test(code(rel))
      );
    }

    assert(
      'layer7 labels',
      'getNudgeStatus is ordinal — first/second, never a day number',
      /first reminder sent/i.test(code(ROUTE)) && /second reminder sent/i.test(code(ROUTE))
    );

    // Ruling 9 — the value that replaces a lie. "pending" for a don't-chase person says
    // something is coming; nothing is.
    assert(
      'layer7 ruling9',
      "getNudgeStatus returns 'not chasing' rather than 'pending' when nothing is coming",
      /not chasing/i.test(code(ROUTE))
    );

    // Ruling 11's other half: the summary must stop counting an OFF event's people.
    assert(
      'layer7 ruling11',
      'both pending terms reference the PACE as well as the mark',
      (() => {
        const src = code(ROUTE);
        const block = src.slice(src.indexOf('const nudgeSummary'));
        const pending = block.slice(0, block.indexOf('};'));
        return /isPaceOff|nudgePace|paceOff/.test(pending) && /pendingSecond/.test(pending);
      })()
    );
    assert(
      'layer7 shared',
      'the OFF reason is defined once and imported, not restated at the call site',
      /PACE_OFF_SKIP_REASON/.test(code('src/lib/sms/nudge-eligibility.ts'))
    );
  } finally {
    for (const id of createdOptOutIds) {
      await prisma.smsOptOut.delete({ where: { id } }).catch(() => {});
    }
    for (const eventId of createdEventIds) {
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.inviteEvent.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
    }
    if (createdPersonIds.length) {
      await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`\n\x1b[31mRED — ${failed} assertion(s) failed:\x1b[0m`);
    for (const r of redAssertions) console.error(`  ✗ ${r}`);
    process.exit(1);
  }
  console.log('\x1b[32mGREEN — the pace and the mark reach the sweep, on both paths.\x1b[0m');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
