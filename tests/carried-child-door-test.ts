/**
 * GTC-336 — whose message carried a child's ask, and the door a child's card does not have.
 *
 * THE TWO RULINGS (SCOPED 2026-09-30):
 *  Q1 — a carried child's card stays red, offers no door, and says whose message carried the ask.
 *       The host fixes it from that person's card. Words W1 to W5 ruled at the plan, 2026-09-30.
 *  Q2 — a child goes red only if their ask was in the message that failed, worked out the way the
 *       chooser decides it (`chooseAskRoute`), not from the household's contact.
 *
 * THE LAYERS:
 *  A. pure — `carrierOfAsk` on every route kind, `doorOffered` on a child, the words byte-exact
 *  B. the board — `readEventGlance` over real rows: who inherits, who does not, what each card says
 *  C. the preview — `askRoutes` agrees with the walk's own recipients and host list
 *  D. the route — the door refuses a child with W5, never NOTHING_FAILED, and writes no row
 *  E. the cost — no query per carrier: five more carried households add fewer than five queries
 *  F. fences — no provider, no live switch, Zones 6, 7 and 9 untouched
 *
 * ⚠ `KEPT` IN A LABEL MEANS THE ASSERTION HOLDS AT HEAD (e4414a0) AS WELL: behaviour this ticket
 * must not lose. Every other assertion is expected RED at HEAD. That split is the RED run's
 * expected list, fixed before the run.
 *
 * NOTHING IS SENT. No provider is imported, no cron is run, and the live switch is never set. The
 * door is driven through its injectable seam. Every row written here is this file's own fixture,
 * removed by id in `finally`.
 *
 * Run: npx tsx tests/carried-child-door-test.ts
 */

import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const ROOT = join(__dirname, '..');
const TAG = 'GTC336';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const BASE = 'http://localhost:3000';

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

// The ruled words, 2026-09-30, for a carrier named "Kay Carrier". Byte-exact. W1 and W4 say "is in"
// since [[GTC-340]] Q4 (founder, 2026-10-01): a message Gather's own setup stopped never went out.
const W1 =
  "Their ask is in Kay's message, and it didn't arrive. You can send it again from Kay's card.";
const W2 =
  "Kay would pass it on, but I can't reach Kay. You can add a way to reach Kay from Kay's card.";
const W3 =
  "Their ask is in Kay's message, but I can't email Kay. You can send it another way from Kay's card.";
const W4 = "Their ask is in your message, and it didn't arrive.";
const W5 = 'Gather never messages a child, so there is nothing to send them.';

