/**
 * GTC-289 phase 1 — the email delivery interpreter. A library, and nothing else.
 *
 * ⚠ THE MECHANISM IS THE POLL, AND THAT REVERSES THIS TICKET'S STATED SHAPE. GTC-289 assumed a
 * webhook because a bounce ingest usually is one. The poll turns out to be the mechanism whose
 * vocabulary this repo actually has: `resend.emails.get(id).last_event` is a CLOSED TWELVE-VALUE
 * UNION in the installed SDK's types, where the webhook's bounce detail is `{ type: string; subType:
 * string }` — two untyped strings that only a live trial can populate.
 *
 * ── ⚠ WHAT THIS MODULE REFUSES TO ANSWER, WHICH IS THE POINT OF IT ────────────
 *
 * 1. **WHETHER IT ARRIVED.** There is no exported boolean called delivered, arrived or success.
 *    GTC-289 Unknown 3 — whether `delivered` is affirmative or merely no-failure-yet — is unsettled
 *    and the poll does not settle it. A module that answered would be guessing on the glance's
 *    behalf, and [[GTC-264]]'s contract module refuses the identical question for TNZ for the
 *    identical reason.
 *
 * 2. **WHETHER A BOUNCE IS PERMANENT.** Founder ruling, 2026-09-19: *"No hard/soft partition
 *    asserted, in any phase... a wrong partition turns a transient bounce into a permanent red, and
 *    §7's rule is the thing being implemented."* `last_event` has ONE `bounced` member with no type
 *    beside it, so **the poll gets the fact of a bounce and not its kind.** §7's red-on-arrival rule
 *    needs the fact; ruling U's bounce door needs the kind. This phase supplies the first only.
 *
 * 3. **WHAT COLOUR ANY OF IT IS.** [[GTC-192]] rules what the glance shows. No colour vocabulary
 *    here, ever — GTC-264's contract module says "THE BUCKETS ARE NOT COLOURS" and it is the same
 *    rule.
 *
 * ── ONE MODULE, NOT TWO, AND THE PRECEDENT IS FOLLOWED RATHER THAN COPIED ─────
 *
 * ⚠ GTC-264 split its envelope from its interpreter FOR A STATED REASON: one envelope with two
 * consumers, the delivery report and GTC-288's reply. **That reason does not exist here** — a poll
 * response has one shape and one consumer — so splitting would be mirroring a file count instead of
 * applying a rule.
 *
 * Run: npx tsx tests/resend-delivery-contract-test.ts
 */

import fs from 'fs';

const MODULE = 'src/lib/email-delivery/resend-delivery-contract.ts';

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

/** The twelve `last_event` values the installed SDK declares, transcribed for the assertions. */
const SDK_LAST_EVENTS = [
  'bounced',
  'canceled',
  'clicked',
  'complained',
  'delivered',
  'delivery_delayed',
  'failed',
  'opened',
  'queued',
  'scheduled',
  'sent',
  'suppressed',
] as const;

