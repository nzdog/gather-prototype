/**
 * GTC-189 slice 7b — RULING U'S DOOR. The three actions, and what each writes.
 *
 * > THE BOUNCE DOOR OFFERS THREE THINGS, not one undifferentiated "try again": send again to
 * > the same address; let the host edit the address and send; send to the phone instead. They
 * > answer three different failures — a full mailbox, a wrong address, a dead one — and one
 * > button could only ever serve one.
 *
 * 7a shipped two reds and WITHDREW the remind on both, so a `NOT_DELIVERED` person has had a red
 * with no action at all since `473deba`'s successor. This suite is the door that closes that.
 *
 * ── THE MECHANISM, IN ONE SENTENCE ────────────────────────────────────────────
 *
 * Each action writes ONE NEW `OutboundMessage` row of kind ASK for the same membership and
 * returns. It sends nothing. `drainOnce` on the two-minute cron does everything after that —
 * the chooser re-run, the link and reply-to gates, quiet hours, the claim, the real senders.
 * The door is a writer of one row; the dispatcher is untouched. Layer C proves the row and
 * layer E proves the absence of a second send path.
 *
 * ── THE SIX FOUNDER ANSWERS OF 2026-09-19 THAT THIS HOLDS ─────────────────────
 *
 * 1 — THE THIRD ACTION IS FENCED ON SMS BEING CONFIGURED, and it is NOT 5f reversed:
 *   *"5f's fence would have hidden a true failure — the board going red for a broken key — and
 *   that was the state worth seeing. This fence prevents a FALSE improvement: the red clearing
 *   when nothing was sent and no provider was reached."* Layer A proves both sides of the fence
 *   purely; layer C proves the live refusal in this environment.
 * 2 — THE DOOR CARRIES A LAST LOOK: the address it will send to, the message it will send, and
 *   a press rather than a link. ⚠ AND IT IS NOT [[GTC-311]]'s ONE-PERSON PRE-FLIGHT — that is a
 *   ruled object with a chase question in it. Layer D asserts the two facts are served and
 *   layer E asserts the panel renders both.
 * 3 — [[GTC-293]] IS NOW A PRECONDITION OF THE DEPLOY, moved by this door: the host's obvious
 *   fix for a dead address is the partner's address, which is GTC-293's own case arriving
 *   through a button built to invite it. 7b CATCHES P2002 and answers with a true sentence; it
 *   does not fix it. GTC-293 then dropped the constraint, so layer C now presses the partner's
 *   address and asserts it is accepted (founder ruling, GTC-293 Q5, 2026-09-29).
 * 4 — THE UNREACHABLE ARM SHIPS UNEXERCISED, keyed on the reason, named as unexercised. Its one
 *   action is CAPTURE rather than correction: *"Add a way to reach them."* Layer A pins the
 *   words and the one-action property.
 * 5 — EDIT-AND-SEND WRITES A LEDGER ENTRY; the `PATCH` people route is left alone. Layer C
 *   counts entries before and after, for all three actions.
 * 6 — THE DOOR FETCHES THE ADDRESS WHEN IT OPENS, and it is not on the board's payload. Layer E
 *   asserts `GlancePerson` still carries no contact detail.
 *
 * ⚠ AND WHAT THIS SUITE CANNOT PROVE, stated before any assertion claims otherwise: that any of
 * the three actions ever reaches a person. `RESEND_API_KEY` does not authenticate ([[GTC-247]])
 * and `TNZ_AUTH_TOKEN` is absent, so every row this door writes would be rejected or withheld by
 * the drain. What is proven here is everything that is Gather's own — the row, the transaction,
 * the guards, the ledger, and the fact the board reads back.
 *
 * Destructive to its own created rows only; cleans up in `finally`.
 * Requires the dev server on :3000 for layer D — the route is session-guarded, so the session
 * door is asserted over HTTP and the mechanism is driven through the module.
 *
 * Run: npx tsx tests/bounce-door-test.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();
const TAG = 'GTC189S7B';
const BASE = 'http://localhost:3000';

const DOOR_WORDS_MODULE = 'src/lib/press/resend-door.ts';
const DOOR_MODULE = 'src/lib/press/resend.ts';
const DOOR_ROUTE = 'src/app/api/events/[id]/people/[personId]/resend/route.ts';
const ACTIONS = 'src/lib/glance/actions.ts';
const SURFACE = 'src/components/glance/PersonSurface.tsx';
const CHOOSER = 'src/lib/eligibility/channel-chooser.ts';
const STATE = 'src/lib/glance/state.ts';
const ASK_PREVIEW = 'src/lib/preflight/ask-preview.ts';
const SEND_SMS = 'src/lib/sms/send-sms.ts';
const LEDGER = 'src/lib/ledger.ts';
const PATCH_ROUTE = 'src/app/api/events/[id]/people/[personId]/route.ts';

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}`);
    failed++;
  }
}
function section(title: string) {
  console.log(`\n\x1b[1m\x1b[33m${title}\x1b[0m`);
}

/** The RED run must report every assertion, not stop at the first undefined. */
function ok(fn: () => boolean): boolean {
  try {
    return !!fn();
  } catch {
    return false;
  }
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function read(path: string): string {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

const HOUR = 60 * 60 * 1000;

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdUserIds: string[] = [];
  const stamp = Date.now();

  try {
    // ── Layer 0: controls ────────────────────────────────────────────────────
    section('Layer 0: controls — the harness and the tree, before anything is trusted');

    const health = await fetch(`${BASE}/api/events`).catch(() => null);
    assert(
      'CONTROL: the dev server is up on :3000 and answers 401 with no cookie',
      health?.status === 401
    );
    assert(
      'CONTROL: the comment stripper strips — every absence below would otherwise pass because ' +
        'the thing was NAMED in a comment',
      stripComments('/* prisma */ const a = 1; // b\nconst c = 2;').includes('prisma') === false
    );
    assert(
      'CONTROL: the file reader really reads — a path that exists is non-empty and one that ' +
        'does not is ""',
      read(LEDGER).length > 0 && read('src/lib/does-not-exist.ts') === ''
    );

    let door: any = null;
    try {
      door = await import('../src/lib/press/resend-door');
    } catch {
      door = null;
    }
    let resend: any = null;
    try {
      resend = await import('../src/lib/press/resend');
    } catch {
      resend = null;
    }
    let chooser: any = null;
    try {
      chooser = await import('../src/lib/eligibility/channel-chooser');
    } catch {
      chooser = null;
    }
    let actions: any = null;
    try {
      actions = await import('../src/lib/glance/actions');
    } catch {
      actions = null;
    }
    let deliveryFact: any = null;
    try {
      deliveryFact = await import('../src/lib/glance/delivery-fact');
    } catch {
      deliveryFact = null;
    }

    /*
     * A missing module reads as FAILED ASSERTIONS, never a crashed run — `press-route-test`'s
     * rule, and the reason every layer below still reports at RED.
     */
    const callDoor = async (fn: string, ...args: unknown[]) => {
      if (!resend?.[fn]) return { ok: false, status: -1, code: 'MODULE_ABSENT' } as any;
      try {
        return await resend[fn](...args);
      } catch (e) {
        return { ok: false, status: -1, code: 'THREW', error: String(e) } as any;
      }
    };

    // ── Layer A: the rules and the words, pure ───────────────────────────────
    section('Layer A: which actions the door offers, and in whose words');

    assert(
      `${DOOR_WORDS_MODULE} exists and exports doorActionsFor — the one rule both the route ` +
        'and the panel obey',
      ok(() => typeof door.doorActionsFor === 'function')
    );

    const facts = (over: Record<string, unknown> = {}) => ({
      reason: 'NOT_DELIVERED',
      hasAddress: true,
      textReach: { ok: true },
      textingConfigured: true,
      ...over,
    });

    assert(
      'a bounced person with an address, a usable phone and SMS configured is offered all ' +
        'three — ruling U in full',
      ok(() => {
        const a = door.doorActionsFor(facts());
        return a.length === 3 && a.includes('AGAIN') && a.includes('EDIT') && a.includes('PHONE');
      })
    );
    assert(
      'with no phone at all, the phone action is ABSENT and not disabled — Ruling 18’s ' +
        'precedent: a control that cannot act is dropped, not annotated',
      ok(() => {
        const a = door.doorActionsFor(facts({ textReach: { ok: false, why: 'NO_CHANNEL' } }));
        return a.length === 2 && !a.includes('PHONE');
      })
    );
    assert(
      '⚠ ZONE 7: an opted-out phone is never offered, whatever the door shows (ruling U’s own ' +
        'second obstacle)',
      ok(() => {
        const a = door.doorActionsFor(facts({ textReach: { ok: false, why: 'SMS_OPTED_OUT' } }));
        return a.length === 2 && !a.includes('PHONE');
      })
    );
    assert(
      'a phone the chase cannot use is not offered either — PHONE_UNUSABLE, which is [[GTC-300]]’s ' +
        '+61 today',
      ok(() => {
        const a = door.doorActionsFor(facts({ textReach: { ok: false, why: 'PHONE_UNUSABLE' } }));
        return a.length === 2 && !a.includes('PHONE');
      })
    );
    assert(
      '⚠ FOUNDER ANSWER 1 — THE FENCE: with a perfectly usable phone and SMS NOT configured, ' +
        'the phone action is absent. This fence prevents a FALSE improvement; 5f’s would have ' +
        'hidden a true failure, and the two are not the same case',
      ok(() => {
        const a = door.doorActionsFor(facts({ textingConfigured: false }));
        return a.length === 2 && !a.includes('PHONE');
      })
    );
    assert(
      'CONTROL for the fence: the SAME facts with the fence open DO offer it, so the assertion ' +
        'above fails for the fence rather than for the phone',
      ok(() => door.doorActionsFor(facts({ textingConfigured: true })).includes('PHONE'))
    );
    assert(
      'a bounced person whose address has since been deleted is not offered “send again” — ' +
        'there is nothing to send it to',
      ok(() => {
        const a = door.doorActionsFor(facts({ hasAddress: false }));
        return !a.includes('AGAIN') && a.includes('EDIT');
      })
    );

    assert(
      '⚠ FOUNDER ANSWER 4 — UNREACHABLE GETS EXACTLY ONE ACTION, and it is the capture one. ' +
        'Ruling M’s red means Gather is out of moves: send-again has no address and ' +
        'send-to-phone no usable number, by construction of every code that maps to it',
      ok(() => {
        const a = door.doorActionsFor(
          facts({
            reason: 'UNREACHABLE',
            hasAddress: false,
            textReach: { ok: false, why: 'NO_CHANNEL' },
          })
        );
        return a.length === 1 && a[0] === 'EDIT';
      })
    );
    assert(
      '⚠ AND THE PROPERTY HOLDS FOR EVERY WITHHELD CODE 7a MAPS TO UNREACHABLE, asserted over ' +
        'that Record rather than over a list written here — so a sixth code cannot quietly ' +
        'acquire a second action',
      ok(() => {
        const codes = Object.entries(deliveryFact.WITHHELD_MEANS_UNREACHABLE)
          .filter(([, v]) => v === 'UNREACHABLE')
          .map(([k]) => k);
        /*
         * ⚠ 5 → 7 AT [[GTC-189]] SLICE 8a, and the property is extended rather than loosened. The two
         * new codes are [[GTC-324]]'s blocked address: the person HAS an address and the provider
         * will not deliver to it, so `hasAddress` is true and `addressBlocked` is what withdraws
         * "send again". As the CHOOSER produces them there is no phone the ask may use either, so
         * the door still has exactly one action. The drain's fence (F5) can produce EMAIL_BLOCKED
         * for a textable person too — that case is asserted separately in email-block-test.
         */
        if (codes.length !== 7) return false;
        const BLOCKED = new Set(['EMAIL_BLOCKED', 'EMAIL_BLOCKED_SMS_OPTED_OUT']);
        return codes.every((why) => {
          const blocked = BLOCKED.has(why);
          const a = door.doorActionsFor(
            facts({
              reason: 'UNREACHABLE',
              hasAddress: blocked,
              addressBlocked: blocked,
              textReach: {
                ok: false,
                why: why === 'OPTED_OUT' ? 'SMS_OPTED_OUT' : blocked ? 'NO_CHANNEL' : why,
              },
            })
          );
          return a.length === 1 && a[0] === 'EDIT';
        });
      })
    );

    assert(
      'the words are a Record keyed on the REASON, so a third red does not compile until ' +
        'somebody writes what its door says',
      ok(() => {
        const w = door.DOOR_WORDS;
        return Object.keys(w).length === 2 && !!w.NOT_DELIVERED?.EDIT && !!w.UNREACHABLE?.EDIT;
      })
    );
    assert(
      '⚠ FOUNDER ANSWER 4, VERBATIM: the unreachable door’s one action reads “Add a way to ' +
        'reach them” — not edit, not fix, because nothing is being corrected',
      ok(() => door.DOOR_WORDS.UNREACHABLE.EDIT === 'Add a way to reach them')
    );
    assert(
      'and the two reds do NOT share that label — a door that said “add” to somebody whose ' +
        'address merely bounced would be telling her Gather never had one',
      ok(() => door.DOOR_WORDS.NOT_DELIVERED.EDIT !== door.DOOR_WORDS.UNREACHABLE.EDIT)
    );
    assert(
      'every refusal the door can answer has a sentence a host can read — a Record over the ' +
        'union, 5f’s guard, so an eleventh code does not compile until somebody writes it',
      ok(() => {
        const w = door.RESEND_REFUSAL_WORDS;
        const values = Object.values(w) as string[];
        return values.length >= 10 && values.every((s) => typeof s === 'string' && s.length > 0);
      })
    );

    // ── Layer B: Zone 7's rule is ASKED, never copied ────────────────────────
    section('Layer B: the phone offer asks the chooser’s own ladder');

    assert(
      `${CHOOSER} exports textAskReachOf — “would the chooser text this person if they held no ` +
        'address”, which is the chooser’s ladder with the email set aside',
      ok(() => typeof chooser.textAskReachOf === 'function')
    );
    assert(
      'no phone → NO_CHANNEL',
      ok(() => {
        const r = chooser.textAskReachOf({ email: null, phoneNumber: null, smsOptedOut: false });
        return r.ok === false && r.why === 'NO_CHANNEL';
      })
    );
    assert(
      '⚠ opted out → SMS_OPTED_OUT, and it is the CHOOSER’s answer rather than a comparison ' +
        'written in the door',
      ok(() => {
        const r = chooser.textAskReachOf({
          email: null,
          phoneNumber: '+64211234567',
          smsOptedOut: true,
        });
        return r.ok === false && r.why === 'SMS_OPTED_OUT';
      })
    );
    assert(
      '+61 → PHONE_UNUSABLE, which is [[GTC-300]]’s defect answered by the predicate that owns it',
      ok(() => {
        const r = chooser.textAskReachOf({
          email: null,
          phoneNumber: '+61411234567',
          smsOptedOut: false,
        });
        return r.ok === false && r.why === 'PHONE_UNUSABLE';
      })
    );
    assert(
      'a clean +64 → reachable by text',
      ok(() => {
        const r = chooser.textAskReachOf({
          email: null,
          phoneNumber: '+64211234567',
          smsOptedOut: false,
        });
        return r.ok === true;
      })
    );
    assert(
      '⚠ AND IT IGNORES THE ADDRESS ON PURPOSE: a person with a live address and a usable phone ' +
        'is textable, which is the whole of ruling U’s third action — askChannelOf would have ' +
        'answered EMAIL and stopped',
      ok(() => {
        const r = chooser.textAskReachOf({
          email: 'live@example.com',
          phoneNumber: '+64211234567',
          smsOptedOut: false,
        });
        return r.ok === true;
      })
    );
    assert(
      'ONE DEFINITION: the door module writes no opt-out comparison and no number check of its ' +
        'own — the strings are absent from its source',
      ok(() => {
        const src = stripComments(read(DOOR_WORDS_MODULE) + read(DOOR_MODULE));
        return (
          src.length > 0 &&
          !/smsOptedOut\s*(===|!==|\?)/.test(src) &&
          !src.includes('isValidNZNumber')
        );
      })
    );
    assert(
      '⚠ [[GTC-301]]’s TWO OPT-OUT FACTS ARE MERGED IN ONE PLACE: ask-preview exports the merge ' +
        'and no longer spells it inline, so the door and the pre-flight cannot answer “opted ' +
        'out” differently',
      ok(() => {
        const src = read(ASK_PREVIEW);
        return /export function smsOptedOutFact/.test(src);
      })
    );

    // ── Layer C: the mechanism, against real rows ────────────────────────────
    section('Layer C: what each action actually writes');

    const user = await prisma.user.create({
      data: { email: `${TAG.toLowerCase()}+host+${stamp}@example.com` },
    });
    createdUserIds.push(user.id);
    const hostPerson = await prisma.person.create({
      data: { name: `${TAG} Host`, email: user.email, userId: user.id },
    });
    createdPersonIds.push(hostPerson.id);

    const sentAt = new Date(Date.now() - 2 * HOUR);
    const event = await prisma.event.create({
      data: {
        name: `${TAG} bounce door fixture`,
        startDate: new Date(Date.now() + 100 * HOUR),
        endDate: new Date(Date.now() + 130 * HOUR),
        hostId: hostPerson.id,
        status: 'CONFIRMING',
        sentAt,
      },
    });
    createdEventIds.push(event.id);
    await prisma.personEvent.create({
      data: { personId: hostPerson.id, eventId: event.id, role: 'HOST' },
    });
    const team = await prisma.team.create({ data: { eventId: event.id, name: 'Mains' } });
    const household = await prisma.household.create({ data: { eventId: event.id } });

    async function member(
      name: string,
      opts: {
        email?: string | null;
        phone?: string | null;
        optedOut?: boolean;
        householdRole?: string;
        token?: boolean;
      } = {}
    ) {
      const person = await prisma.person.create({
        data: {
          name: `${TAG} ${name}`,
          email:
            opts.email === undefined
              ? `${TAG.toLowerCase()}+${name}+${stamp}@example.com`
              : opts.email,
          phoneNumber: opts.phone ?? null,
          smsOptedOut: opts.optedOut ?? false,
        },
      });
      createdPersonIds.push(person.id);
      const pe = await prisma.personEvent.create({
        data: {
          personId: person.id,
          eventId: event.id,
          role: 'PARTICIPANT',
          householdId: household.id,
          householdRole: opts.householdRole ?? 'GUEST',
          sentAt,
        },
      });
      const item = await prisma.item.create({
        data: { teamId: team.id, name: `${name}'s dish`, kind: 'ITEM' },
      });
      await prisma.assignment.create({
        data: { itemId: item.id, personId: person.id, response: 'PENDING' },
      });
      if (opts.token !== false) {
        await prisma.accessToken.create({
          data: {
            token: `${TAG}-${name}-${stamp}`,
            scope: 'PARTICIPANT',
            eventId: event.id,
            personId: person.id,
          },
        });
      }
      return { person, pe };
    }

    async function askRow(personEventId: string, data: Record<string, unknown> = {}) {
      return prisma.outboundMessage.create({
        data: { eventId: event.id, personEventId, kind: 'ASK', channel: 'EMAIL', ...data },
        select: { id: true, createdAt: true },
      });
    }

    const bounced = await member('Bouncer');
    const withPhone = await member('Phoner', { phone: '+64211234567' });
    const optedOut = await member('Optedout', { phone: '+64211234599', optedOut: true });
    const delivered = await member('Delivered');
    const nowhere = await member('Nowhere', { email: null, phone: null });
    const rival = await member('Rival');
    const noPhone = await member('Nophone');
    const aussie = await member('Aussie', { phone: '+61411234567' });
    const contact = await member('Contact', { householdRole: 'PRIMARY_CONTACT' });
    const child = await member('Childrow', { householdRole: 'CHILD', email: null, token: false });
    await prisma.household.update({
      where: { id: household.id },
      data: { contactPersonEventId: contact.pe.id },
    });

    const rejected = {
      rejectedAt: sentAt,
      attemptedAt: sentAt,
      attemptCount: 1,
      provider: 'resend',
      providerError: 'API key is invalid',
    };
    await askRow(bounced.pe.id, rejected);
    await askRow(withPhone.pe.id, rejected);
    await askRow(optedOut.pe.id, rejected);
    await askRow(noPhone.pe.id, rejected);
    await askRow(aussie.pe.id, rejected);
    await askRow(delivered.pe.id, {
      acceptedAt: sentAt,
      attemptedAt: sentAt,
      attemptCount: 1,
      provider: 'resend',
      providerMessageId: `${TAG}-msg-${stamp}`,
    });
    /*
     * ⚠ THE UNREACHABLE ROW IS WRITTEN BY HAND, AND THAT IS THE POINT. [[GTC-325]] shape 3 is
     * RULED and unbuilt: the press writes no row for a host-list person, so no such row exists
     * in the product yet. This fixture is what "ships unexercised" means in practice.
     */
    await askRow(nowhere.pe.id, { withheldAt: sentAt, withheldWhy: 'NO_CHANNEL' });
    await askRow(contact.pe.id, rejected);

    const seam = { textingConfiguredFor: () => true };
    const fenced = { textingConfiguredFor: () => false };

    const unpressed = await prisma.event.create({
      data: {
        name: `${TAG} never pressed`,
        startDate: new Date(Date.now() + 100 * HOUR),
        endDate: new Date(Date.now() + 130 * HOUR),
        hostId: hostPerson.id,
        status: 'CONFIRMING',
      },
    });
    createdEventIds.push(unpressed.id);
    const stranger = await prisma.personEvent.create({
      data: { personId: bounced.person.id, eventId: unpressed.id, role: 'PARTICIPANT' },
    });

    const view = async (personId: string, deps: unknown = seam, eventId = event.id) =>
      callDoor('readDoor', prisma, { eventId, personId, baseUrl: BASE }, deps);
    const press = async (personId: string, body: Record<string, unknown>, deps: unknown = seam) =>
      callDoor(
        'resendToPerson',
        prisma,
        {
          eventId: event.id,
          personId,
          baseUrl: BASE,
          actor: { id: hostPerson.id, kind: 'HOST', name: hostPerson.name },
          ...body,
        },
        deps
      );

    assert(
      `${DOOR_MODULE} exists and exports readDoor and resendToPerson`,
      ok(() => typeof resend.readDoor === 'function' && typeof resend.resendToPerson === 'function')
    );

    const unpressedView = await view(bounced.person.id, seam, unpressed.id);
    assert(
      '⚠ AN UNPRESSED EVENT IS REFUSED: a door that wrote a row before the press would be the ' +
        'press happening by another name, which is `enrolMiniSends`’s own predicate',
      ok(() => unpressedView.ok === false && unpressedView.code === 'NOT_PRESSED')
    );
    void stranger;

    const deliveredView = await view(delivered.person.id);
    assert(
      'a person whose message was ACCEPTED has no door — the red the door answers is not there',
      ok(() => deliveredView.ok === false && deliveredView.code === 'NOTHING_FAILED')
    );
    const childView = await view(child.person.id);
    /*
     * [[GTC-336]] Q1 (founder, 2026-09-30) — flipped from `NOTHING_FAILED`, whose sentence (*"Their
     * last message did not fail"*) is false for a child whose carrier's message did fail. A child is
     * refused as a child, before any row is read.
     */
    assert(
      '⚠ A CHILD HAS NO DOOR, because a child has no row: ruling S gives them their CARRIER’s ' +
        'red, and the carrier is who you resend to',
      ok(() => childView.ok === false && childView.code === 'CHILD_NOT_MESSAGED')
    );

    const bouncedView = await view(bounced.person.id);
    assert(
      'a rejected row opens the door, and it names the red it is the door for',
      ok(() => bouncedView.ok === true && bouncedView.view.reason === 'NOT_DELIVERED')
    );
    assert(
      '⚠ FOUNDER ANSWER 2 — THE LAST LOOK, HALF ONE: the door serves the ADDRESS it will send to',
      ok(() => bouncedView.view.address === bounced.person.email)
    );
    assert(
      '⚠ FOUNDER ANSWER 2 — THE LAST LOOK, HALF TWO: and the MESSAGE it will send, composed by ' +
        'the same walk the pre-flight and the drain run, never a second composition',
      ok(
        () =>
          typeof bouncedView.view.message?.text === 'string' &&
          bouncedView.view.message.text.length > 0
      )
    );
    assert(
      'the bounced person with no phone is offered two actions',
      ok(() => bouncedView.view.actions.length === 2 && !bouncedView.view.actions.includes('PHONE'))
    );

    const phonerOpen = await view(withPhone.person.id, seam);
    assert(
      'a bounced person with a usable phone is offered all three when SMS is configured',
      ok(() => phonerOpen.view?.actions?.length === 3)
    );
    const phonerFenced = await view(withPhone.person.id, fenced);
    assert(
      '⚠ AND THE FENCE REACHES THE OFFER, not only the press: the same person is offered two ' +
        'when SMS is not configured',
      ok(() => phonerFenced.view?.actions?.length === 2)
    );
    const optedOutOpen = await view(optedOut.person.id, seam);
    assert(
      '⚠ ZONE 7 REACHES THE OFFER TOO: an opted-out phone is never offered even with SMS ' +
        'configured and the door wide open',
      ok(() => optedOutOpen.view?.actions?.length === 2)
    );

    const nowhereView = await view(nowhere.person.id);
    assert(
      '⚠ THE UNREACHABLE ARM: a withheld NO_CHANNEL row reads ruling M’s red and opens one action',
      ok(
        () =>
          nowhereView.ok === true &&
          nowhereView.view.reason === 'UNREACHABLE' &&
          nowhereView.view.actions.length === 1 &&
          nowhereView.view.actions[0] === 'EDIT'
      )
    );
    assert(
      'and it shows no address and no message, because there is neither — a fabricated preview ' +
        'would be the panel inventing the thing it exists to show',
      ok(() => nowhereView.view.address === null && nowhereView.view.message === null)
    );

    // ── The three presses ────────────────────────────────────────────────────
    const rowsBefore = await prisma.outboundMessage.count({ where: { eventId: event.id } });
    const ledgerBefore = await prisma.auditEntry.count({ where: { eventId: event.id } });

    const again = await press(bounced.person.id, { action: 'AGAIN' });
    assert(
      'SEND AGAIN is accepted on a bounced row',
      ok(() => again.ok === true)
    );
    const bouncedRows = await prisma.outboundMessage.findMany({
      where: { personEventId: bounced.pe.id },
      orderBy: { createdAt: 'asc' },
    });
    assert(
      '⚠ IT WRITES ONE NEW ROW, NOT A RETRY OF THE OLD ONE: a retry is the machine trying the ' +
        'same message again; ruling U’s three actions are the HOST trying again, and each is a ' +
        'NEW row (the schema says so where it refuses @@unique([personEventId, kind]))',
      bouncedRows.length === 2
    );
    assert(
      'the new row is unattempted, unclaimed, and carries no end state — the drain has not run',
      ok(() => {
        const fresh = bouncedRows[1];
        return (
          fresh.attemptedAt === null &&
          fresh.acceptedAt === null &&
          fresh.rejectedAt === null &&
          fresh.withheldAt === null &&
          fresh.attemptCount === 0 &&
          fresh.kind === 'ASK' &&
          fresh.channel === 'EMAIL'
        );
      })
    );
    assert(
      'and the OLD row is untouched — its rejection is history, not something the door edits',
      ok(() => bouncedRows[0].rejectedAt !== null && bouncedRows[0].providerError !== null)
    );
    assert(
      '⚠ THE RED CLEARS AT ONCE, AND IT IS HONEST BY AMBER’S OWN DEFINITION: the newest row is ' +
        'the fact (7a’s `latestRowByMembership`), it carries no failure, so the person reads ' +
        'amber — Gather HAS a next move and the row is waiting for the cron',
      ok(() => {
        const latest = deliveryFact.latestRowByMembership(bouncedRows);
        return deliveryFact.deliveryFactFrom(latest.get(bounced.pe.id)).failure === null;
      })
    );
    assert(
      'CONTROL: the same reader over the rows AS THEY WERE says NOT_DELIVERED — so the ' +
        'assertion above measures the door and not the reader',
      ok(
        () =>
          deliveryFact.deliveryFactFrom(
            deliveryFact.latestRowByMembership([bouncedRows[0]]).get(bounced.pe.id)
          ).failure === 'NOT_DELIVERED'
      )
    );

    const againAgain = await press(delivered.person.id, { action: 'AGAIN' });
    assert(
      '⚠ THE DOOR’S OWN IDEMPOTENCY: pressing on a membership whose latest row is not a failure ' +
        'is refused. Without it a second click is a second message to somebody who got theirs',
      ok(() => againAgain.ok === false && againAgain.code === 'NOTHING_FAILED')
    );
    const twice = await press(bounced.person.id, { action: 'AGAIN' });
    assert(
      '⚠ AND IT IS ONE PRESS PER FAILURE, WHICH IS THE SAME GUARD SEEN FROM THE FRONT: the row ' +
        'she just queued is now the latest and it has not failed, so the door CLOSES until it ' +
        'does. She cannot stack three actions on one dead address',
      ok(() => twice.ok === false && twice.code === 'NOTHING_FAILED')
    );

    const empty = await press(withPhone.person.id, { action: 'EDIT', email: '   ' });
    assert(
      'an empty address is refused before anything is written',
      ok(() => empty.ok === false && empty.code === 'ADDRESS_REQUIRED')
    );

    const textFenced = await press(withPhone.person.id, { action: 'PHONE' }, fenced);
    assert(
      '⚠ FOUNDER ANSWER 1 AT THE PRESS: with SMS unconfigured the third action is refused, ' +
        'not merely hidden — the surface may be stricter than the route, never looser',
      ok(() => textFenced.ok === false && textFenced.code === 'TEXTING_UNAVAILABLE')
    );
    const textOptedOut = await press(optedOut.person.id, { action: 'PHONE' }, seam);
    assert(
      '⚠ ZONE 7 AT THE PRESS: an opted-out phone is refused with its own why, even with the ' +
        'fence open',
      ok(() => textOptedOut.ok === false && textOptedOut.code === 'PHONE_OPTED_OUT')
    );
    const textAussie = await press(aussie.person.id, { action: 'PHONE' }, seam);
    assert(
      '⚠ [[GTC-300]] AT THE PRESS: a +61 number is refused PHONE_UNUSABLE, because the door asks ' +
        'the predicate that owns that defect rather than deciding for itself',
      ok(() => textAussie.ok === false && textAussie.code === 'PHONE_UNUSABLE')
    );
    const textNoPhone = await press(noPhone.person.id, { action: 'PHONE' }, seam);
    assert(
      '⚠ AND THE PERSON’S OWN FACT IS SAID BEFORE OURS: somebody with no number at all is told ' +
        'they have none, not that Gather cannot text at the moment — a temporary operator ' +
        'failure must not stand in front of a permanent fact about the guest',
      ok(() => textNoPhone.ok === false && textNoPhone.code === 'NO_PHONE')
    );
    const textNoPhoneFenced = await press(noPhone.person.id, { action: 'PHONE' }, fenced);
    assert(
      'CONTROL: and the same person answers NO_PHONE with the fence CLOSED too, so the ' +
        'assertion above is about the order and not about the seam',
      ok(() => textNoPhoneFenced.ok === false && textNoPhoneFenced.code === 'NO_PHONE')
    );
    const texted = await press(withPhone.person.id, { action: 'PHONE' }, seam);
    assert(
      'SEND TO THE PHONE is accepted when the fence is open',
      ok(() => texted.ok === true)
    );
    const phonerRows = await prisma.outboundMessage.findMany({
      where: { personEventId: withPhone.pe.id },
      orderBy: { createdAt: 'asc' },
    });
    assert(
      '⚠ AND THE OVERRIDE IS ON THE ROW: channel TEXT for a person the chooser routes EMAIL. ' +
        'The drain branches on the STORED channel, so the row IS the override and is the only ' +
        'place it is recorded',
      ok(() => phonerRows.length === 2 && phonerRows[1].channel === 'TEXT')
    );

    const newAddress = `${TAG.toLowerCase()}+moved+${stamp}@example.com`;
    const edited = await press(optedOut.person.id, { action: 'EDIT', email: newAddress });
    assert(
      'EDIT AND SEND is accepted',
      ok(() => edited.ok === true)
    );
    const movedPerson = await prisma.person.findUnique({ where: { id: optedOut.person.id } });
    assert('the address is written', movedPerson?.email === newAddress);
    assert(
      'and a row is written with it, in the same transaction — “the address changed and no ' +
        'message was queued” is not a reachable state',
      (await prisma.outboundMessage.count({ where: { personEventId: optedOut.pe.id } })) === 2
    );

    const ledgerAfter = await prisma.auditEntry.count({ where: { eventId: event.id } });
    const contactEntries = await prisma.auditEntry.count({
      where: { eventId: event.id, actionType: 'EDIT_PERSON_CONTACT' },
    });
    assert(
      '⚠ FOUNDER ANSWER 5 — EDIT-AND-SEND WRITES A LEDGER ENTRY. The press starts the audit ' +
        'trail and this changes a guest’s contact detail inside the versioned window',
      contactEntries === 1
    );
    assert(
      'and exactly one entry across three accepted presses — the row is the record of a SEND, ' +
        'so send-again and send-to-phone write no ledger entry of their own',
      ledgerAfter - ledgerBefore === 1
    );
    const rowsAfter = await prisma.outboundMessage.count({ where: { eventId: event.id } });
    assert(
      'CONTROL: rows moved while the ledger barely did, so the count above is measuring the ' +
        'ledger rule rather than an empty fixture',
      rowsAfter - rowsBefore === 3
    );
    assert(
      '⚠ AND THE PATCH ROUTE IS LEFT ALONE (founder answer 5): it still records no ledger entry ' +
        'for an email change. Two histories for the same edit is worse than one that starts ' +
        'where the trail does, and closing that gap is that route’s own ticket',
      ok(() => !stripComments(read(PATCH_ROUTE)).includes('EDIT_PERSON_CONTACT'))
    );

    /*
     * ⚠ FOUNDER ANSWER 3, AFTER [[GTC-293]]. 7b refused an address another Person held with
     * ADDRESS_TAKEN, because `Person.email` was `@unique`. GTC-293 dropped the constraint, and
     * the founder ruled this suite asserts the new truth (Q5, 2026-09-29): the host's obvious
     * fix for a dead address — the partner's — is accepted. Pressed AFTER the counts above, so
     * they go on measuring their own three presses.
     */
    const shared = await press(contact.person.id, { action: 'EDIT', email: rival.person.email! });
    assert(
      '⚠ FOUNDER ANSWER 3, AFTER [[GTC-293]] — EDIT AND SEND onto an address another Person ' +
        'holds (the partner’s) is ACCEPTED, not refused',
      ok(() => shared.ok === true)
    );
    const contactAfter = await prisma.person.findUnique({ where: { id: contact.person.id } });
    assert('the address is written to the contact', contactAfter?.email === rival.person.email);
    assert(
      'and one row is queued with it, in the same transaction',
      (await prisma.outboundMessage.count({ where: { personEventId: contact.pe.id } })) === 2
    );
    const rivalAfter = await prisma.person.findUnique({ where: { id: rival.person.id } });
    assert(
      'the other holder is unchanged — their address and their name',
      rivalAfter?.email === rival.person.email && rivalAfter?.name === rival.person.name
    );
    assert(
      'CONTROL: two Persons now hold the address, so this is the shared case and not a typo ' +
        'in the fixture',
      (await prisma.person.count({ where: { email: rival.person.email! } })) === 2
    );

    // ── Layer D: the route ───────────────────────────────────────────────────
    section('Layer D: one route, session-guarded, GET for the look and POST for the press');

    assert(`${DOOR_ROUTE} exists`, read(DOOR_ROUTE).length > 0);
    const routeSrc = stripComments(read(DOOR_ROUTE));
    assert(
      'it is HOST only — the press is the host’s, and so is trying again',
      ok(() => /requireEventRole\([^)]*\[\s*'HOST'\s*\]/.test(routeSrc))
    );
    assert('the GET serves the last look', routeSrc.includes('export async function GET'));
    assert('the POST does the press', routeSrc.includes('export async function POST'));
    assert(
      'the route writes nothing itself — readDoor and resendToPerson are the only mechanism',
      ok(
        () =>
          routeSrc.includes('readDoor') &&
          routeSrc.includes('resendToPerson') &&
          !routeSrc.includes('outboundMessage')
      )
    );
    assert(
      '⚠ AND IT WORDS NO DOOR REFUSAL ITSELF: every one comes from the shared Record, and not ' +
        'one of that Record’s sentences is spelled in this file. A refusal worded twice is a ' +
        'refusal that goes stale in one of the two places — 5f’s R2 mutation is the same lesson ' +
        'from the screen’s side',
      ok(() => {
        const sentences = Object.values(door.RESEND_REFUSAL_WORDS) as string[];
        return (
          routeSrc.includes('RESEND_REFUSAL_WORDS[') &&
          sentences.length > 0 &&
          !sentences.some((sentence) => routeSrc.includes(sentence))
        );
      })
    );

    // Counted here rather than from `rowsBefore`: [[GTC-293]]'s accepted press on the
    // partner's address sits between the two, and this control is about the probe alone.
    const beforeProbe = await prisma.outboundMessage.count({ where: { eventId: event.id } });
    const noCookieGet = await fetch(
      `${BASE}/api/events/${event.id}/people/${bounced.person.id}/resend`
    );
    assert(
      'GET with no cookie is refused — 401/403, never a door',
      noCookieGet.status === 401 || noCookieGet.status === 403
    );
    const noCookiePost = await fetch(
      `${BASE}/api/events/${event.id}/people/${bounced.person.id}/resend`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'AGAIN' }),
      }
    );
    assert(
      'POST with no cookie is refused, and nothing is written',
      noCookiePost.status === 401 || noCookiePost.status === 403
    );
    const afterProbe = await prisma.outboundMessage.count({ where: { eventId: event.id } });
    assert('CONTROL: the unauthenticated probe wrote no row', afterProbe === beforeProbe);

    // ── Layer E: the fences ──────────────────────────────────────────────────
    section('Layer E: the fences this door must not walk through');

    const wordsSrc = stripComments(read(DOOR_WORDS_MODULE));
    /*
     * ⚠ EVERY IMPORT IN THIS MODULE IS `import type`, WHICH IS ERASED. That is the whole fence:
     * a VALUE imported from the server module would pull Prisma into the browser bundle, which is
     * why `press-words.ts` exists as a separate file from `press.ts` and why this one exists as a
     * separate file from `resend.ts`.
     */
    assert(
      '⚠ THE WORDS MODULE HOLDS NO DATABASE HANDLE AND NO PROVIDER — it is imported by a client ' +
        'component, and importing a VALUE from the server module would pull Prisma into the ' +
        'browser bundle. The same fence `press-words.ts` carries',
      ok(() => {
        if (wordsSrc.length === 0) return false;
        const imports = [...wordsSrc.matchAll(/^import\s+(type\s+)?[^;]*from\s+'([^']+)';/gm)];
        return (
          imports.length > 0 &&
          imports.every((m) => !!m[1]) &&
          !/PrismaClient|@\/lib\/prisma/.test(wordsSrc)
        );
      })
    );
    const actionsSrc = stripComments(read(ACTIONS));
    const surfaceSrc = stripComments(read(SURFACE));
    /*
     * ⚠ READ ON THE IMPORT SPECIFIERS, NOT ON THE PROSE. The fence next door in
     * `glance-actions-test.ts` matched the bare word `resend` until this slice — the EMAIL
     * PROVIDER'S BRAND NAME — and ruling U's door calls its own action "resend", so the anchor
     * had to move to survive its own subject. It moved STRICTER: whole modules rather than two
     * named functions.
     */
    const clientImports = [...(actionsSrc + surfaceSrc).matchAll(/from\s+'([^']+)'/g)].map(
      (m) => m[1]
    );
    assert(
      'the action layer and the panel still reach no provider and no database — they may reach ' +
        'the door’s WORDS and never its mechanism',
      ok(
        () =>
          clientImports.length > 0 &&
          !clientImports.some((spec) =>
            /^resend$|^twilio$|^@prisma\/client$|@\/lib\/prisma|@\/lib\/email|@\/lib\/press\/resend$/.test(
              spec
            )
          ) &&
          !/PrismaClient/.test(actionsSrc + surfaceSrc)
      )
    );
    assert(
      'CONTROL: the import reader really read — it found the client-safe door module these two ' +
        'files DO import, so the absence above is an absence and not an empty list',
      clientImports.includes('@/lib/press/resend-door')
    );
    assert(
      '⚠ MARKER INVERTED ON SCHEDULE: the action layer named exactly TWO /api/ paths until this ' +
        'slice; it now names FOUR — the third is the door, and the fourth GTC-251 251c’s hand-back ' +
        '(ruled 2026-09-30). The invariant is unchanged — how many endpoints this surface can reach',
      ok(() => {
        const paths = [...actionsSrc.matchAll(/`\/api\/[^`]*`/g)].map((m) => m[0]);
        return (
          paths.length === 4 &&
          paths.some((p) => /people\/\$\{[^}]+\}\/nudge/.test(p)) &&
          paths.some((p) => /items\/\$\{[^}]+\}\/assign/.test(p)) &&
          paths.some((p) => /people\/\$\{[^}]+\}\/resend/.test(p)) &&
          paths.some((p) => /people\/\$\{[^}]+\}\/hand-back/.test(p))
        );
      })
    );
    assert(
      'ONE PATH FOR BOTH: the look and the press are the same endpoint, so the surface cannot ' +
        'read one door and press another',
      ok(() => {
        const paths = [...actionsSrc.matchAll(/`\/api\/[^`]*resend[^`]*`/g)];
        return paths.length === 1;
      })
    );
    assert(
      '⚠ FOUNDER ANSWER 6 — THE ADDRESS IS NOT ON THE BOARD’S PAYLOAD. §3 fixed that wire’s ' +
        'shape and a guest’s contact details have never been on it; the door fetches the field ' +
        'when it opens',
      ok(() => {
        const state = read(STATE);
        const person = state.slice(state.indexOf('export interface GlancePerson'));
        const body = person.slice(0, person.indexOf('\n}\n'));
        return body.length > 0 && !/\bemail\b|\bphoneNumber\b|\bphone\b/.test(stripComments(body));
      })
    );
    /*
     * [[GTC-340]] plan ruling Q1 — the panel reads its words through `doorWordFor`, which adds one
     * case ("Send to an email address" for a guest with no address). Founder, approving this edit:
     * also prove the words still come from the Record — for both reasons and all three actions,
     * with an address, `doorWordFor` returns exactly `DOOR_WORDS[reason][action]`.
     */
    assert(
      'the panel renders the DOOR’s words, through `doorWordFor` (the Record, plus [[GTC-340]] ' +
        'Q1’s one case), rather than prose written at the screen — 5f’s R2 lesson: the screen ' +
        'reads the code; and with an address, every word it gives is the Record’s, exactly',
      ok(
        () =>
          /doorWordFor\(\s*door\.reason\s*,\s*action\s*,\s*door\.address\s*\)/.test(surfaceSrc) &&
          (['NOT_DELIVERED', 'UNREACHABLE'] as const).every((reason) =>
            (['AGAIN', 'EDIT', 'PHONE'] as const).every(
              (action) =>
                door.doorWordFor(reason, action, 'guest@example.test') ===
                door.DOOR_WORDS[reason][action]
            )
          )
      )
    );
    /*
     * ⚠ REWRITTEN BECAUSE A MUTATION SURVIVED, AND IT IS 5f's R5 EXACTLY. This read
     * `/view\.address|door\.address/`, which the FETCH satisfies on its own — so blanking the
     * rendered input (`value={''}`) left the assertion green while the panel showed the host
     * nothing. *"Everything above asserted the WORDS EXIST in the module; the acceptance item is
     * that the script appears verbatim AT COMMITMENT, and the render is the requirement."*
     *
     * So both halves are asserted as a CHAIN from the served fact to the rendered element, and
     * the chain is what a mutation has to break: the address the route served seeds the state,
     * and that state is what the control renders.
     *
     * ⚠ AND IT IS STRUCTURAL BY NECESSITY, NAMED RATHER THAN GLOSSED. The panel is a client
     * island that renders only once opened, so no server-rendered HTML carries it and this suite
     * cannot drive it over HTTP. That is the ceiling here, and it is why the chain is asserted in
     * two links rather than one.
     */
    assert(
      '⚠ FOUNDER ANSWER 2 AT THE SCREEN, HALF ONE: the address the route served is what the ' +
        'control RENDERS — seeded from the view, bound to the input',
      ok(
        () =>
          /setAddress\(\s*result\.view\.address/.test(surfaceSrc) &&
          /value=\{address\}/.test(surfaceSrc)
      )
    );
    assert(
      '⚠ FOUNDER ANSWER 2 AT THE SCREEN, HALF TWO: the message the route composed is what the ' +
        'panel SHOWS — the body itself, not a count of it or a note that one exists',
      ok(() => /\{door\.message\.text\}/.test(surfaceSrc))
    );
    assert(
      '⚠ AND IT IS NOT A COMPOSER. §3 refuses messaging on this surface: the message is SHOWN, ' +
        'and the only editable field on the panel is the address',
      ok(() => (surfaceSrc.match(/<textarea/g) ?? []).length === 0)
    );
    assert(
      'the door’s reasons are a subset of the reds the remind was withdrawn on, by ' +
        'construction — 7a wrote that list so 7b had one place to read it',
      ok(() => {
        const src = stripComments(read(ACTIONS));
        return /REMIND_WITHDRAWN\s*=\s*\[[^\]]*\.\.\.DOOR_REASONS/.test(src);
      })
    );
    assert(
      '⚠ AND THE RED THAT HAD NO ACTION AT ALL NOW HAS ONE: doorOffered is true for both new ' +
        'reds and false for a person who pulled out, who is not this door’s business',
      ok(
        () =>
          actions.doorOffered({ reasons: ['NOT_DELIVERED'] }) === true &&
          actions.doorOffered({ reasons: ['UNREACHABLE'] }) === true &&
          actions.doorOffered({ reasons: ['ATTENDANCE_NO'] }) === false &&
          actions.remindOffered({ reasons: ['NOT_DELIVERED'] }) === false
      )
    );
    assert(
      'the ledger placed its new action explicitly — a new ChangeAction is a compile error in ' +
        'whyTrigger, and this one is enumerated among the never-interrogated rather than ' +
        'defaulted',
      ok(() => {
        const src = read(LEDGER);
        return (
          src.includes("| 'EDIT_PERSON_CONTACT'") && src.includes("case 'EDIT_PERSON_CONTACT':")
        );
      })
    );
    /*
     * ⚠ ADDED BECAUSE A MUTATION SURVIVED. `recordChange(db, …)` in place of `recordChange(tx, …)`
     * passed every assertion in this suite: the entry is still written, the count is still one,
     * and nothing looked wrong. It is founder Q2's defect at the press, arriving here — *"a
     * recipient count written outside [the transaction] is a number that can disagree with the
     * rows it counts"* — and its consequence is a history claiming an address change that rolled
     * back.
     *
     * So the rule is asserted on the SOURCE rather than on the outcome, because the outcome only
     * differs on a failure this suite cannot induce without a fault-injection seam, and a seam
     * bought to prove one line is machinery nobody else needs. Every WRITE in the module is on
     * the transaction handle; every READ may be on either.
     */
    const resendSrc = stripComments(read(DOOR_MODULE));
    assert(
      '⚠ EVERY WRITE IS ON THE TRANSACTION, NOT THE BARE HANDLE: the address, the row and the ' +
        'ledger entry land together or not at all. A collision must leave neither a moved ' +
        'address nor a queued message, and a rolled-back edit must leave no history claiming it',
      ok(
        () =>
          resendSrc.includes('recordChange(tx,') &&
          resendSrc.includes('tx.person.update(') &&
          resendSrc.includes('tx.outboundMessage.create(') &&
          !/\bdb\.person\.update\(|\bdb\.outboundMessage\.create\(|recordChange\(db,/.test(
            resendSrc
          )
      )
    );
    assert(
      'CONTROL: and the module DOES read on the bare handle, so the assertion above is about ' +
        'writes rather than about the word `db` being absent',
      ok(() => /\bdb\.(event|personEvent|outboundMessage)\.find/.test(resendSrc))
    );
    assert(
      '⚠ THE FENCE READS THE SAME BRANCH `sendSms` TAKES, from the module that owns it — not a ' +
        'second copy of “which provider serves this number”',
      ok(() => read(SEND_SMS).includes('export function smsProviderConfiguredFor'))
    );
    assert(
      'and the door module names no env var of its own',
      ok(() => !/process\.env/.test(stripComments(read(DOOR_MODULE) + read(DOOR_WORDS_MODULE))))
    );
  } finally {
    // AuditEntry, PersonEvent, AccessToken and OutboundMessage all cascade from Event.
    await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } }).catch(() => {});
    await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\n\x1b[1m\x1b[33m=== Test Summary ===\x1b[0m`);
  console.log(`Total tests: ${passed + failed}`);
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
  if (failed > 0) process.exit(1);
  console.log(`\n\x1b[32m\x1b[1m✓ The bounce door holds\x1b[0m`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