async function main() {
  let R: any = null;
  let AC: any = null;
  let AP: any = null;
  let DF: any = null;
  let RS: any = null;
  let RDW: any = null;
  try {
    R = await import('../src/lib/glance/read');
    AC = await import('../src/lib/glance/actions');
    AP = await import('../src/lib/preflight/ask-preview');
    DF = await import('../src/lib/glance/delivery-fact');
    RS = await import('../src/lib/press/resend');
    RDW = await import('../src/lib/press/resend-door');
  } catch (err) {
    console.error(`\x1b[31m!\x1b[0m module load failed: ${(err as Error).message.split('\n')[0]}`);
  }

  const created = {
    events: [] as string[],
    persons: [] as string[],
    addresses: [] as string[],
  };

  try {
    // ══ LAYER A — pure ══════════════════════════════════════════════════════════════════
    assert(
      'A',
      'Q2: carrierOfAsk — a CARRIED route’s carrier is its recipient',
      ok(() => DF.carrierOfAsk({ kind: 'CARRIED', channel: 'EMAIL', recipientId: 'kay' }) === 'kay')
    );
    assert(
      'A',
      'Q2: carrierOfAsk — a HOST_LIST route that names a carrier answers that carrier (unreachable, or blocked since)',
      ok(
        () =>
          DF.carrierOfAsk({ kind: 'HOST_LIST', why: 'EMAIL_BLOCKED', carrierId: 'bea' }) === 'bea'
      )
    );
    assert(
      'A',
      'Q2: carrierOfAsk — no carrier for HOST_HOUSEHOLD_CHILD, NO_CARRIER, HOUSEHOLD_MUTED, CHILD_WITHOUT_ITEM, DIRECT or none',
      ok(
        () =>
          DF.carrierOfAsk({ kind: 'HOST_LIST', why: 'HOST_HOUSEHOLD_CHILD' }) === null &&
          DF.carrierOfAsk({ kind: 'HOST_LIST', why: 'NO_CARRIER' }) === null &&
          DF.carrierOfAsk({ kind: 'HOST_LIST', why: 'HOUSEHOLD_MUTED' }) === null &&
          DF.carrierOfAsk({ kind: 'NOT_A_RECIPIENT', why: 'CHILD_WITHOUT_ITEM' }) === null &&
          DF.carrierOfAsk({ kind: 'DIRECT', channel: 'EMAIL', recipientId: 'x' }) === null &&
          DF.carrierOfAsk(undefined) === null
      )
    );
    assert(
      'A',
      'Q2: carrierMembershipFor, the household-contact lookup, is gone',
      ok(() => DF.carrierMembershipFor === undefined) &&
        !/carrierMembershipFor/.test(code('src/lib/glance/delivery-fact.ts'))
    );
    assert(
      'A',
      'Q1: doorOffered is false for a CHILD on both door reasons',
      ok(
        () =>
          AC.doorOffered({ reasons: ['NOT_DELIVERED'], householdRole: 'CHILD' }) === false &&
          AC.doorOffered({ reasons: ['UNREACHABLE'], householdRole: 'CHILD' }) === false
      )
    );
    assert(
      'A',
      'KEPT: doorOffered stays true for an adult on both door reasons — GUEST, PRIMARY_CONTACT and null',
      ok(
        () =>
          AC.doorOffered({ reasons: ['NOT_DELIVERED'], householdRole: 'GUEST' }) === true &&
          AC.doorOffered({ reasons: ['UNREACHABLE'], householdRole: 'PRIMARY_CONTACT' }) === true &&
          AC.doorOffered({ reasons: ['NOT_DELIVERED'], householdRole: null }) === true
      )
    );
    const note = (reasons: string[], carrierName: string | null, o: Record<string, unknown> = {}) =>
      DF.carriedChildNoteFor({
        reasons,
        carrierName,
        carrierIsHost: false,
        textable: false,
        ...o,
      });
    assert(
      'A',
      'W1 byte-exact: never got it',
      ok(() => note(['NOT_DELIVERED'], 'Kay Carrier') === W1)
    );
    assert(
      'A',
      'W2 byte-exact: nowhere to send (carrier not textable)',
      ok(() => note(['UNREACHABLE'], 'Kay Carrier') === W2)
    );
    assert(
      'A',
      'W3 byte-exact: can’t email (carrier textable) — "is in", not "went in"',
      ok(() => note(['UNREACHABLE'], 'Kay Carrier', { textable: true }) === W3)
    );
    assert(
      'A',
      'W4 byte-exact: the host is the carrier, on either reason, with no pointer',
      ok(
        () =>
          note(['NOT_DELIVERED'], 'Kate Host', { carrierIsHost: true }) === W4 &&
          note(['UNREACHABLE'], 'Kate Host', { carrierIsHost: true }) === W4
      )
    );
    assert(
      'A',
      'no note without a door reason, or without a carrier',
      ok(
        () =>
          note(['AWAITING_REPLY'], 'Kay Carrier') === null &&
          note(['EXHAUSTED_SILENCE'], 'Kay Carrier') === null &&
          note(['CHASE_UNREACHABLE'], 'Kay Carrier') === null &&
          note(['NOT_DELIVERED'], null) === null
      )
    );
    assert(
      'A',
      'W5 byte-exact: the door’s refusal for a child, in RESEND_REFUSAL_WORDS',
      ok(() => RDW.RESEND_REFUSAL_WORDS.CHILD_NOT_MESSAGED === W5)
    );
    assert(
      'A',
      'KEPT: NOTHING_FAILED keeps its own sentence for an adult whose message arrived',
      ok(
        () =>
          RDW.RESEND_REFUSAL_WORDS.NOTHING_FAILED ===
          'Their last message did not fail, so Gather has nothing to try again.'
      )
    );

    // ══ LAYERS B, C, D — real rows ═════════════════════════════════════════════════════
    const stamp = Date.now();
    const sentAt = new Date(Date.now() - 2 * DAY);

    async function mkEvent(label: string) {
      const host = await prisma.person.create({
        data: {
          name: `Kate Host${label}`,
          email: `gtc336+${label.toLowerCase()}+host+${stamp}@example.test`,
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
        householdId?: string | null;
        householdRole?: string;
        items?: number;
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
                : `gtc336+${name.split(' ')[0].toLowerCase()}+${e.ev.id.slice(-6)}+${stamp}@example.test`,
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

    async function household(e: Ev, o: { muted?: boolean } = {}) {
      return prisma.household.create({
        data: { eventId: e.ev.id, ...(o.muted ? { messagesMuted: true } : {}) },
      });
    }
    async function setContact(householdId: string, personEventId: string) {
      await prisma.household.update({
        where: { id: householdId },
        data: { contactPersonEventId: personEventId },
      });
    }
    async function askRow(
      e: Ev,
      personEventId: string,
      fate: 'accepted' | 'bounced' | { withheldWhy: string }
    ) {
      await prisma.outboundMessage.create({
        data: {
          eventId: e.ev.id,
          personEventId,
          kind: 'ASK',
          ...(typeof fate === 'object'
            ? { channel: null, withheldAt: sentAt, withheldWhy: fate.withheldWhy }
            : {
                channel: 'EMAIL',
                attemptedAt: sentAt,
                attemptCount: 1,
                acceptedAt: sentAt,
                provider: 'resend',
                providerMessageId: `${TAG}-${personEventId}`,
                ...(fate === 'bounced' ? { deliveryState: 'BOUNCED' } : {}),
              }),
        },
      });
    }
    async function block(e: Ev, address: string) {
      const a = address.toLowerCase();
      await prisma.emailBlock.create({ data: { address: a, reason: 'BOUNCED', eventId: e.ev.id } });
      created.addresses.push(a);
    }
    /** A carried household: a contact who is the household's PRIMARY_CONTACT, and a child. */
    async function carried(
      e: Ev,
      contactName: string,
      childName: string,
      o: { email?: string | null; phone?: string | null; muted?: boolean; childItems?: number } = {}
    ) {
      const hh = await household(e, { muted: o.muted });
      const contact = await mkMember(e, contactName, {
        householdId: hh.id,
        householdRole: 'PRIMARY_CONTACT',
        email: o.email,
        phone: o.phone,
      });
      await setContact(hh.id, contact.pe.id);
      const child = await mkMember(e, childName, {
        householdId: hh.id,
        householdRole: 'CHILD',
        items: o.childItems,
      });
      return { hh, contact, child };
    }

    // ── Event A: one carrier per way a child's carrier can fail ──
    const eA = await mkEvent('A');
    // Kay's message carried Kit's ask, and it bounced.
    const kay = await carried(eA, 'Kay Carrier', 'Kit Kid');
    await askRow(eA, kay.contact.pe.id, 'bounced');
    // Bea's bounced and the poll has since blocked the address; no mobile. The chooser now answers
    // HOST_LIST with Bea as carrier — the commonest real case, and the one a CARRIED-only lookup loses.
    const bea = await carried(eA, 'Bea Blocked', 'Bo Kid');
    await askRow(eA, bea.contact.pe.id, 'bounced');
    await block(eA, bea.contact.p.email!);
    // Uri has no email and no mobile: the press withheld NO_CHANNEL.
    const uri = await carried(eA, 'Uri Nowhere', 'Ula Kid', { email: null, phone: null });
    await askRow(eA, uri.contact.pe.id, { withheldWhy: 'NO_CHANNEL' });
    // Tia's address was blocked before the drain; Tia holds a usable mobile, so the strip reads
    // "can't email" — and Tia's message never went out.
    const tia = await carried(eA, 'Tia Textable', 'Tod Kid', { phone: '+64211233601' });
    await askRow(eA, tia.contact.pe.id, { withheldWhy: 'EMAIL_BLOCKED' });
    await block(eA, tia.contact.p.email!);
    // The host is the carrier (A2). The press writes the host no ASK row today (GTC-297), so this
    // bounced row is a fixture — the case is latent, and the child's words carry no pointer.
    const hhA2 = await household(eA);
    const ada = await mkMember(eA, 'Ada Kid', { householdId: hhA2.id, householdRole: 'CHILD' });
    await setContact(hhA2.id, eA.hostPe.id);
    await askRow(eA, eA.hostPe.id, 'bounced');
    // A switched-off household whose contact's message bounced (question 1: follow Q2) …
    const mo = await carried(eA, 'Mo Muted', 'Mia Kid', { muted: true });
    await askRow(eA, mo.contact.pe.id, 'bounced');
    // … and the same shape with nothing bounced, which is what Mia must read like.
    const mae = await carried(eA, 'Mae Muted', 'Max Kid', { muted: true });
    await askRow(eA, mae.contact.pe.id, 'accepted');
    // Control: a carried child whose carrier's message arrived.
    const cal = await carried(eA, 'Cal Fine', 'Cy Kid');
    await askRow(eA, cal.contact.pe.id, 'accepted');

    let gA: any = null;
    try {
      gA = await R.readEventGlance(prisma, eA.ev.id);
    } catch (err) {
      console.error(`readEventGlance(A) threw: ${(err as Error).message.split('\n')[0]}`);
    }
    const everyone = (g: any): any[] =>
      g ? [...g.households.flatMap((h: any) => h.members), ...g.unhoused] : [];
    const P = (m: { pe: { id: string } }): any =>
      everyone(gA).find((p: any) => p.personEventId === m.pe.id);
    const reads = (m: { pe: { id: string } }, state: string, reasons: string[]) =>
      ok(() => {
        const g = P(m);
        return g.state === state && JSON.stringify(g.reasons) === JSON.stringify(reasons);
      });
    const kayWords = (w: string, first: string) => w.replace(/Kay/g, first);

    // Layer B — who inherits.
    assert(
      'B',
      'KEPT: ruling S — Kit, carried by Kay, whose message bounced → RED [NOT_DELIVERED]',
      reads(kay.child, 'RED', ['NOT_DELIVERED'])
    );
    assert(
      'B',
      'KEPT: after the block, the chooser still names Bea as the carrier → Bo stays RED [NOT_DELIVERED]',
      reads(bea.child, 'RED', ['NOT_DELIVERED'])
    );
    assert(
      'B',
      'KEPT: Uri cannot be reached → Ula RED [UNREACHABLE]',
      reads(uri.child, 'RED', ['UNREACHABLE'])
    );
    assert(
      'B',
      'KEPT: Tia’s invitation was withheld for the block, Tia is textable → Tod RED [UNREACHABLE], strip "can’t email"',
      reads(tia.child, 'RED', ['UNREACHABLE']) && ok(() => P(tia.child).textable === true)
    );
    assert(
      'B',
      'KEPT: the A2 child, the host’s (fixture) row bounced → RED [NOT_DELIVERED] — the CORRECTED red is kept',
      reads(ada, 'RED', ['NOT_DELIVERED'])
    );
    assert(
      'B',
      'QUESTION 1 (follow Q2): a muted household’s child does not inherit the contact’s bounce — Mia reads as Max, whose contact’s message arrived',
      ok(() => {
        const mia = P(mo.child);
        const max = P(mae.child);
        return (
          mia.state === max.state &&
          JSON.stringify(mia.reasons) === JSON.stringify(max.reasons) &&
          !mia.reasons.includes('NOT_DELIVERED')
        );
      })
    );
    assert(
      'B',
      'KEPT: the carriers themselves are red — Kay NOT_DELIVERED, Uri UNREACHABLE — and Kay’s card offers the door',
      reads(kay.contact, 'RED', ['NOT_DELIVERED']) &&
        reads(uri.contact, 'RED', ['UNREACHABLE']) &&
        ok(() => AC.doorOffered(P(kay.contact)) === true)
    );

    // Layer B — no door on a child's card (Q1).
    assert(
      'B',
      'Q1: no door on any red child’s card — Kit, Bo, Ula, Tod, Ada',
      ok(() =>
        [kay.child, bea.child, uri.child, tia.child, ada].every(
          (m) => P(m).state === 'RED' && AC.doorOffered(P(m)) === false
        )
      )
    );
    assert(
      'B',
      'KEPT: the remind stays withdrawn on those reds (the door reasons withdraw it)',
      ok(() =>
        [kay.child, bea.child, uri.child, tia.child, ada].every(
          (m) => AC.remindOffered(P(m)) === false
        )
      )
    );

    // Layer B — the words on each card (Q4).
    assert(
      'B',
      'W1 on Kit, naming Kay',
      ok(() => P(kay.child).carrierNote === W1)
    );
    assert(
      'B',
      'W1 on Bo, naming Bea — the blocked carrier is still whose message it was',
      ok(() => P(bea.child).carrierNote === kayWords(W1, 'Bea'))
    );
    assert(
      'B',
      'W2 on Ula, naming Uri',
      ok(() => P(uri.child).carrierNote === kayWords(W2, 'Uri'))
    );
    assert(
      'B',
      'W3 on Tod, naming Tia',
      ok(() => P(tia.child).carrierNote === kayWords(W3, 'Tia'))
    );
    assert(
      'B',
      'W4 on Ada — the host carried it',
      ok(() => P(ada).carrierNote === W4)
    );
    assert(
      'B',
      'no carrierNote on any adult, on Mia, or on Cy (carrier fine)',
      ok(() => {
        const adults = everyone(gA).filter((p: any) => p.householdRole !== 'CHILD');
        return (
          adults.length > 0 &&
          adults.every((p: any) => p.carrierNote === null) &&
          P(mo.child).carrierNote === null &&
          P(cal.child).carrierNote === null
        );
      })
    );
    assert(
      'B',
      'KEPT: the host’s own card stays green — so W4 has no card to point to (question 2)',
      ok(() => everyone(gA).find((p: any) => p.isHost)?.state === 'GREEN')
    );

    // ══ LAYER C — the preview's ask routes ════════════════════════════════════════════
    const pA: any = await AP.readAskPreview(prisma, eA.ev.id, '');
    assert(
      'C',
      'readAskPreview carries askRoutes, keyed by PersonEvent id, for every membership on the event',
      ok(() => {
        const ids = everyone(gA).map((p: any) => p.personEventId);
        return ids.length > 0 && ids.every((id: string) => !!pA.askRoutes[id]);
      })
    );
    assert(
      'C',
      'every child a recipient carries is CARRIED to that recipient in askRoutes, and nobody else is CARRIED',
      ok(() => {
        const carriedPairs = pA.recipients.flatMap((r: any) =>
          r.carried.map((c: any) => `${c.personEventId}>${r.personEventId}`)
        );
        const fromRoutes = Object.entries(pA.askRoutes)
          .filter(([, r]: any) => r.kind === 'CARRIED')
          .map(([id, r]: any) => `${id}>${r.recipientId}`);
        return (
          carriedPairs.length > 0 &&
          JSON.stringify([...carriedPairs].sort()) === JSON.stringify([...fromRoutes].sort())
        );
      })
    );
    assert(
      'C',
      'every host-list line is HOST_LIST in askRoutes with the same why',
      ok(() =>
        pA.hostList.every(
          (l: any) =>
            pA.askRoutes[l.personEventId]?.kind === 'HOST_LIST' &&
            pA.askRoutes[l.personEventId]?.why === l.why
        )
      )
    );
    assert(
      'C',
      'the after-block case, read off the walk: Bo is HOST_LIST [EMAIL_BLOCKED] with Bea as carrierId',
      ok(() => {
        const r = pA.askRoutes[bea.child.pe.id];
        return (
          r.kind === 'HOST_LIST' && r.why === 'EMAIL_BLOCKED' && r.carrierId === bea.contact.pe.id
        );
      })
    );
    assert(
      'C',
      'KEPT: the walk’s recipients still carry Kit under Kay and Ada under the host (A2)',
      ok(
        () =>
          pA.recipients
            .find((r: any) => r.personEventId === kay.contact.pe.id)
            ?.carried.some((c: any) => c.personEventId === kay.child.pe.id) === true &&
          pA.recipients
            .find((r: any) => r.personEventId === eA.hostPe.id)
            ?.carried.some((c: any) => c.personEventId === ada.pe.id) === true
      )
    );

    // ══ LAYER D — the route, asked about a child (a stale board) ═══════════════════════
    const seam = { textingConfiguredFor: () => true };
    const actor = { id: eA.host.id, kind: 'HOST', name: eA.host.name };
    const rowsBefore = await prisma.outboundMessage.count({ where: { eventId: eA.ev.id } });
    const children = [kay.child, bea.child, uri.child, tia.child, ada, mo.child, cal.child];
    const views: any[] = [];
    for (const c of children) {
      try {
        views.push(
          await RS.readDoor(prisma, { eventId: eA.ev.id, personId: c.p.id, baseUrl: BASE }, seam)
        );
      } catch (err) {
        views.push({ threw: (err as Error).message.split('\n')[0] });
      }
    }
    assert(
      'D',
      'Q1: the door’s GET refuses every child 409 CHILD_NOT_MESSAGED',
      ok(() =>
        views.every((v) => v.ok === false && v.status === 409 && v.code === 'CHILD_NOT_MESSAGED')
      ),
      JSON.stringify(views.map((v) => v.code ?? v.threw ?? 'opened'))
    );
    assert(
      'D',
      'Q1: … and never answers the false "Their last message did not fail" to a child',
      ok(() => views.every((v) => v.code !== 'NOTHING_FAILED'))
    );
    const presses: any[] = [];
    for (const action of ['AGAIN', 'EDIT', 'PHONE']) {
      try {
        presses.push(
          await RS.resendToPerson(
            prisma,
            {
              eventId: eA.ev.id,
              personId: kay.child.p.id,
              baseUrl: BASE,
              actor,
              action,
              email: 'kit+new@example.test',
            },
            seam
          )
        );
      } catch (err) {
        presses.push({ threw: (err as Error).message.split('\n')[0] });
      }
    }
    assert(
      'D',
      'Q1: the door’s POST refuses a child the same way, on all three actions',
      ok(() =>
        presses.every((v) => v.ok === false && v.status === 409 && v.code === 'CHILD_NOT_MESSAGED')
      ),
      JSON.stringify(presses.map((v) => v.code ?? v.threw ?? 'pressed'))
    );
    const rowsAfter = await prisma.outboundMessage.count({ where: { eventId: eA.ev.id } });
    const childRows = await prisma.outboundMessage.count({
      where: { personEventId: { in: children.map((c) => c.pe.id) } },
    });
    const kitPerson = await prisma.person.findUnique({
      where: { id: kay.child.p.id },
      select: { email: true },
    });
    assert(
      'D',
      'KEPT: no row written by those calls, no child holds a row, and the EDIT did not touch the child’s address',
      rowsAfter === rowsBefore && childRows === 0 && kitPerson?.email === null
    );
    let kayView: any = null;
    try {
      kayView = await RS.readDoor(
        prisma,
        { eventId: eA.ev.id, personId: kay.contact.p.id, baseUrl: BASE },
        seam
      );
    } catch {
      /* read as a failed assertion */
    }
    assert(
      'D',
      'KEPT: control — the carrier’s door opens, on the red it is the door for',
      ok(() => kayView.ok === true && kayView.view.reason === 'NOT_DELIVERED')
    );

    // ══ LAYER E — the cost: no query per carrier ════════════════════════════════════════
    const counting = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
    let queries = 0;
    (counting as any).$on('query', () => {
      queries++;
    });
    async function boardWith(label: string, households: number) {
      const e = await mkEvent(label);
      for (let i = 0; i < households; i++) {
        const h = await carried(e, `Con${i} ${label}`, `Kid${i} ${label}`);
        await askRow(e, h.contact.pe.id, i === 0 ? 'bounced' : 'accepted');
      }
      return e;
    }
    /*
     * ⚠ NOT A STRICT EQUALITY, AND THE RED RUN IS WHY. `readEventGlance` runs nine reads in
     * parallel, and Prisma batches `findUnique` calls that land in the same tick, so one read can
     * issue one query more or fewer than another on identical data (measured at HEAD: 25 and 26 in
     * the suite, 25 and 25 alone). So the property is asserted as stated — no query PER CARRIER:
     * five more carried households must add fewer than five queries. A per-carrier lookup adds at
     * least five each (`resolveCarriedSubjects`). Lowest of three reads, to take the batching out.
     */
    const e1 = await boardWith('E1', 1);
    const e6 = await boardWith('E6', 6);
    const countFor = async (e: Ev) => {
      queries = 0;
      try {
        await R.readEventGlance(counting, e.ev.id);
      } catch {
        return -1;
      }
      return queries;
    };
    const lowest = async (e: Ev) => {
      const counts = [await countFor(e), await countFor(e), await countFor(e)];
      return counts.includes(-1) ? -1 : Math.min(...counts);
    };
    await countFor(e1); // warm the connection, so both measured reads start alike
    const q1 = await lowest(e1);
    const q6 = await lowest(e6);
    await counting.$disconnect();
    assert(
      'E',
      `KEPT: no query per carrier — five more carried households add fewer than five queries to readEventGlance (${q1} for one, ${q6} for six)`,
      q1 > 0 && q6 > 0 && q6 - q1 < 5
    );
    const readSrc = code('src/lib/glance/read.ts');
    const factSrc = code('src/lib/glance/delivery-fact.ts');
    assert(
      'E',
      'the read takes the child’s carrier from the walk it already runs — askRoutes, through carrierOfAsk',
      /carrierOfAsk\(\s*preview\?\.askRoutes\[/.test(readSrc) &&
        /export function carrierOfAsk/.test(factSrc)
    );
    assert(
      'E',
      'KEPT: neither file reaches for resolveCarriedSubjects, the five-query wrapper',
      readSrc.length > 0 &&
        factSrc.length > 0 &&
        !/resolveCarriedSubjects/.test(readSrc) &&
        !/resolveCarriedSubjects/.test(factSrc)
    );

    // ══ LAYER F — fences ═══════════════════════════════════════════════════════════════
    const self = read('tests/carried-child-door-test.ts');
    const liveName = ['GATHER', 'LIVE', 'SENDS'].join('_');
    assert(
      'F',
      'KEPT: this suite imports nothing but Prisma, node built-ins and the six modules under test — no provider — and never names the live switch',
      ok(() => {
        const specifiers = [
          ...self.matchAll(/^import\s[\s\S]*?from\s+'([^']+)';/gm),
          ...self.matchAll(/import\('([^']+)'\)/g),
        ].map((m) => m[1]);
        const allowed = new Set([
          '@prisma/client',
          'child_process',
          'fs',
          'path',
          '../src/lib/glance/read',
          '../src/lib/glance/actions',
          '../src/lib/preflight/ask-preview',
          '../src/lib/glance/delivery-fact',
          '../src/lib/press/resend',
          '../src/lib/press/resend-door',
        ]);
        return specifiers.length >= 10 && specifiers.every((m) => allowed.has(m));
      }) && !self.includes(liveName)
    );
    let changed: string[] = [];
    try {
      changed = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .map((l) => l.slice(3));
    } catch {
      changed = ['<git status failed>'];
    }
    const forbidden = changed.filter(
      (f) =>
        f.startsWith('prisma/') ||
        /^tests\/security-/.test(f) ||
        f === 'scripts/triage-unknown-routes.ts' ||
        f.endsWith('route-classifications.json') ||
        f === 'src/lib/eligibility/email-opt-out.ts' ||
        f === 'src/lib/eligibility/email-block.ts' ||
        f.startsWith('src/lib/auth') ||
        f === 'middleware.ts' ||
        f === '<git status failed>'
    );
    assert(
      'F',
      'KEPT: the working tree touches no zone file — schema and migrations, the security suite, the route inventory, email opt-out and block, auth',
      forbidden.length === 0,
      forbidden.join(', ')
    );
    const doorWords = code('src/lib/press/resend-door.ts');
    assert(
      'F',
      'KEPT: resend-door.ts stays client-safe — every import is `import type`',
      doorWords.length > 0 &&
        (doorWords.match(/^import\s/gm) ?? []).length ===
          (doorWords.match(/^import\s+type\s/gm) ?? []).length
    );
  } finally {
    await prisma.outboundMessage.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.emailBlock.deleteMany({ where: { address: { in: created.addresses } } });
    await prisma.event.deleteMany({ where: { id: { in: created.events } } });
    await prisma.person.deleteMany({ where: { id: { in: created.persons } } });
    const leftEvents = await prisma.event.count({ where: { id: { in: created.events } } });
    const leftPersons = await prisma.person.count({ where: { id: { in: created.persons } } });
    const leftBlocks = await prisma.emailBlock.count({
      where: { address: { in: created.addresses } },
    });
    assert(
      'Z',
      'cleanup: every fixture event, person and block is gone',
      leftEvents === 0 && leftPersons === 0 && leftBlocks === 0
    );
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
