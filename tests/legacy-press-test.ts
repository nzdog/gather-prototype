/**
 * GTC-322 — the backfill for events that were "sent" before anything could send.
 *
 * The script writes to REAL boards, including two seeded demo boards, and it is run by hand. So
 * what it can be trusted about has to be pinned somewhere that runs without it: the shared
 * predicate, the dry-run default, and the one property that stops it sending anything.
 *
 * ⚠ THE PROPERTY THIS SUITE EXISTS FOR IS THE COUPLING, NOT THE ARITHMETIC. Writing ASK rows for
 * a legacy event FLIPS `enrolMiniSends`' event predicate — it refuses an event with no ask rows,
 * and after the backfill all eight have some. The sweep then enrols nobody ONLY because both ask
 * `askRowPopulation`. Founder ruling, 2026-09-19: *"identical populations is a property, not a
 * margin, and one person of difference is a real invitation from an event pressed months ago."*
 *
 * Run: npx tsx tests/legacy-press-test.ts
 */

import fs from 'fs';

const ASK_PREVIEW = 'src/lib/preflight/ask-preview.ts';
const PRESS = 'src/lib/press/press.ts';
const DISPATCH = 'src/lib/press/dispatch.ts';
const SCRIPT = 'scripts/backfill-gtc322.ts';

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

