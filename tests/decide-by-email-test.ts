/**
 * GTC-251 slice 251b — the maybe's decide-by follow-up, by the chase's own chooser.
 *
 * Founder rulings: Q4 (2026-09-29) — *"Gather sends the same 'please decide' follow-up by email to
 * maybe-guests it can't text"*; Q4a (2026-09-30) — a guest who opted out of texts gets no follow-up
 * at all; 4.5 (2026-09-30) — ONE chooser for both legs, so (a) a marked guest's maybe no longer gets
 * the decide-by text and (b) a `+61` number is emailed until GTC-300; email is not held for quiet
 * hours (the chase's rule); W5, the email's words.
 *
 * THE LAYERS:
 *  A. the words — W5 byte-exact; the text leg's words unchanged
 *  B. the finder — who is a candidate, by which channel, and every refusal recorded
 *  C. the sender — the email goes through the guest-email sender (way out, footer, reply-to),
 *     re-reads the block before sending, stamps only on success; quiet hours hold texts only
 *  D. the security precondition (Zone 6, ruled 4.5) and the constants sentence
 *  S. structure — one chooser; Zones 7 and 9 and the schema unedited
 *
 * NOTHING IS SENT. `liveBehindTrap` walls the process and opens the switch for this process only;
 * `globalThis.fetch` is stubbed so Resend's request lands here; no SMS provider is configured, so a
 * text stops at `sendSms`. No cron is run. Every row written is this file's own, removed by id.
 *
 * Run: npx tsx tests/decide-by-email-test.ts
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { liveBehindTrap, trapCount } from './helpers/provider-trap';

const prisma = new PrismaClient();
const ROOT = join(__dirname, '..');
const TAG = 'GTC251B';
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

function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// W5, typed here rather than imported, so a changed constant fails rather than agreeing with itself.
const w5Subject = (event: string, host: string) => `${event} — from ${host}`;
const w5Body = (first: string, host: string, item: string, day: string, link: string) =>
  `Hi ${first} - Gather here, helping ${host} with this one. ` +
  `Still good for the ${item}? ${host} needs to know by ${day}. ` +
  `One tap to let ${host} know: ${link}`;

// ── The Resend stub ────────────────────────────────────────────────────────────────────────────
type Sent = {
  to: string[];
  subject: string;
  text: string;
  replyTo: string;
  from: string;
  headers: any;
};
let sent: Sent[] = [];
let rejectNext = false;
let nonResendCalls = 0;
const realFetch = globalThis.fetch;
function stub() {
  globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
    const u = String(url);
    if (u.includes('resend')) {
      const body = JSON.parse(init?.body ?? '{}');
      if (rejectNext) {
        return new Response(
          JSON.stringify({ name: 'validation_error', message: 'fixture refusal', statusCode: 422 }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        );
      }
      sent.push({
        to: [body.to ?? []].flat(),
        subject: body.subject,
        text: body.text,
        replyTo: body.reply_to ?? body.replyTo,
        from: body.from,
        headers: body.headers,
      });
      return new Response(JSON.stringify({ id: `${TAG}-${sent.length}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    nonResendCalls++;
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
}

async function main() {
  liveBehindTrap();
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  process.env.RESEND_API_KEY = `re_${TAG}_sentinel_key_000000000000`;
  process.env.UNSUBSCRIBE_TOKEN_SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET || `${TAG}-secret`;
  for (const k of [
    'TNZ_AUTH_TOKEN',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
  ])
    delete process.env[k];
  stub();

  let EL: any = null;
  let SE: any = null;
  let NT: any = null;
  let QH: any = null;
  let REG: any = null;
  try {
    EL = await import('../src/lib/sms/decide-by-eligibility');
    SE = await import('../src/lib/sms/decide-by-sender');
    NT = await import('../src/lib/sms/nudge-templates');
    QH = await import('../src/lib/sms/quiet-hours');
  } catch (err) {
    console.error(`\x1b[31m!\x1b[0m module load failed: ${(err as Error).message.split('\n')[0]}`);
  }
  try {
    REG = await import('../src/lib/messages/decide-by-register');
  } catch (err) {
    console.error(
      `\x1b[31m!\x1b[0m decide-by-register did not load: ${(err as Error).message.split('\n')[0]}`
    );
  }

  const created = {
    events: [] as string[],
    persons: [] as string[],
    users: [] as string[],
    addresses: [] as string[],
  };
  const before = {
    outbound: await prisma.outboundMessage.count(),
    inviteEvents: await prisma.inviteEvent.count(),
  };

  try {
    // ══ LAYER A — the words ══════════════════════════════════════════════════════════════
    assert(
      'A',
      'W5: the subject is the ask’s, "{event} — from {host}"',
      ok(
        () =>
          REG.composeDecideByEmail({
            recipientFirstName: 'Emma',
            hostFirstName: 'Kate',
            eventName: 'Christmas at Kate’s',
            itemName: 'pavlova',
            decideByDay: 'Friday',
            link: 'http://x/p/t',
          }).subject === w5Subject('Christmas at Kate’s', 'Kate')
      )
    );
    assert(
      'A',
      'W5: the body, byte-exact',
      ok(
        () =>
          REG.composeDecideByEmail({
            recipientFirstName: 'Emma',
            hostFirstName: 'Kate',
            eventName: 'Christmas at Kate’s',
            itemName: 'pavlova',
            decideByDay: 'Friday',
            link: 'http://x/p/t',
          }).text === w5Body('Emma', 'Kate', 'pavlova', 'Friday', 'http://x/p/t')
      )
    );
    assert(
      'A',
      'CONTROL: the text leg’s words are unchanged',
      ok(
        () =>
          NT.getDecideByFollowupMessage({
            hostFirstName: 'Kate',
            itemName: 'pavlova',
            decideByDay: 'Friday',
            link: 'http://x/p/t',
          }) ===
          'Still good for the pavlova? Kate needs to know by Friday. http://x/p/t\nReply STOP to opt out'
      )
    );

    // ══ Fixture ══════════════════════════════════════════════════════════════════════════
    // The decide-by D is 3 days out; the follow-up window is [D − 24h, D]. Two instants inside it:
    // one in NZ quiet hours and one outside, found rather than assumed.
    const now = new Date();
    const D = new Date(now.getTime() + 3 * DAY);
    const endDate = new Date(D.getTime() + 120 * HOUR);
    const sentAt = new Date(now.getTime() - 3 * DAY);
    let tQuiet: Date | null = null;
    let tAwake: Date | null = null;
    for (let h = 1; h < 24; h++) {
      const t = new Date(D.getTime() - h * HOUR);
      if (QH?.isQuietHours(t)) tQuiet = tQuiet ?? t;
      else tAwake = tAwake ?? t;
    }
    assert(
      'fixture',
      'the window holds a quiet-hours instant and a waking one',
      !!tQuiet && !!tAwake
    );
    const stamp = Date.now();
    const mail = (who: string) => `gtc251b+${who}+${stamp}@example.test`;

    async function mkEvent(label: string, withUser: boolean, pace: 'OFF' | null = null) {
      let userId: string | null = null;
      if (withUser) {
        const user = await prisma.user.create({ data: { email: mail(`${label}-host`) } });
        created.users.push(user.id);
        userId = user.id;
      }
      const host = await prisma.person.create({
        data: { name: `Kate ${label}`, email: withUser ? mail(`${label}-host`) : null, userId },
      });
      created.persons.push(host.id);
      const ev = await prisma.event.create({
        data: {
          name: `${TAG} ${label}`,
          startDate: endDate,
          endDate,
          hostId: host.id,
          status: 'CONFIRMING',
          sentAt,
          nudgePace: pace,
        },
      });
      created.events.push(ev.id);
      const team = await prisma.team.create({ data: { eventId: ev.id, name: 'Mains' } });
      await prisma.personEvent.create({
        data: { personId: host.id, eventId: ev.id, role: 'HOST' },
      });
      return { ev, team, host };
    }
    type Ev = Awaited<ReturnType<typeof mkEvent>>;

    async function mkMaybe(
      e: Ev,
      name: string,
      o: {
        email?: string | null;
        phone?: string | null;
        smsOptedOut?: boolean;
        mark?: 'DONT_CHASE' | null;
        exception?: 'HAND_TO_HOST' | null;
        householdId?: string | null;
        householdRole?: string | null;
      } = {}
    ) {
      const first = name.split(' ')[0].toLowerCase();
      const p = await prisma.person.create({
        data: {
          name,
          email: o.email === undefined ? mail(first) : o.email,
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
          householdRole: o.householdRole ?? null,
          nudgeMark: o.mark ?? null,
          chaseException: o.exception ?? null,
          sentAt,
        },
      });
      const token = `${TAG}-${pe.id}`;
      await prisma.accessToken.create({
        data: { token, scope: 'PARTICIPANT', eventId: e.ev.id, personId: p.id },
      });
      const item = await prisma.item.create({
        data: { teamId: e.team.id, name: 'pavlova', kind: 'ITEM' },
      });
      const a = await prisma.assignment.create({
        data: { itemId: item.id, personId: p.id, response: 'MAYBE' },
      });
      return { p, pe, token, assignmentId: a.id };
    }

    const main_ = await mkEvent('Main', true);
    const tex = await mkMaybe(main_, 'Tex Mobile', { phone: '+64211251001' });
    const emo = await mkMaybe(main_, 'Emma Emailonly');
    const aus = await mkMaybe(main_, 'Ava Aussie', { phone: '+61412251002' });
    const mar = await mkMaybe(main_, 'Mark Marked', { phone: '+64211251003', mark: 'DONT_CHASE' });
    const han = await mkMaybe(main_, 'Hana Handed', { exception: 'HAND_TO_HOST' });
    const sof = await mkMaybe(main_, 'Sol Flagonly', { phone: '+64211251004', smsOptedOut: true });
    const eoo = await mkMaybe(main_, 'Eli Unsubscribed');
    await prisma.emailOptOut.create({ data: { personId: eoo.p.id, eventId: main_.ev.id } });
    const blk = await mkMaybe(main_, 'Bo Blocked');
    const blkAddr = blk.p.email!.toLowerCase();
    await prisma.emailBlock.create({
      data: { address: blkAddr, reason: 'BOUNCED', eventId: main_.ev.id },
    });
    created.addresses.push(blkAddr);
    const late = await mkMaybe(main_, 'Lou Latebounce');
    const fai = await mkMaybe(main_, 'Fay Refused');
    const hh = await prisma.household.create({ data: { eventId: main_.ev.id } });
    const par = await mkMaybe(main_, 'Pat Parent', {
      householdId: hh.id,
      householdRole: 'PRIMARY_CONTACT',
    });
    await prisma.household.update({
      where: { id: hh.id },
      data: { contactPersonEventId: par.pe.id },
    });
    const kid = await mkMaybe(main_, 'Kit Child', {
      email: null,
      householdId: hh.id,
      householdRole: 'CHILD',
    });

    const offEv = await mkEvent('Off', true, 'OFF');
    const off = await mkMaybe(offEv, 'Otto Offevent');

    const nrEv = await mkEvent('Noreply', false);
    const nrp = await mkMaybe(nrEv, 'Nora Noreplyto');

    // ══ LAYER B — the finder ═════════════════════════════════════════════════════════════
    let cands: any = { eligible: [], skipped: [] };
    try {
      cands = await EL.findDecideByFollowupCandidates(tAwake!);
    } catch (err) {
      console.error(`\x1b[31m!\x1b[0m finder threw: ${(err as Error).message.split('\n')[0]}`);
    }
    const mine = (cands.eligible as any[]).filter((c) => created.events.includes(c.eventId));
    const cand = (m: { p: { id: string } }) => mine.find((c) => c.personId === m.p.id) ?? null;
    const reasons: string[] = (cands.skipped as any[]).map((s) => s.reason);
    const show = (m: any) => JSON.stringify(cand(m) ? { channel: cand(m).channel } : null);

    assert(
      'B',
      'an NZ mobile’s maybe is a candidate, by TEXT (the candidate now names its channel)',
      ok(() => cand(tex)?.channel === 'TEXT'),
      show(tex)
    );
    assert(
      'B',
      'Q4: an email-only maybe IS a candidate, by EMAIL',
      ok(() => cand(emo)?.channel === 'EMAIL'),
      show(emo)
    );
    assert(
      'B',
      '4.5(b): a +61 number with an email is emailed, as the chase does (until GTC-300)',
      ok(() => cand(aus)?.channel === 'EMAIL'),
      show(aus)
    );
    assert(
      'B',
      '4.5(a): a MARKED guest’s maybe is no longer followed up',
      cand(mar) === null,
      show(mar)
    );
    assert(
      'B',
      'a HANDED-OVER guest gets none (Q4: "the host’s and gets none")',
      cand(han) === null,
      show(han)
    );
    assert(
      'B',
      'Q4a: a text-opted-out guest gets none — and the flag alone is enough (Zone 7, read)',
      cand(sof) === null,
      show(sof)
    );
    assert(
      'B',
      'an email opt-out stops it (Zone 9, read through the chooser)',
      cand(eoo) === null,
      show(eoo)
    );
    assert(
      'B',
      'a blocked address stops it (Zone 9, read through the chooser)',
      cand(blk) === null,
      show(blk)
    );
    assert(
      'B',
      'CONTROL: a CHILD is still never followed up (GTC-306 owns that)',
      cand(kid) === null,
      show(kid)
    );
    assert(
      'B',
      'pace OFF does not stop a maybe’s follow-up — a maybe has no cadence (4.7)',
      ok(() => cand(off)?.channel === 'EMAIL'),
      show(off)
    );
    assert(
      'B',
      'no reply-to (the host has no account email) → not a candidate, and the skip says so',
      cand(nrp) === null && reasons.some((r) => /reply-to/i.test(r)),
      JSON.stringify(reasons)
    );
    assert(
      'B',
      'every refusal is RECORDED: the mark’s and the hand-over’s reasons are in the skips',
      reasons.includes("Host marked don't-chase (Moment 4 §10.3)") &&
        reasons.some((r) => /Handed to the host/.test(r)),
      JSON.stringify(reasons)
    );
    assert(
      'B',
      'an EMAIL candidate carries the address and the reply-to; a TEXT one the number',
      ok(
        () =>
          cand(emo).email === emo.p.email &&
          typeof cand(emo).replyTo === 'string' &&
          cand(tex).phoneNumber === '+64211251001'
      )
    );

    // ══ LAYER C — the sender ═════════════════════════════════════════════════════════════
    // Quiet hours: the email goes, the text waits. `late` is blocked between finding and sending
    // (the dispatcher's F5 fence, mirrored). `fai` is kept back for the refusal case.
    let quietCands: any[] = [];
    try {
      quietCands = ((await EL.findDecideByFollowupCandidates(tQuiet!)).eligible as any[]).filter(
        (c) => created.events.includes(c.eventId)
      );
    } catch {
      quietCands = [];
    }
    const lateAddr = late.p.email!.toLowerCase();
    await prisma.emailBlock.create({
      data: { address: lateAddr, reason: 'BOUNCED', eventId: main_.ev.id },
    });
    created.addresses.push(lateAddr);

    sent = [];
    let quietRun: any = null;
    try {
      quietRun = await SE.processDecideByFollowups(
        quietCands.filter((c) => c.personId !== fai.p.id),
        tQuiet!
      );
    } catch (err) {
      console.error(`\x1b[31m!\x1b[0m process threw: ${(err as Error).message.split('\n')[0]}`);
    }
    const to = (m: any) => sent.find((s) => s.to.includes(m.p.email)) ?? null;
    const stampOf = async (m: any) =>
      (
        await prisma.assignment.findUnique({
          where: { id: m.assignmentId },
          select: { decideByFollowupSentAt: true },
        })
      )?.decideByFollowupSentAt ?? null;

    assert(
      'C',
      'QUIET HOURS: the email-only maybe is emailed anyway (the chase’s rule)',
      !!to(emo)
    );
    assert(
      'C',
      'QUIET HOURS: the text waits (deferred, not sent)',
      ok(() => quietRun.deferred === 1)
    );
    assert(
      'C',
      'QUIET HOURS: the deferral is logged for the TEXT candidate only',
      (await prisma.inviteEvent.count({
        where: { eventId: main_.ev.id, type: 'NUDGE_DEFERRED_QUIET' },
      })) === 1
    );
    assert('C', 'the +61 guest and the OFF-event guest are emailed', !!to(aus) && !!to(off));
    assert(
      'C',
      'BLOCKED BETWEEN FINDING AND SENDING: not emailed (the block is re-read at send)',
      to(late) === null
    );
    assert(
      'C',
      'W5 as sent: the subject',
      ok(() => to(emo)!.subject === w5Subject(`${TAG} Main`, 'Kate'))
    );
    assert(
      'C',
      'W5 as sent: the body opens the email, byte-exact',
      ok(() => {
        const c = quietCands.find((x) => x.personId === emo.p.id);
        const day = NT.formatDecideByDay(c.decideByAt, tQuiet!);
        return to(emo)!.text.startsWith(
          w5Body('Emma', 'Kate', 'pavlova', day, `http://localhost:3000/p/${emo.token}`)
        );
      }),
      to(emo)?.text
    );
    assert(
      'C',
      'ZONE 9 / GTC-296: the way out and the contact line ride on it (the standard footer)',
      ok(
        () =>
          to(emo)!.text.includes("Don't want emails about this event?") &&
          to(emo)!.text.includes('Contact Gather: hello@gatheringtogether.co.nz')
      )
    );
    assert(
      'C',
      'the List-Unsubscribe headers are set',
      ok(
        () =>
          /^<.+>$/.test(to(emo)!.headers['List-Unsubscribe']) &&
          to(emo)!.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click'
      )
    );
    assert(
      'C',
      'replies go to the host (ruling F), and her name is the display name',
      ok(() => to(emo)!.replyTo === mail('Main-host') && /^Kate Main </.test(to(emo)!.from))
    );
    assert('C', 'STAMPED on success: the emailed maybe', (await stampOf(emo)) !== null);
    assert(
      'C',
      'NOT stamped: the deferred text, and the blocked-at-send email',
      (await stampOf(tex)) === null && (await stampOf(late)) === null
    );

    rejectNext = true;
    let refused: any = null;
    try {
      refused = await SE.processDecideByFollowups(
        quietCands.filter((c) => c.personId === fai.p.id),
        tQuiet!
      );
    } catch {
      refused = null;
    }
    rejectNext = false;
    assert(
      'C',
      'a provider refusal is not a success and stamps nothing',
      ok(() => refused.sent[0].success === false) && (await stampOf(fai)) === null
    );

    sent = [];
    let awake: any[] = [];
    try {
      awake = ((await EL.findDecideByFollowupCandidates(tAwake!)).eligible as any[]).filter((c) =>
        created.events.includes(c.eventId)
      );
    } catch {
      awake = [];
    }
    assert(
      'C',
      'ONCE: an emailed maybe is not a candidate again',
      !awake.some((c) => c.personId === emo.p.id)
    );
    let awakeRun: any = null;
    try {
      awakeRun = await SE.processDecideByFollowups(
        awake.filter((c) => c.personId === tex.p.id),
        tAwake!
      );
    } catch {
      awakeRun = null;
    }
    assert(
      'C',
      'the text leg, awake, goes to sendSms and stops at the provider gate — no stamp, nothing sent',
      ok(() => awakeRun.sent.length === 1 && awakeRun.sent[0].success === false) &&
        (await stampOf(tex)) === null &&
        sent.length === 0
    );

    // ══ LAYER D — the security precondition (Zone 6, ruled 4.5) ═════════════════════════════
    const sec = code('tests/security-validation.ts');
    const block = sec.slice(
      sec.indexOf('const decideByReachable'),
      sec.indexOf('const decideByReachable') + 700
    );
    assert(
      'D',
      'the precondition counts a maybe with a phone OR an email',
      /OR:\s*\[\s*\{\s*phoneNumber:\s*\{\s*not:\s*null\s*\}\s*\}\s*,\s*\{\s*email:\s*\{\s*not:\s*null\s*\}\s*\}\s*\]/.test(
        block
      ),
      block.slice(0, 400)
    );
    assert(
      'D',
      'and only on a sent, live event — exactly the sweep’s own population',
      /SENT_AND_LIVE\(/.test(block)
    );
    assert(
      'D',
      'the constants file’s live-layer sentence says the same',
      /after zero decide-by candidates[\s\S]{0,60}a phone\s+or an email/i.test(
        read('GATHER-BUILD-CONSTANTS.md')
      )
    );

    // ══ LAYER S — structure ══════════════════════════════════════════════════════════════
    const finder = code('src/lib/sms/decide-by-eligibility.ts');
    assert(
      'S',
      'ONE CHOOSER: the finder reads the chase route from readAskPreview',
      /readAskPreview\(/.test(finder) && /chase\.byMembership/.test(finder)
    );
    assert(
      'S',
      'the finder no longer requires a phone in SQL',
      !/phoneNumber:\s*\{\s*not:\s*null\s*\}/.test(finder)
    );
    assert(
      'S',
      'ZONE 7 BELT: the text leg still re-checks the opt-out table before sending',
      /isOptedOut|smsOptOut\.findMany/.test(finder)
    );
    assert(
      'S',
      'the email goes through the host-voiced guest sender (the way out is structural)',
      /export async function sendDecideByEmail[\s\S]{0,200}sendHostVoiced\(/.test(
        code('src/lib/email.ts')
      )
    );
    assert(
      'S',
      'the sender re-reads the block before an email',
      /listEmailBlocks\(/.test(code('src/lib/sms/decide-by-sender.ts'))
    );
    let zoneDiff = 'unread';
    try {
      execFileSync(
        'git',
        [
          'diff',
          '--quiet',
          'HEAD',
          '--',
          'src/lib/sms/opt-out-service.ts',
          'src/lib/eligibility/email-opt-out.ts',
          'src/lib/eligibility/email-block.ts',
          'prisma/',
        ],
        { cwd: ROOT }
      );
      zoneDiff = '';
    } catch {
      zoneDiff = 'changed';
    }
    assert('S', 'ZONES 7 AND 9 AND THE SCHEMA ARE UNEDITED (read only)', zoneDiff === '', zoneDiff);
    assert(
      'S',
      'NOTHING LEFT THE PROCESS but the stubbed Resend request',
      trapCount() === 0 && nonResendCalls === 0,
      `trap ${trapCount()}, other fetches ${nonResendCalls}`
    );
  } finally {
    globalThis.fetch = realFetch;
    await prisma.inviteEvent.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.outboundMessage.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.emailBlock.deleteMany({ where: { address: { in: created.addresses } } });
    await prisma.emailOptOut.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.accessToken.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.event.deleteMany({ where: { id: { in: created.events } } });
    await prisma.person.deleteMany({ where: { id: { in: created.persons } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    const left =
      (await prisma.event.count({ where: { id: { in: created.events } } })) +
      (await prisma.person.count({ where: { id: { in: created.persons } } })) +
      (await prisma.user.count({ where: { id: { in: created.users } } })) +
      (await prisma.emailBlock.count({ where: { address: { in: created.addresses } } }));
    const after = {
      outbound: await prisma.outboundMessage.count(),
      inviteEvents: await prisma.inviteEvent.count(),
    };
    assert('Z', 'teardown: nothing of this fixture is left, by id', left === 0, `${left} left`);
    assert(
      'Z',
      'teardown: OutboundMessage and InviteEvent counts are as found',
      after.outbound === before.outbound && after.inviteEvents === before.inviteEvents,
      `${JSON.stringify(before)} → ${JSON.stringify(after)}`
    );
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('RED:');
    for (const r of redAssertions) console.log(`  ${r}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
