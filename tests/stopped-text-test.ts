/**
 * [[GTC-340]] — a text Gather's own setup stopped before it left reads red, "never got it".
 *
 * THE RULING (SCOPED 2026-10-01, Q1), verbatim as chosen: *"Red for both (Recommended)"* —
 * *"Texts join emails: red 'never got it', with 'Send it again'. It's true, the host can see who
 * missed out, and once the setup is fixed she can resend, or send to an email address instead.
 * Cost: on your Mac and in tests, where sending is always off, pressed guests read red, as email
 * guests already do."*
 *
 * So an ask row withheld `SMS_DISABLED` (no text provider for the number, or the live switch off)
 * reads `NOT_DELIVERED`, with slice 7b's door, as an email stopped by setup already does. Never
 * `UNREACHABLE`. The dispatcher still records a withholding; the red is the reading's.
 *
 * THE LAYERS:
 *  0  controls — the modules, a process that is not live, and the trap
 *  M  the map, pure — SMS_DISABLED alone maps to NOT_DELIVERED; every other code as it was
 *  B  the board — the new red, the order around it (answer, opt-out, host, mark), and plan
 *     rulings Q3 (the blocked guest's line) with its guard
 *  D  the door — what each guest is offered, in the panel's words (Q1), and the fence
 *  C  a carried child — the carrier's stopped text, and W1 as ruled at Q4
 *  R  [[GTC-335]]'s replay — the new red plays once, at `withheldAt`
 *
 * NOTHING IS SENT. The rows are written by hand: no drain, no cron (`cron-send-health` D1 proves
 * the drain writes `SMS_DISABLED` on a text ask). Provider keys are stripped before any module
 * loads, a FAKE TNZ token is set so the live switch alone is what closes the fence, and the
 * provider trap walls the process. Every row written here is this file's own, removed by id.
 *
 * Run: npx tsx tests/stopped-text-test.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ── The process, before any module that captures configuration is loaded ─────────────────────
for (const k of [
  'TNZ_AUTH_TOKEN',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
]) {
  delete process.env[k];
}
delete process.env.RESEND_API_KEY;
delete process.env.GATHER_LIVE_SENDS;
process.env.TNZ_AUTH_TOKEN = 'gtc340-fake-tnz-token';

const ROOT = join(__dirname, '..');
const TAG = 'GTC340';
const HOUR = 60 * 60 * 1000;
const BASE = 'http://localhost:3000';

// The ruled words, byte-exact.
const W1_KAY =
  "Their ask is in Kay's message, and it didn't arrive. You can send it again from Kay's card.";
const W2 = "I can't email this address anymore, so I'll text them instead.";
const Q3_WORDS = "I can't email this address anymore, and my text to them didn't arrive.";

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
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const show = (v: unknown) => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

async function main() {
  const trap = await import('./helpers/provider-trap');
  trap.installProviderTrap();
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  let DF: any = null;
  let R: any = null;
  let AC: any = null;
  let RS: any = null;
  let DOOR: any = null;
  let RE: any = null;
  let RW: any = null;
  let AP: any = null;
  let DIS: any = null;
  let SMS: any = null;
  let TNZ: any = null;
  let STRIP: any = null;
  try {
    DF = await import('../src/lib/glance/delivery-fact');
    R = await import('../src/lib/glance/read');
    AC = await import('../src/lib/glance/actions');
    RS = await import('../src/lib/press/resend');
    DOOR = await import('../src/lib/press/resend-door');
    RE = await import('../src/lib/glance/replay-entry');
    RW = await import('../src/lib/glance/rewind');
    AP = await import('../src/lib/preflight/ask-preview');
    DIS = await import('../src/lib/press/dispatch');
    SMS = await import('../src/lib/sms/send-sms');
    TNZ = await import('../src/lib/sms/tnz-client');
    STRIP = await import('../src/components/glance/strip');
  } catch (err) {
    console.error(`\x1b[31m!\x1b[0m module load failed: ${(err as Error).message.split('\n')[0]}`);
  }

  const created = {
    events: [] as string[],
    persons: [] as string[],
    addresses: [] as string[],
  };

  const now = new Date();
  const ago = (h: number) => new Date(now.getTime() - h * HOUR);
  const sentAt = ago(240);
  const stamp = Date.now();

  try {
    // ══ LAYER 0 — controls ═══════════════════════════════════════════════════════════════════
    assert(
      '0',
      'every module this suite reads loads',
      [DF, R, AC, RS, DOOR, RE, RW, AP, DIS, SMS, TNZ, STRIP].every((m) => m !== null)
    );
    assert(
      '0',
      'this process is not live: the switch is unset, the fake TNZ token makes TNZ configured, and ' +
        'the fence still answers false for a +64 number — the switch alone closes it',
      ok(
        () =>
          !Object.prototype.hasOwnProperty.call(process.env, 'GATHER_LIVE_SENDS') &&
          TNZ.isTnzEnabled() === true &&
          SMS.smsProviderConfiguredFor('+64211340001') === false
      )
    );

    // ══ LAYER M — the map, pure ══════════════════════════════════════════════════════════════
    const MAP = DF?.WITHHELD_MEANS_UNREACHABLE ?? {};
    const UNREACHABLE_CODES = [
      'EMAIL_BLOCKED',
      'EMAIL_BLOCKED_SMS_OPTED_OUT',
      'NO_CHANNEL',
      'SMS_OPTED_OUT',
      'OPTED_OUT',
      'PHONE_UNUSABLE',
      'INVALID_NUMBER',
    ];
    assert(
      'M',
      "SMS_DISABLED maps to 'NOT_DELIVERED' — the founder's ruling, in the one place the press's " +
        'vocabulary becomes the board’s',
      MAP.SMS_DISABLED === 'NOT_DELIVERED'
    );
    assert(
      'M',
      'and it is the ONLY code mapped to NOT_DELIVERED, read off the Record itself',
      ok(
        () =>
          show(
            Object.entries(MAP)
              .filter(([, v]) => v === 'NOT_DELIVERED')
              .map(([k]) => k)
          ) === show(['SMS_DISABLED'])
      ),
      show(Object.entries(MAP).filter(([, v]) => v === 'NOT_DELIVERED'))
    );
    assert(
      'M',
      'every other code keeps its value: the same seven UNREACHABLE (so bounce-door’s property ' +
        'still counts 7), the other seventeen null, twenty-five keys in all',
      ok(() => {
        const keys = Object.keys(MAP);
        if (keys.length !== 25) return false;
        return keys
          .filter((k) => k !== 'SMS_DISABLED')
          .every((k) => MAP[k] === (UNREACHABLE_CODES.includes(k) ? 'UNREACHABLE' : null));
      })
    );
    assert(
      'M',
      'by name, still null: PREDATES_SENDER (GTC-322 and GTC-325’s open question), and NO_REPLY_TO, ' +
        'NO_LINK, NOT_THIS_RECIPIENT and HOST_OWN_ASK — none of them a setup stop',
      ['PREDATES_SENDER', 'NO_REPLY_TO', 'NO_LINK', 'NOT_THIS_RECIPIENT', 'HOST_OWN_ASK'].every(
        (k) => Object.prototype.hasOwnProperty.call(MAP, k) && MAP[k] === null
      )
    );
    const FACT_AT = ago(10);
    const stoppedText = {
      id: 'r-text',
      personEventId: 'pe-text',
      createdAt: sentAt,
      rejectedAt: null,
      withheldAt: FACT_AT,
      withheldWhy: 'SMS_DISABLED',
      deliveryState: null,
      deliveryCheckedAt: null,
    };
    const stoppedEmail = {
      ...stoppedText,
      id: 'r-email',
      personEventId: 'pe-email',
      withheldAt: null,
      withheldWhy: null,
      rejectedAt: FACT_AT,
    };
    assert(
      'M',
      'a TEXT ask row withheld SMS_DISABLED reads NOT_DELIVERED',
      ok(() => DF.deliveryFactFrom(stoppedText).failure === 'NOT_DELIVERED')
    );
    assert(
      'M',
      'an email stopped by setup (a rejection with no provider code) reads NOT_DELIVERED, as before',
      ok(() => DF.deliveryFactFrom(stoppedEmail).failure === 'NOT_DELIVERED')
    );
    assert(
      'M',
      "[[GTC-335]]: the stopped text's failure is recorded at its withheldAt",
      ok(() => DF.deliveryFailureRecordedAt(stoppedText)?.getTime() === FACT_AT.getTime())
    );
    assert(
      'M',
      "the red and [[GTC-339]]'s failure report agree: WITHHELD_COUNTS_FOR_HEALTH.SMS_DISABLED is true",
      ok(() => DIS.WITHHELD_COUNTS_FOR_HEALTH.SMS_DISABLED === true)
    );

    // ══ Fixtures ═════════════════════════════════════════════════════════════════════════════
    async function mkEvent(label: string) {
      const host = await prisma.person.create({
        data: {
          name: `${label} Host`,
          email: `gtc340+${label.toLowerCase()}+host+${stamp}@example.test`,
        },
      });
      created.persons.push(host.id);
      const ev = await prisma.event.create({
        data: {
          name: `${TAG} ${label}`,
          startDate: new Date(now.getTime() + 150 * HOUR),
          endDate: new Date(now.getTime() + 200 * HOUR),
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

    let phoneSeq = 0;
    const phone = () => `+642113400${String(10 + phoneSeq++).padStart(2, '0')}`;

    async function mkMember(
      e: Ev,
      name: string,
      o: {
        email?: string | null;
        phone?: string | null;
        householdId?: string | null;
        householdRole?: string;
        mark?: 'DONT_CHASE' | null;
        items?: number;
        response?: 'PENDING' | 'ACCEPTED';
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
                : `gtc340+${name.split(' ')[0].toLowerCase()}+${e.ev.id.slice(-6)}+${stamp}@example.test`,
          phoneNumber: o.phone ?? null,
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
          sentAt: child ? null : sentAt,
        },
      });
      let assignmentId: string | null = null;
      for (let i = 0; i < (o.items ?? 1); i++) {
        const item = await prisma.item.create({
          data: { teamId: e.team.id, name: `${name}'s dish ${i + 1}`, kind: 'ITEM' },
        });
        const a = await prisma.assignment.create({
          // Held before any `since` here: a row born after she looked is `absentAt`, not PENDING.
          data: {
            itemId: item.id,
            personId: p.id,
            response: o.response ?? 'PENDING',
            createdAt: ago(300),
          },
        });
        assignmentId = a.id;
      }
      if (!child) {
        await prisma.accessToken.create({
          data: {
            token: `${TAG}-${pe.id}-${stamp}`,
            scope: 'PARTICIPANT',
            eventId: e.ev.id,
            personId: p.id,
          },
        });
      }
      return { p, pe, assignmentId };
    }
    type Member = Awaited<ReturnType<typeof mkMember>>;

    /** The row the drain writes when `sendSms` answers SMS_DISABLED: a text, withheld. */
    async function stoppedTextRow(e: Ev, personEventId: string, at: Date = sentAt) {
      await prisma.outboundMessage.create({
        data: {
          eventId: e.ev.id,
          personEventId,
          kind: 'ASK',
          channel: 'TEXT',
          createdAt: sentAt,
          withheldAt: at,
          withheldWhy: 'SMS_DISABLED',
        },
      });
    }
    async function pendingTextRow(e: Ev, personEventId: string) {
      await prisma.outboundMessage.create({
        data: { eventId: e.ev.id, personEventId, kind: 'ASK', channel: 'TEXT', createdAt: sentAt },
      });
    }
    async function emailRow(e: Ev, personEventId: string, o: Record<string, unknown> = {}) {
      await prisma.outboundMessage.create({
        data: {
          eventId: e.ev.id,
          personEventId,
          kind: 'ASK',
          channel: 'EMAIL',
          createdAt: sentAt,
          attemptedAt: sentAt,
          attemptCount: 1,
          acceptedAt: sentAt,
          provider: 'resend',
          providerMessageId: `${TAG}-${personEventId}-${Math.random()}`,
          ...o,
        } as any,
      });
    }
    async function block(address: string, reason: 'BOUNCED' | 'COMPLAINED', e: Ev) {
      const a = address.toLowerCase();
      await prisma.emailBlock.create({ data: { address: a, reason, eventId: e.ev.id } });
      created.addresses.push(a);
    }

    // ── Event B: the board, the door and the carried child ──
    const eB = await mkEvent('B');
    const tex = await mkMember(eB, 'Tex Textonly', { email: null, phone: phone() });
    await stoppedTextRow(eB, tex.pe.id);
    const ivy = await mkMember(eB, 'Ivy Itemless', { email: null, phone: phone(), items: 0 });
    await stoppedTextRow(eB, ivy.pe.id);
    const em = await mkMember(eB, 'Em Emailstopped');
    await emailRow(eB, em.pe.id, {
      acceptedAt: null,
      providerMessageId: null,
      rejectedAt: sentAt,
      providerError: 'Not sent: live sending is off',
    });
    const ann = await mkMember(eB, 'Ann Answered', {
      email: null,
      phone: phone(),
      response: 'ACCEPTED',
    });
    await stoppedTextRow(eB, ann.pe.id);
    const opt = await mkMember(eB, 'Opt Optedout', { phone: phone() });
    await stoppedTextRow(eB, opt.pe.id);
    await prisma.emailOptOut.create({ data: { personId: opt.p.id, eventId: eB.ev.id } });
    const rep = await mkMember(eB, 'Rep Reported', { phone: phone() });
    await stoppedTextRow(eB, rep.pe.id);
    await block(rep.p.email!, 'COMPLAINED', eB);
    await stoppedTextRow(eB, eB.hostPe.id);
    const mark = await mkMember(eB, 'Mark Marked', {
      email: null,
      phone: phone(),
      mark: 'DONT_CHASE',
    });
    await stoppedTextRow(eB, mark.pe.id);
    const bex = await mkMember(eB, 'Bex Blocked', { phone: phone() });
    await stoppedTextRow(eB, bex.pe.id);
    await block(bex.p.email!, 'BOUNCED', eB);
    // The guard (plan ruling Q3): her EMAIL ask bounced, the bounce blocked the address, and she
    // holds a mobile. No text was ever sent to her, so she keeps today's line.
    const bo = await mkMember(eB, 'Bo Bounced', { phone: phone() });
    await emailRow(eB, bo.pe.id, { deliveryState: 'BOUNCED', deliveryCheckedAt: sentAt });
    await block(bo.p.email!, 'BOUNCED', eB);
    const pen = await mkMember(eB, 'Pen Pending', { email: null, phone: phone() });
    await pendingTextRow(eB, pen.pe.id);
    const tex2 = await mkMember(eB, 'Tia Textagain', { email: null, phone: phone() });
    await stoppedTextRow(eB, tex2.pe.id);
    const tex3 = await mkMember(eB, 'Tom Toemail', { email: null, phone: phone() });
    await stoppedTextRow(eB, tex3.pe.id);
    // A carried household: Kay is a text-only contact whose text was stopped; Kit is carried.
    const hhK = await prisma.household.create({ data: { eventId: eB.ev.id } });
    const kay = await mkMember(eB, 'Kay Carrier', {
      email: null,
      phone: phone(),
      householdId: hhK.id,
      householdRole: 'PRIMARY_CONTACT',
    });
    await prisma.household.update({
      where: { id: hhK.id },
      data: { contactPersonEventId: kay.pe.id },
    });
    await stoppedTextRow(eB, kay.pe.id);
    const kit = await mkMember(eB, 'Kit Kid', { householdId: hhK.id, householdRole: 'CHILD' });

    const everyone = (g: any): any[] =>
      g ? [...g.households.flatMap((h: any) => h.members), ...g.unhoused] : [];
    let gB: any = null;
    try {
      gB = await R.readEventGlance(prisma, eB.ev.id, now);
    } catch (err) {
      console.error(`readEventGlance(B) threw: ${(err as Error).message.split('\n')[0]}`);
    }
    const P = (m: { pe: { id: string } }, g: any = gB): any =>
      everyone(g).find((p: any) => p.personEventId === m.pe.id) ?? null;
    const reads = (m: { pe: { id: string } }, state: string, reasons: string[]) =>
      ok(() => P(m).state === state && show(P(m).reasons) === show(reasons));

    // ══ LAYER B — the board ══════════════════════════════════════════════════════════════════
    assert(
      'B',
      'CONTROL: the board holds every fixture, and Pen — whose text is still queued — reads AMBER',
      ok(
        () =>
          [tex, ivy, em, ann, opt, rep, mark, bex, bo, pen, tex2, tex3, kay, kit].every(
            (m) => P(m) !== null
          ) &&
          P({ pe: eB.hostPe }) !== null &&
          P(pen).state === 'AMBER'
      )
    );
    assert(
      'B',
      'Tex — a text guest whose text Gather’s setup stopped — reads RED, reasons exactly [NOT_DELIVERED]',
      reads(tex, 'RED', ['NOT_DELIVERED']),
      show(P(tex) && { state: P(tex).state, reasons: P(tex).reasons })
    );
    assert(
      'B',
      'and never UNREACHABLE — "nowhere to send" is false of a guest holding a live number',
      ok(() => !P(tex).reasons.includes('UNREACHABLE'))
    );
    assert(
      'B',
      'Tex is offered the door',
      ok(() => AC.doorOffered(P(tex)) === true)
    );
    assert(
      'B',
      'and not the remind — slice 7a withdrew it on this red, and it would itself be stopped',
      ok(() => AC.remindOffered(P(tex)) === false)
    );
    assert(
      'B',
      'the strip says "never got it"',
      ok(() => STRIP.whyLineFor(P(tex)) === 'never got it')
    );
    assert(
      'B',
      'Ivy, holding nothing, reads RED [NOT_DELIVERED] — the itemless branch reads the fact too',
      reads(ivy, 'RED', ['NOT_DELIVERED'])
    );
    assert(
      'B',
      'Em, whose EMAIL setup stopped (rejected, no provider code), reads RED [NOT_DELIVERED] with the ' +
        'door, as before',
      reads(em, 'RED', ['NOT_DELIVERED']) && ok(() => AC.doorOffered(P(em)) === true)
    );
    assert(
      'B',
      'Ann answered: the answer shows (GREEN), whatever her text did',
      ok(() => P(ann).state === 'GREEN')
    );
    assert(
      'B',
      'Opt opted out of email for this event: the opted-out red, and NO door (GTC-305 ruling 3), ' +
        'though her text was stopped by setup',
      reads(opt, 'RED', ['EMAIL_OPTED_OUT']) && ok(() => AC.doorOffered(P(opt)) === false)
    );
    assert(
      'B',
      'Rep’s email reported this event: the same opted-out red, and NO door',
      reads(rep, 'RED', ['EMAIL_OPTED_OUT']) && ok(() => AC.doorOffered(P(rep)) === false)
    );
    assert(
      'B',
      'the host stays GREEN, though the fixture gives her a stopped text row',
      ok(() => P({ pe: eB.hostPe }).state === 'GREEN')
    );
    assert(
      'B',
      'a don’t-chase guest stays grey — Ruling 14’s mark displaces every red',
      reads(mark, 'NOT_CHASED', ['DONT_CHASE'])
    );
    assert(
      'B',
      'Bex — email blocked by the provider, texted instead, and the text stopped — reads RED ' +
        '[NOT_DELIVERED], "never got it", with the door',
      reads(bex, 'RED', ['NOT_DELIVERED']) &&
        ok(() => STRIP.whyLineFor(P(bex)) === 'never got it' && AC.doorOffered(P(bex)) === true)
    );
    assert(
      'B',
      'PLAN RULING Q3: Bex’s line says her text didn’t arrive — her failed ask row is a TEXT row',
      ok(() => P(bex).emailNote === Q3_WORDS),
      show(P(bex)?.emailNote)
    );
    assert(
      'B',
      'GUARD (Q3): Bo’s EMAIL ask bounced, the bounce blocked the address, she holds a mobile — RED ' +
        '[NOT_DELIVERED], and she keeps today’s line (no text was ever sent to her)',
      reads(bo, 'RED', ['NOT_DELIVERED']) && ok(() => P(bo).emailNote === W2),
      show(P(bo)?.emailNote)
    );

    // ══ LAYER D — the door ═══════════════════════════════════════════════════════════════════
    const notSetUp = { textingConfiguredFor: () => false };
    const setUp = { textingConfiguredFor: () => true };
    const view = (m: Member, deps: unknown) =>
      RS.readDoor(prisma, { eventId: eB.ev.id, personId: m.p.id, baseUrl: BASE }, deps);
    const press = (m: Member, action: string, deps: unknown = setUp, email?: string) =>
      RS.resendToPerson(
        prisma,
        {
          eventId: eB.ev.id,
          personId: m.p.id,
          baseUrl: BASE,
          actor: { id: eB.host.id, kind: 'HOST', name: eB.host.name },
          action,
          ...(email ? { email } : {}),
        },
        deps
      );
    /** The panel's words for a door: the Q1 rule once it exists, `DOOR_WORDS` as the panel reads it at HEAD. */
    const words = (v: any): string[] =>
      v.actions.map((a: string) =>
        typeof DOOR.doorWordFor === 'function'
          ? DOOR.doorWordFor(v.reason, a, v.address)
          : DOOR.DOOR_WORDS[v.reason][a]
      );
    const safe = async (fn: () => Promise<any>) => {
      try {
        return await fn();
      } catch (err) {
        return { threw: (err as Error).message.split('\n')[0] };
      }
    };

    assert(
      'D',
      'PLAN RULING Q1: a NOT_DELIVERED door whose guest has no address labels EDIT "Send to an ' +
        'email address"; with an address it stays "Send to a different address", and ruling M’s ' +
        'door keeps "Add a way to reach them" — and the panel renders through that rule',
      ok(
        () =>
          DOOR.doorWordFor('NOT_DELIVERED', 'EDIT', null) === 'Send to an email address' &&
          DOOR.doorWordFor('NOT_DELIVERED', 'EDIT', 'a@example.test') ===
            'Send to a different address' &&
          DOOR.doorWordFor('UNREACHABLE', 'EDIT', null) === 'Add a way to reach them' &&
          /doorWordFor\(/.test(code('src/components/glance/PersonSurface.tsx')) &&
          !/DOOR_WORDS\[/.test(code('src/components/glance/PersonSurface.tsx'))
      )
    );

    const texRowsBefore = await prisma.outboundMessage.count({
      where: { personEventId: tex.pe.id },
    });
    const bexRowsBefore = await prisma.outboundMessage.count({
      where: { personEventId: bex.pe.id },
    });

    const texClosed: any = await safe(() => view(tex, notSetUp));
    assert(
      'D',
      'Tex’s door, texting not set up, opens on NOT_DELIVERED: no address, and the message is the ' +
        'text ask (no subject)',
      ok(
        () =>
          texClosed.ok === true &&
          texClosed.view.reason === 'NOT_DELIVERED' &&
          texClosed.view.address === null &&
          texClosed.view.message !== null &&
          texClosed.view.message.subject === null &&
          texClosed.view.message.text.length > 0
      ),
      show(texClosed)
    );
    assert(
      'D',
      'and offers one action, in the panel’s words: "Send to an email address"',
      ok(
        () =>
          show(texClosed.view.actions) === show(['EDIT']) &&
          show(words(texClosed.view)) === show(['Send to an email address'])
      ),
      texClosed?.view ? show(words(texClosed.view)) : show(texClosed)
    );
    const texOpen: any = await safe(() => view(tex, setUp));
    assert(
      'D',
      'texting set up: "Send to an email address" and "Send it as a text"',
      ok(
        () =>
          show(texOpen.view.actions) === show(['EDIT', 'PHONE']) &&
          show(words(texOpen.view)) === show(['Send to an email address', 'Send it as a text'])
      ),
      texOpen?.view ? show(words(texOpen.view)) : show(texOpen)
    );
    const phoneFenced: any = await safe(() => press(tex, 'PHONE', notSetUp));
    assert(
      'D',
      '"Send it as a text" is refused TEXTING_UNAVAILABLE while texting isn’t set up',
      ok(() => phoneFenced.ok === false && phoneFenced.code === 'TEXTING_UNAVAILABLE'),
      show(phoneFenced)
    );
    const phoneSwitchOff: any = await safe(() => press(tex, 'PHONE', {}));
    assert(
      'D',
      'and refused TEXTING_UNAVAILABLE by the real fence with a provider configured and the live ' +
        'switch off',
      ok(() => phoneSwitchOff.ok === false && phoneSwitchOff.code === 'TEXTING_UNAVAILABLE'),
      show(phoneSwitchOff)
    );
    const againTex: any = await safe(() => press(tex, 'AGAIN'));
    assert(
      'D',
      '"Send it again" is refused NO_ADDRESS for a guest with no email',
      ok(() => againTex.ok === false && againTex.code === 'NO_ADDRESS'),
      show(againTex)
    );

    const bexClosed: any = await safe(() => view(bex, notSetUp));
    assert(
      'D',
      'Bex’s door, texting not set up: one action, "Send to a different address", over her ' +
        '(blocked) address',
      ok(
        () =>
          bexClosed.ok === true &&
          bexClosed.view.reason === 'NOT_DELIVERED' &&
          bexClosed.view.address === bex.p.email &&
          show(words(bexClosed.view)) === show(['Send to a different address'])
      ),
      show(bexClosed)
    );
    const bexOpen: any = await safe(() => view(bex, setUp));
    assert(
      'D',
      'texting set up: "Send to a different address" and "Send it as a text"',
      ok(
        () =>
          show(words(bexOpen.view)) === show(['Send to a different address', 'Send it as a text'])
      ),
      bexOpen?.view ? show(words(bexOpen.view)) : show(bexOpen)
    );
    const againBex: any = await safe(() => press(bex, 'AGAIN'));
    assert(
      'D',
      '"Send it again" is refused ADDRESS_BLOCKED for Bex',
      ok(() => againBex.ok === false && againBex.code === 'ADDRESS_BLOCKED'),
      show(againBex)
    );
    const phoneBex: any = await safe(() => press(bex, 'PHONE', notSetUp));
    assert(
      'D',
      'and "Send it as a text" is refused TEXTING_UNAVAILABLE while texting isn’t set up',
      ok(() => phoneBex.ok === false && phoneBex.code === 'TEXTING_UNAVAILABLE'),
      show(phoneBex)
    );
    assert(
      'D',
      'none of those refusals wrote a row',
      (await prisma.outboundMessage.count({ where: { personEventId: tex.pe.id } })) ===
        texRowsBefore &&
        (await prisma.outboundMessage.count({ where: { personEventId: bex.pe.id } })) ===
          bexRowsBefore
    );
    const emClosed: any = await safe(() => view(em, notSetUp));
    assert(
      'D',
      'Em’s door (email stopped by setup) is as before: "Send it again", "Send to a different address"',
      ok(
        () =>
          emClosed.ok === true &&
          show(words(emClosed.view)) === show(['Send it again', 'Send to a different address'])
      ),
      emClosed?.view ? show(words(emClosed.view)) : show(emClosed)
    );

    // The setup is fixed: Tia's text goes again; Tom's goes to an email address instead.
    const phoneOk: any = await safe(() => press(tex2, 'PHONE', setUp));
    const tex2Latest = DF.latestRowByMembership(
      await prisma.outboundMessage.findMany({ where: { personEventId: tex2.pe.id, kind: 'ASK' } })
    ).get(tex2.pe.id);
    assert(
      'D',
      'once texting is set up, "Send it as a text" is accepted: a TEXT row is queued and is now ' +
        'the latest',
      ok(
        () =>
          phoneOk.ok === true &&
          phoneOk.channel === 'TEXT' &&
          tex2Latest?.id === phoneOk.outboundMessageId &&
          tex2Latest?.withheldAt === null
      ),
      show(phoneOk)
    );
    const gAfter = await R.readEventGlance(prisma, eB.ev.id, now).catch(() => null);
    assert(
      'D',
      'and the board reads Tia AMBER — the red clears for a queued row',
      ok(() => P(tex2, gAfter).state === 'AMBER')
    );
    const newAddress = `gtc340+tom-new+${stamp}@example.test`;
    const editOk: any = await safe(() => press(tex3, 'EDIT', notSetUp, newAddress));
    const tex3After = await prisma.person.findUnique({ where: { id: tex3.p.id } });
    assert(
      'D',
      '"Send to an email address" is accepted with an address: an EMAIL row is queued and the ' +
        'address is written',
      ok(() => editOk.ok === true && editOk.channel === 'EMAIL' && tex3After?.email === newAddress),
      show(editOk)
    );

    // ══ LAYER C — a carried child ════════════════════════════════════════════════════════════
    const preview = await AP.readAskPreview(prisma, eB.ev.id, BASE).catch(() => null);
    assert(
      'C',
      'the chooser names Kay as the carrier of Kit’s ask',
      ok(() => DF.carrierOfAsk(preview.askRoutes[kit.pe.id]) === kay.pe.id),
      show(preview?.askRoutes?.[kit.pe.id])
    );
    assert(
      'C',
      'Kay, whose text was stopped by setup, reads RED [NOT_DELIVERED] with the door',
      reads(kay, 'RED', ['NOT_DELIVERED']) && ok(() => AC.doorOffered(P(kay)) === true)
    );
    assert(
      'C',
      'Kit, carried in that message, reads RED [NOT_DELIVERED]',
      reads(kit, 'RED', ['NOT_DELIVERED'])
    );
    assert(
      'C',
      'no door on Kit’s card',
      ok(() => AC.doorOffered(P(kit)) === false)
    );
    assert(
      'C',
      'Kit’s card says W1 as ruled at Q4 — "is in", because Kay’s message never went out',
      ok(() => P(kit).carrierNote === W1_KAY),
      show(P(kit)?.carrierNote)
    );
    const kitDoor: any = await safe(() => view(kit, setUp));
    assert(
      'C',
      'and the door refuses a child as a child: CHILD_NOT_MESSAGED',
      ok(() => kitDoor.ok === false && kitDoor.code === 'CHILD_NOT_MESSAGED'),
      show(kitDoor)
    );

    // ══ LAYER R — [[GTC-335]]'s replay ═══════════════════════════════════════════════════════
    const BEFORE = ago(20);
    const AFTER = ago(5);
    const eR = await mkEvent('R');
    const rex = await mkMember(eR, 'Rex Stopped', { email: null, phone: phone() });
    await stoppedTextRow(eR, rex.pe.id, ago(10));
    const eve = await mkMember(eR, 'Eve Earlier', { email: null, phone: phone() });
    await stoppedTextRow(eR, eve.pe.id, ago(18));
    const ace = await mkMember(eR, 'Ace Accepted');
    await emailRow(eR, ace.pe.id);
    await prisma.assignment.update({
      where: { id: ace.assignmentId! },
      data: { response: 'ACCEPTED' },
    });
    await prisma.auditEntry.create({
      data: {
        eventId: eR.ev.id,
        actorId: ace.p.id,
        actionType: 'ACCEPT_ASSIGNMENT',
        targetType: 'Assignment',
        targetId: ace.assignmentId!,
        details: '',
        timestamp: ago(15),
      },
    });
    const cam = await mkMember(eR, 'Cam Control', { email: null, phone: phone() });
    await pendingTextRow(eR, cam.pe.id);

    const glanceEventR = {
      status: 'CONFIRMING',
      sentAt,
      endDate: eR.ev.endDate,
      decideByOffsetHours: null,
      nudgePace: null,
    };
    const gR = await R.readEventGlance(prisma, eR.ev.id, now).catch(() => null);
    const replay = async (since: Date) => {
      try {
        return (await RE.readGlanceReplay(prisma, eR.ev.id, since, gR, glanceEventR, now))
          .steps as any[];
      } catch (err) {
        console.error(`readGlanceReplay threw: ${(err as Error).message.split('\n')[0]}`);
        return null;
      }
    };
    const rBefore = await replay(BEFORE);
    const rAfter = await replay(AFTER);
    const rNow = await replay(new Date(now.getTime() - 1000));
    const stepOf = (steps: any[] | null, m: Member) =>
      steps ? (steps.find((s) => s.personEventId === m.pe.id) ?? null) : 'unread';

    assert(
      'R',
      'CONTROL: Ace reads GREEN and Cam AMBER',
      ok(() => P(ace, gR).state === 'GREEN' && P(cam, gR).state === 'AMBER')
    );
    assert(
      'R',
      'Rex and Eve, whose texts were stopped by setup, read RED',
      ok(() => P(rex, gR).state === 'RED' && P(eve, gR).state === 'RED')
    );
    assert(
      'R',
      'recorded after `since`: Rex plays once, AMBER → RED',
      ok(() => {
        const s = stepOf(rBefore, rex);
        return s !== null && s !== 'unread' && s.from === 'AMBER' && s.to === 'RED';
      }),
      show(stepOf(rBefore, rex))
    );
    let movedAt: number | undefined;
    try {
      movedAt = (await RW.rewindGuestFacts(prisma, eR.ev.id, BEFORE)).movedSince.get(rex.pe.id);
    } catch {
      movedAt = undefined;
    }
    assert(
      'R',
      'and at the time Gather recorded it: the step is keyed on his withheldAt',
      movedAt === ago(10).getTime(),
      `${movedAt} vs ${ago(10).getTime()}`
    );
    assert(
      'R',
      'in the order things happened: Eve (18h ago), then Ace’s accept (15h), then Rex (10h)',
      ok(() => {
        const ids = rBefore!.map((s) => s.personEventId);
        const [e, a, r] = [ids.indexOf(eve.pe.id), ids.indexOf(ace.pe.id), ids.indexOf(rex.pe.id)];
        return e >= 0 && a >= 0 && r >= 0 && e < a && a < r;
      }),
      show(rBefore?.map((s) => s.personEventId))
    );
    assert(
      'R',
      'recorded before `since`: no step for Rex',
      rAfter !== null && stepOf(rAfter, rex) === null
    );
    assert(
      'R',
      'a second visit plays nothing: `since` = now − 1s yields no steps',
      rNow !== null && rNow.length === 0,
      show(rNow)
    );
    assert(
      'R',
      'CONTROL: Cam, still queued, plays no step',
      rBefore !== null && stepOf(rBefore, cam) === null
    );
  } finally {
    for (const eventId of created.events) {
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.outboundMessage.deleteMany({ where: { eventId } });
      await prisma.auditEntry.deleteMany({ where: { eventId } });
      await prisma.emailOptOut.deleteMany({ where: { eventId } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
    }
    if (created.addresses.length) {
      await prisma.emailBlock.deleteMany({ where: { address: { in: created.addresses } } });
    }
    if (created.persons.length) {
      await prisma.person.deleteMany({ where: { id: { in: created.persons } } });
    }
    const leftEvents = await prisma.event.count({ where: { id: { in: created.events } } });
    const leftPersons = await prisma.person.count({ where: { id: { in: created.persons } } });
    const leftBlocks = await prisma.emailBlock.count({
      where: { address: { in: created.addresses } },
    });
    assert(
      'S',
      `every fixture row was removed (${leftEvents} events, ${leftPersons} people, ${leftBlocks} blocks left)`,
      leftEvents === 0 && leftPersons === 0 && leftBlocks === 0
    );
    assert(
      '0',
      'nothing reached a provider: the trap counted zero hits',
      trap.trapCount() === 0,
      show(trap.trapHits())
    );
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`\n\x1b[31mRED — ${failed} assertion(s) failed:\x1b[0m`);
    for (const r of redAssertions) console.error(`  ✗ ${r}`);
    process.exit(1);
  }
  console.log('\x1b[32mGREEN — a text stopped by setup reads red, "never got it".\x1b[0m');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