async function main() {
  section('Layer 0: controls — the harness and the SDK this contract is written against');

  assert(
    'CONTROL: the file reader really reads — a real path is non-empty and a missing one is ""',
    read('src/lib/email.ts').length > 0 && read('src/lib/nope.ts') === ''
  );
  assert(
    'CONTROL: the comment stripper strips',
    stripComments('/* bounced */ const a = 1;').includes('bounced') === false
  );
  /*
   * ⚠ THE SDK IS THE SOURCE, AND THIS CONTROL IS WHY THE TWELVE ABOVE ARE NOT INVENTED. There is no
   * Resend document anywhere in this repo — TNZ has four artifacts in docs/05_ops and Resend has
   * none — so the vocabulary comes from `node_modules/resend`'s shipped declarations. Asserted, so a
   * reader knows the list was read rather than remembered.
   */
  const sdkTypes = read('node_modules/resend/dist/index.d.mts');
  assert(
    'CONTROL: the installed SDK declares all twelve `last_event` values this contract classifies — ' +
      'read from node_modules, not recalled',
    sdkTypes.length > 0 && SDK_LAST_EVENTS.every((v) => sdkTypes.includes(`'${v}'`))
  );
  assert(
    'CONTROL: and it declares the bounce detail as two UNTYPED strings, which is why no hard/soft ' +
      'partition is asserted anywhere below',
    /interface EmailBounce \{[^}]*subType: string;[^}]*type: string;/s.test(sdkTypes)
  );

  let mod: any = null;
  try {
    mod = await import('../src/lib/email-delivery/resend-delivery-contract');
  } catch {
    mod = null;
  }

  // ── Layer V: the vocabulary ─────────────────────────────────────────────
  section('Layer V: every one of the twelve is classified, and the SDK union is the guard');

  assert(
    `${MODULE} exports interpretResendLastEvent`,
    ok(() => typeof mod.interpretResendLastEvent === 'function')
  );
  for (const v of SDK_LAST_EVENTS) {
    assert(
      `'${v}' is classified, and the verdict names the value it came from`,
      ok(() => {
        const r = mod.interpretResendLastEvent(v);
        return typeof r.kind === 'string' && r.lastEvent === v && r.recognised === true;
      })
    );
  }
  assert(
    '⚠ THE THREE PROVIDER FAILURES ARE NOT BUNDLED. `bounced`, `failed` and `suppressed` are three ' +
      'different things the provider said — accepted-then-refused, never-sent, and refused-by-a-list ' +
      '— and collapsing them would model a vocabulary nobody has observed',
    ok(() => {
      const kinds = ['bounced', 'failed', 'suppressed'].map(
        (v) => mod.interpretResendLastEvent(v).kind
      );
      return new Set(kinds).size === 3;
    })
  );
  assert(
    '`complained` is its OWN kind and is not a bounce — a complaint is a live address that does not ' +
      "want mail, and §7's rule is about a DEAD channel",
    ok(
      () =>
        mod.interpretResendLastEvent('complained').kind !==
        mod.interpretResendLastEvent('bounced').kind
    )
  );
  assert(
    'the four in-flight values share one kind — queued, scheduled, sent and delivery_delayed are ' +
      'all "nothing has concluded yet"',
    ok(() => {
      const kinds = ['queued', 'scheduled', 'sent', 'delivery_delayed'].map(
        (v) => mod.interpretResendLastEvent(v).kind
      );
      return new Set(kinds).size === 1;
    })
  );

  // ── Layer R: the refusals ───────────────────────────────────────────────
  section('Layer R: what the module refuses to answer');

  const src = stripComments(read(MODULE));
  assert(
    '⚠ NO EXPORTED BOOLEAN CLAIMS ARRIVAL. Unknown 3 is unsettled and the poll does not settle it, ' +
      'so there is no isDelivered, hasArrived or wasSuccessful for a caller to lean on',
    src.length > 0 &&
      !/export (?:const|function) (?:is|has|was)(?:Delivered|Arrived|Successful)/.test(src)
  );
  assert(
    '⚠ AND `delivered` DOES NOT GET A KIND THAT MEANS ARRIVED. Its verdict is what the PROVIDER ' +
      'reported, not what happened to the message',
    ok(() => {
      const k = mod.interpretResendLastEvent('delivered').kind;
      return typeof k === 'string' && !/ARRIVED|SUCCESS/.test(k);
    })
  );
  assert(
    '⚠ NO HARD/SOFT PARTITION EXISTS ANYWHERE IN THE MODULE — ruled 2026-09-19. A wrong partition ' +
      "turns a transient bounce into a permanent red, and §7's rule is the thing being implemented",
    src.length > 0 && !/HARD|SOFT|PERMANENT|TRANSIENT/i.test(src)
  );
  assert(
    'CONTROL: the partition matcher really matches — asserted against planted source, because an ' +
      'absence found by a broken pattern is the shape slice 4a got wrong',
    /HARD|SOFT|PERMANENT|TRANSIENT/i.test("const kind = 'HARD_BOUNCE';")
  );
  assert(
    '⚠ AND THE MODULE CARRIES NO COLOUR VOCABULARY. GTC-192 rules what the glance shows; this ' +
      'classifies and stops',
    src.length > 0 && !/\b(RED|AMBER|GREEN|GREY)\b/.test(src)
  );
  assert(
    'an UNRECOGNISED value is recorded and never rejected — preserved verbatim, given no kind, and ' +
      'flagged. GTC-264: "an unknown Result is recorded, never rejected"',
    ok(() => {
      const r = mod.interpretResendLastEvent('some_future_event_resend_adds');
      return (
        r.recognised === false &&
        r.lastEvent === 'some_future_event_resend_adds' &&
        r.kind === 'UNRECOGNISED'
      );
    })
  );
  assert(
    'and an empty or absent value is unrecognised too rather than throwing — a poll that answers ' +
      'oddly must not crash a cron tick',
    ok(
      () =>
        mod.interpretResendLastEvent('').recognised === false &&
        mod.interpretResendLastEvent(undefined).recognised === false
    )
  );

  // ── Layer P: the parse ──────────────────────────────────────────────────
  section('Layer P: the poll response is validated, not coerced');

  assert(
    `${MODULE} exports readResendPollResponse`,
    ok(() => typeof mod.readResendPollResponse === 'function')
  );
  assert(
    'a well-formed response parses, and carries BOTH id fields through — see the join note',
    ok(() => {
      const r = mod.readResendPollResponse({
        id: 'abc-123',
        message_id: '<x@y>',
        last_event: 'bounced',
        created_at: '2026-09-19T00:00:00.000Z',
      });
      return r.ok === true && r.emailId === 'abc-123' && r.messageId === '<x@y>';
    })
  );
  assert(
    '⚠ BOTH IDS ARE KEPT AND NEITHER IS CALLED THE JOIN KEY. The send returns `id`, slice 4b stores ' +
      'it, and the poll answers with `id` AND `message_id` — which of them matches is UNVERIFIED, ' +
      'and joining on the wrong one reads as a lost bounce rather than as no bounce',
    read(MODULE).includes('UNVERIFIED') || read(MODULE).includes('unverified')
  );
  assert(
    'a response with no last_event is refused with a reason rather than defaulted',
    ok(() => {
      const r = mod.readResendPollResponse({ id: 'a', message_id: 'b' });
      return r.ok === false && typeof r.why === 'string' && r.why.length > 0;
    })
  );
  assert(
    'a non-object, a null and a missing id are each refused',
    ok(
      () =>
        mod.readResendPollResponse(null).ok === false &&
        mod.readResendPollResponse('bounced').ok === false &&
        mod.readResendPollResponse({ last_event: 'bounced' }).ok === false
    )
  );

  // ── Layer S: a library and nothing else ─────────────────────────────────
  section('Layer S: libraries only — no route, no migration, no provider call');

  assert(
    '⚠ THE MODULE CALLS NO PROVIDER AND READS NO DATABASE. It is pure: no resend client, no fetch, ' +
      'no prisma. GTC-264 phases 1 and 2 built exactly this and its delivery contract still "exists ' +
      'as libraries only, no route"',
    src.length > 0 && !/getResendClient|new Resend|fetch\(|prisma|\.emails\./.test(src)
  );
  assert(
    'no cron route for an email delivery poll exists yet',
    !fs.existsSync('src/app/api/cron/email-delivery-poll')
  );
  assert(
    'and this phase carries no schema: OutboundMessage gained nothing and no migration is present',
    !read('prisma/schema.prisma').includes('lastProviderEvent')
  );
  assert(
    'CONTROL: the purity matcher really matches — asserted against planted source',
    /prisma/.test('await prisma.outboundMessage.findMany()')
  );

  // ── Layer D: provenance ─────────────────────────────────────────────────
  section('Layer D: the provenance of every value, written down');

  const raw = read(MODULE);
  assert(
    "⚠ THE MODULE SAYS ITS VOCABULARY IS THE SDK'S DECLARED TYPES AND NOT AN OBSERVED RESPONSE — " +
      "slice 4b's limit, inherited and named rather than repeated by accident",
    raw.includes('resend@') && /not (?:an )?observ/i.test(raw)
  );
  assert(
    '⚠ AND IT NAMES THE MISSING DOCUMENT. There is no Resend artifact in docs/05_ops where TNZ has ' +
      'four, and the module points at the ticket that owns closing that',
    raw.includes('GTC-323')
  );
  assert(
    'and it names Unknown 3 as the thing it does not settle',
    raw.includes('Unknown 3') || raw.includes('unknown 3')
  );

  console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