async function main() {
  section('Layer 0: controls');
  assert(
    'CONTROL: the reader reads and the stripper strips',
    read(ASK_PREVIEW).length > 0 &&
      read('src/nope.ts') === '' &&
      !stripComments('/* x */ const a = 1;').includes('x')
  );

  let preview: any = null;
  try {
    preview = await import('../src/lib/preflight/ask-preview');
  } catch {
    preview = null;
  }

  section('Layer P: ONE predicate, and three callers of it');

  assert(
    `${ASK_PREVIEW} exports askRowPopulation`,
    ok(() => typeof preview.askRowPopulation === 'function')
  );
  assert(
    'it splits on the link, keeping the press’s two-step rule in one place',
    ok(() => {
      const out = preview.askRowPopulation([
        { personEventId: 'a', linkState: 'READY' },
        { personEventId: 'b', linkState: 'AT_PRESS' },
        { personEventId: 'c', linkState: 'NONE_HOST_CARRIER' },
        { personEventId: 'd', linkState: 'NONE_NOT_ISSUED' },
      ]);
      return (
        out.ready.length === 1 &&
        out.ready[0].personEventId === 'a' &&
        out.awaitingLink.length === 1 &&
        out.awaitingLink[0].personEventId === 'b'
      );
    })
  );
  assert(
    '⚠ AND THE TWO STATES THE PRESS SENDS NOTHING FOR ARE IN NEITHER LIST — the host as carrier ' +
      'and the fail-closed default are not rows and not waiting for anything',
    ok(() => {
      const out = preview.askRowPopulation([
        { personEventId: 'c', linkState: 'NONE_HOST_CARRIER' },
        { personEventId: 'd', linkState: 'NONE_NOT_ISSUED' },
      ]);
      return out.ready.length === 0 && out.awaitingLink.length === 0;
    })
  );

  const pressSrc = stripComments(read(PRESS));
  const dispatchSrc = stripComments(read(DISPATCH));
  const scriptSrc = stripComments(read(SCRIPT));

  assert(
    '⚠ ALL THREE CALLERS ASK IT: the press, the mini-send sweep, and the backfill',
    pressSrc.includes('askRowPopulation(') &&
      dispatchSrc.includes('askRowPopulation(') &&
      scriptSrc.includes('askRowPopulation(')
  );
  assert(
    '⚠ AND NONE OF THEM SPELLS THE SPLIT FOR ITSELF — no `linkState === "READY"` anywhere but ' +
      'the module that owns `LinkState`. One person of difference between the backfill and the ' +
      'sweep is a real invitation from an event pressed months ago',
    ok(() => {
      const spelled = /linkState\s*[!=]==\s*'READY'/;
      return !spelled.test(pressSrc) && !spelled.test(dispatchSrc) && !spelled.test(scriptSrc);
    })
  );
  assert(
    'CONTROL: it IS spelled that way where it belongs, so the absences above are absences',
    ok(() => /linkState\s*[!=]==\s*'READY'/.test(stripComments(read(ASK_PREVIEW))))
  );

  section('Layer B: what the backfill may and may not do');

  assert(
    '⚠ IT IS A DRY RUN BY DEFAULT. It writes to real boards including two seeded demo boards, ' +
      'and it is run by hand — so the safe path has to be the one you get by typing less',
    ok(() => /const APPLY = process\.argv\.includes\('--apply'\)/.test(scriptSrc))
  );
  assert(
    'and the write is behind that flag — the transaction is unreachable without it',
    ok(() => {
      const i = scriptSrc.indexOf('if (!APPLY)');
      const j = scriptSrc.indexOf('$transaction');
      return i > 0 && j > i;
    })
  );
  assert(
    '⚠ EVERY ROW IS BORN WITHHELD AND CARRIES A NULL CHANNEL. Withheld is what keeps it out of ' +
      '`findNeverAttempted` for ever; null is the only honest channel, because no chooser ran at ' +
      'that press and any value would date a routing decision to a press that never made one',
    ok(() => /channel: null/.test(scriptSrc) && /withheldAt: new Date\(\)/.test(scriptSrc))
  );
  assert(
    'the why is this ticket’s own code, not a gate’s — no gate produced these rows',
    ok(() => /withheldWhy: 'PREDATES_SENDER'/.test(scriptSrc))
  );
  assert(
    '⚠ BOTH HALVES ARE IN ONE TRANSACTION — the rows and the stamp clearing. A run that cleared ' +
      'the stamps and failed before the rows would leave the record claiming less than it did',
    ok(() => {
      const t = scriptSrc.indexOf('$transaction');
      return (
        t > 0 &&
        scriptSrc.indexOf('outboundMessage.createMany', t) > t &&
        scriptSrc.indexOf('personEvent.updateMany', t) > t
      );
    })
  );
  assert(
    '⚠ AND IT IS IDEMPOTENT BY THE PREDICATE RATHER THAN BY A FLAG: the legacy test is re-run ' +
      'INSIDE the transaction, so the first run’s own rows disqualify the event and a second run ' +
      'is a no-op',
    ok(() => {
      const t = scriptSrc.indexOf('$transaction');
      return t > 0 && /stillLegacy/.test(scriptSrc.slice(t));
    })
  );
  assert(
    '⚠ IT NEVER TOUCHES `Event.sentAt`. The event WAS pressed, by machinery that could not send, ' +
      'and that is the fact this records rather than erases',
    ok(
      () =>
        !/event\.update|sentAt: null[^}]*eventId/.test(
          scriptSrc.replace(/personEvent\.updateMany[\s\S]{0,200}/g, '')
        )
    )
  );
  assert(
    'and it reaches no provider and no sender of any kind',
    ok(() => !/sendSms|sendAskEmail|drainOnce|from 'resend'/.test(scriptSrc))
  );

  assert(
    '⚠ THE PRINTED SQL AND THE EXECUTED PREDICATE AGREE ON WHICH EVENTS ARE LEGACY — a surfaced ' +
      'SQL that has drifted from the code is worse than none',
    ok(() => {
      const sql = read(SCRIPT).slice(read(SCRIPT).indexOf('const SQL_EQUIVALENT'));
      const block = sql.slice(0, sql.indexOf('`.trim()'));
      return (
        /e\."sentAt" IS NOT NULL/.test(block) &&
        /pe\."sentAt" IS NOT NULL/.test(block) &&
        /NOT EXISTS/.test(block) &&
        /om\.kind = 'ASK'/.test(block) &&
        /sentAt: \{ not: null \}/.test(scriptSrc) &&
        /outboundMessages: \{ none: \{ kind: 'ASK' as const \} \}/.test(scriptSrc)
      );
    })
  );

  console.log(`\n\x1b[1m\x1b[33m=== Test Summary ===\x1b[0m`);
  console.log(`Total tests: ${passed + failed}`);
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
  if (failed > 0) process.exit(1);
  console.log(`\n\x1b[32m\x1b[1m✓ The backfill is fenced\x1b[0m`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
