/**
 * GTC-289 phase 2 ([[GTC-189]] slice 6) — THE SUBMISSION ERROR CONTRACT, AND THE RETRY THAT READS IT.
 *
 * ⚠ WHAT THIS REPLACES, AND WHY IT IS A DEFECT AND NOT AN IMPROVEMENT. Slice 5c shipped
 * `isRetryableProviderError` reading a MESSAGE STRING, because `SendResult` collapsed Resend's error
 * to `error?: string`. The SDK in fact declares `ErrorResponse { message; statusCode; name }` where
 * `name` is a CLOSED 21-VALUE CODE UNION. So the shipped predicate matched prose where a code
 * existed, and slice 5c's own evidence says so. Founder ruling, 2026-09-19: *"a shipped predicate
 * known to be reading the wrong field should not wait behind a migration and a rehearsal."*
 *
 * ── THE THREE STEPS, EACH IN ONE PLACE ────────────────────────────────────────
 *
 * 1. `resultOf` in `src/lib/email.ts` reads the ENVELOPE — it already did, for its log — and now
 *    carries the code and the status back on the result.
 * 2. `interpretResendErrorCode` names what the CODE means, and nothing else.
 * 3. `isRetryableProviderError` in the dispatcher decides the POLICY.
 *
 * ⚠ THE SPLIT IS THE WHOLE OF IT: THE CONTRACT MODULE HOLDS NO RETRY POLICY. `daily_quota_exceeded`
 * is the case that proves the boundary is real rather than tidy — the FACT is that an allowance is
 * spent, and whether that is worth retrying depends entirely on a backoff measured in minutes, which
 * is the dispatcher's number and not the provider's. Layer P asserts the module has no policy in it.
 *
 * ── ⚠ THE PROVENANCE, AND ITS LIMIT ───────────────────────────────────────────
 *
 * The 21 codes come from resend@6.22.0's shipped declarations at
 * `node_modules/resend/dist/index.d.mts`, **read and not recalled** — layer 0 parses that
 * declaration and compares it against the transcription below, both directions. **The CLASSIFICATION
 * of each code is inference from its NAME**, because there is no Resend document in this repo:
 * [[GTC-323]]. Two classifications are named in the module as uncertain rather than presented as
 * known.
 *
 * Run: npx tsx tests/resend-error-contract-test.ts
 */

import fs from 'fs';

const MODULE = 'src/lib/email-delivery/resend-error-contract.ts';
const DELIVERY = 'src/lib/email-delivery/resend-delivery-contract.ts';
const DISPATCH = 'src/lib/press/dispatch.ts';
const EMAIL = 'src/lib/email.ts';
const SDK = 'node_modules/resend/dist/index.d.mts';

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];
function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}`);
    failed++;
    redAssertions.push(label);
  }
}
function section(title: string) {
  console.log(`\n\x1b[1m\x1b[33m${title}\x1b[0m`);
}
/**
 * ⚠ AND THIS ONE REFUSES A PROMISE, WHICH THE STANDING WARNING'S NEWEST RULE IS ABOUT.
 * `ok(() => asyncFn())` gets a thenable, which is always truthy, so the assertion passes without
 * reading anything and the call runs again when the caller awaits it. Every suite in this family has
 * the plain version; this one has teeth, because the rule is worth more as a mechanism than as a
 * paragraph. [[GTC-192]] standing warning, added at slice 5c's second half.
 */
function ok(fn: () => boolean): boolean {
  try {
    const value: unknown = fn();
    if (value && typeof (value as { then?: unknown }).then === 'function') {
      throw new Error('ok() was handed a promise: its contract is a synchronous value');
    }
    return !!value;
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

/**
 * One function's body, bounded by the next top-level `export` after it.
 *
 * ⚠ WRITTEN BECAUSE THE UNBOUNDED VERSION WENT RED FOR THE WRONG REASON, in this suite's own first
 * GREEN run. `src.slice(src.indexOf('recordRejection'))` reaches the END OF THE FILE, so a fence
 * reading "recordRejection does not mention providerErrorCode" was in fact reading `drainOnce`, three
 * functions later, where the widening's call site legitimately does. A guard that fires on the wrong
 * thing is the same defect as one that never fires — [[GTC-192]]'s standing warning.
 */
function fnBody(src: string, declaration: string): string {
  const start = src.indexOf(declaration);
  if (start === -1) return '';
  const rest = src.slice(start + declaration.length);
  const end = rest.indexOf('\nexport ');
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * The 21 codes `ErrorResponse.name` may hold, transcribed from the installed SDK, each with the kind
 * this contract gives it. **Layer 0 proves the left column against the SDK's own declaration, in
 * both directions.** The right column is inference from the name — see the header.
 */
const CODE_KIND: ReadonlyArray<readonly [string, string]> = [
  // The provider is busy or broken. These are the only two kinds a retry can help.
  ['rate_limit_exceeded', 'PROVIDER_BUSY'],
  ['internal_server_error', 'PROVIDER_FAULT'],
  ['application_error', 'PROVIDER_FAULT'],
  // The key. This is what slice 5c's 401/403 guard existed for.
  ['missing_api_key', 'AUTH_REFUSED'],
  ['invalid_api_key', 'AUTH_REFUSED'],
  ['restricted_api_key', 'AUTH_REFUSED'],
  ['invalid_access', 'AUTH_REFUSED'],
  // The allowance. A FACT about the account, and not a policy about waiting.
  ['daily_quota_exceeded', 'QUOTA_SPENT'],
  ['monthly_quota_exceeded', 'QUOTA_SPENT'],
  // The request. Repeating it cannot make it right.
  ['validation_error', 'REQUEST_REFUSED'],
  ['missing_required_field', 'REQUEST_REFUSED'],
  ['invalid_parameter', 'REQUEST_REFUSED'],
  ['invalid_attachment', 'REQUEST_REFUSED'],
  ['invalid_from_address', 'REQUEST_REFUSED'],
  ['invalid_region', 'REQUEST_REFUSED'],
  ['not_found', 'REQUEST_REFUSED'],
  ['method_not_allowed', 'REQUEST_REFUSED'],
  ['security_error', 'REQUEST_REFUSED'],
  ['invalid_idempotency_key', 'REQUEST_REFUSED'],
  ['invalid_idempotent_request', 'REQUEST_REFUSED'],
  ['concurrent_idempotent_requests', 'REQUEST_REFUSED'],
];

/** Parse the SDK's own union, so the transcription above is measured rather than trusted. */
function sdkErrorCodes(src: string): string[] {
  const m = src.match(/type RESEND_ERROR_CODE_KEY = ([^;]+);/);
  if (!m) return [];
  return (m[1].match(/'[a-z_]+'/g) ?? []).map((q) => q.slice(1, -1));
}

async function main() {
  section('Layer 0: controls — the harness, and the SDK this contract is written against');

  assert(
    'CONTROL: the file reader really reads — a real path is non-empty and a missing one is ""',
    read(EMAIL).length > 0 && read('src/lib/nope.ts') === ''
  );
  assert(
    'CONTROL: the comment stripper strips',
    stripComments('/* retry */ const a = 1;').includes('retry') === false
  );
  assert(
    '⚠ CONTROL: ok() REFUSES A PROMISE rather than passing on a thenable — the standing warning ' +
      'rule from slice 5c, as a mechanism instead of a paragraph',
    ok(() => true) === true &&
      ok((() => Promise.resolve(true)) as unknown as () => boolean) === false
  );

  const sdk = read(SDK);
  const codes = sdkErrorCodes(sdk);
  assert(
    'CONTROL: the SDK declaration parser really parses — it finds a union of codes in the installed ' +
      'resend types, and finds nothing in a file that has none',
    codes.length > 0 && sdkErrorCodes('type Nothing = 1;').length === 0
  );
  assert(
    '⚠ THE INSTALLED SDK DECLARES EXACTLY 21 ERROR CODES, read from node_modules and not recalled. ' +
      'A 22nd is a compile error in the Record AND a red here, and this label carries the number',
    codes.length === 21
  );
  assert(
    '⚠ AND THE TRANSCRIPTION MATCHES IT IN BOTH DIRECTIONS — every SDK code is classified below and ' +
      'nothing below is invented',
    codes.length === CODE_KIND.length &&
      codes.every((c) => CODE_KIND.some(([code]) => code === c)) &&
      CODE_KIND.every(([code]) => codes.includes(code))
  );
  assert(
    'CONTROL: and `ErrorResponse` declares the three fields this widening carries — message, ' +
      "statusCode and name — so the shape below is the SDK's rather than a guess about it",
    /type ErrorResponse = \{[^}]*message: string;[^}]*statusCode: number \| null;[^}]*name: RESEND_ERROR_CODE_KEY;/s.test(
      sdk
    )
  );

  let mod: any = null;
  try {
    mod = await import('../src/lib/email-delivery/resend-error-contract');
  } catch {
    mod = null;
  }
  let dispatch: any = null;
  try {
    dispatch = await import('../src/lib/press/dispatch');
  } catch {
    dispatch = null;
  }
  let email: any = null;
  try {
    email = await import('../src/lib/email');
  } catch {
    email = null;
  }

  // ── Layer V: the vocabulary ───────────────────────────────────────────────
  section('Layer V: all 21 codes classified, and the SDK union is the guard');

  assert(
    `${MODULE} exports interpretResendErrorCode`,
    ok(() => typeof mod.interpretResendErrorCode === 'function')
  );
  assert(
    "⚠ THE CODE UNION IS TAKEN FROM THE SDK'S OWN TYPE AND NOT RESTATED — `ErrorResponse['name']` " +
      '— so a 22nd code does not compile until somebody classifies it. The same guard phase 1 proved ' +
      'with a mutation rather than asserting',
    /ErrorResponse\['name'\]/.test(read(MODULE)) &&
      /import type \{[^}]*ErrorResponse[^}]*\} from 'resend'/.test(read(MODULE))
  );
  for (const [code, kind] of CODE_KIND) {
    assert(
      `'${code}' is ${kind}, and the verdict names the code it came from`,
      ok(() => {
        const r = mod.interpretResendErrorCode(code);
        return r.kind === kind && r.code === code && r.recognised === true;
      })
    );
  }
  assert(
    '⚠ THE FOUR KEY FAILURES SHARE ONE KIND — missing, invalid, restricted and invalid_access are ' +
      'all "the key will not do", which is the ONLY outcome this environment produces ([[GTC-247]])',
    ok(() => {
      const kinds = [
        'missing_api_key',
        'invalid_api_key',
        'restricted_api_key',
        'invalid_access',
      ].map((c) => mod.interpretResendErrorCode(c).kind);
      return new Set(kinds).size === 1;
    })
  );
  assert(
    '⚠ AND A SPENT QUOTA IS NOT AN AUTH FAILURE AND NOT A BROKEN REQUEST. It is its own kind, ' +
      'because the account is fine and the request is fine and the allowance is gone — three ' +
      'different things to tell a host',
    ok(() => {
      const quota = mod.interpretResendErrorCode('daily_quota_exceeded').kind;
      return (
        quota === mod.interpretResendErrorCode('monthly_quota_exceeded').kind &&
        quota !== mod.interpretResendErrorCode('invalid_api_key').kind &&
        quota !== mod.interpretResendErrorCode('validation_error').kind &&
        quota !== mod.interpretResendErrorCode('internal_server_error').kind
      );
    })
  );

  // ── Layer U: what an unknown code does ───────────────────────────────────
  section('Layer U: an unrecognised code is recorded, never rejected, never coerced');

  assert(
    'a code the installed SDK does not declare is UNRECOGNISED and its value is kept verbatim, so ' +
      "it can be read afterwards — GTC-264's rule, and here it also means the SDK and the live API " +
      'have diverged',
    ok(() => {
      const r = mod.interpretResendErrorCode('teapot_error');
      return r.kind === 'UNRECOGNISED' && r.code === 'teapot_error' && r.recognised === false;
    })
  );
  assert(
    'null, undefined and "" are UNRECOGNISED with a null code — an absent code is not an empty one, ' +
      'and neither is defaulted to anything',
    ok(() =>
      [null, undefined, ''].every((v) => {
        const r = mod.interpretResendErrorCode(v as any);
        return r.kind === 'UNRECOGNISED' && r.code === null && r.recognised === false;
      })
    )
  );
  assert(
    '⚠ AND A JAVASCRIPT ERROR NAME IS UNRECOGNISED. `TypeError` and `Error` are what `err.name` ' +
      "holds on the senders' THROWN path, and that path is not a provider answer at all — so if one " +
      'ever leaked into this field the classification refuses it rather than believing it',
    ok(() =>
      ['TypeError', 'Error', 'AbortError'].every(
        (v) => mod.interpretResendErrorCode(v).recognised === false
      )
    )
  );

  // ── Layer P: no policy in the contract ───────────────────────────────────
  section('Layer P: the contract says what the provider said, and decides nothing');

  const src = stripComments(read(MODULE));
  assert(
    '⚠ NO RETRY POLICY IN THE CONTRACT MODULE — no exported isRetryable, shouldRetry, backoff or ' +
      'attempt. The provider states a fact; the dispatcher owns the schedule, and the schedule is ' +
      'what makes a spent daily quota terminal',
    src.length > 0 &&
      !/export (?:const|function|type|interface) \w*(?:Retry|Backoff|Attempt)/i.test(src)
  );
  assert(
    'CONTROL: that matcher really matches — asserted against planted source, because an absence ' +
      'found by a broken pattern is not an absence',
    /export (?:const|function|type|interface) \w*(?:Retry|Backoff|Attempt)/i.test(
      'export function shouldRetryThis() {}'
    )
  );
  assert(
    'and no KIND is named for a policy either — not RETRYABLE, not TERMINAL. A kind names what the ' +
      'provider said',
    ok(() =>
      CODE_KIND.every(([code]) => !/RETRY|TERMINAL/i.test(mod.interpretResendErrorCode(code).kind))
    )
  );
  assert(
    'the module is a LIBRARY: no prisma, no fetch, no route, no writer — the same fence phase 1 has',
    src.length > 0 && !/prisma|fetch\(|NextResponse/.test(src)
  );
  assert(
    '⚠ AND IT IS A SECOND FILE BESIDE THE DELIVERY CONTRACT, FOR A STATED REASON — each names the ' +
      'other, so a reader of one finds the other rather than concluding it is the only one',
    read(MODULE).includes('resend-delivery-contract') &&
      read(DELIVERY).includes('resend-error-contract')
  );

  // ── Layer W: the widening reaches the sender's result ────────────────────
  section(
    'Layer W: SendResult carries the code and the status, and the exception path carries neither'
  );

  const emailSrc = read(EMAIL);
  assert(
    'SendResult declares providerErrorCode and providerStatusCode',
    /providerErrorCode\?: string/.test(emailSrc) && /providerStatusCode\?: number/.test(emailSrc)
  );
  assert(
    "⚠ THE CODE IS CARRIED AS A STRING AND NOT AS THE SDK'S UNION, DELIBERATELY. Typing the return " +
      'as the 21 would be a claim that the live API only ever answers with a declared code — which ' +
      'is exactly the unobserved-shape limit [[GTC-323]] exists for. Verbatim in, classified ' +
      'separately',
    !/providerErrorCode\?: ResendErrorCode/.test(emailSrc)
  );
  assert(
    '⚠ AND NO catch BLOCK SETS EITHER FIELD — a thrown error is not a provider answer, and `err.name` ' +
      'on that path is a JavaScript class name. Source-read, and named as a source-read: the ' +
      "behavioural half is layer U above and the widening's own suite",
    ok(() => {
      const catches = emailSrc.split(/\} catch/).slice(1);
      return (
        catches.length >= 4 && catches.every((c) => !/providerErrorCode|providerStatusCode/.test(c))
      );
    })
  );
  assert(
    'CONTROL: that split really found the catch blocks — there are at least four senders and each ' +
      'has one, so the absence above is measured over real text',
    emailSrc.split(/\} catch/).length - 1 >= 4
  );

  // ── Layer D: the decision, and its order ────────────────────────────────
  section('Layer D: the dispatcher reads the code first, the status second, the prose last');

  assert(
    'the dispatcher takes a failure OBJECT rather than a bare string — the code has to reach the ' +
      'decision to be read at all',
    ok(() => typeof dispatch.isRetryableProviderError === 'function') &&
      /isRetryableProviderError\(failure: ProviderFailure\)/.test(read(DISPATCH))
  );
  assert(
    'a busy provider and a broken provider are retried; a refused key, a spent quota and a bad ' +
      'request are not',
    ok(
      () =>
        dispatch.isRetryableProviderError({ error: 'x', code: 'rate_limit_exceeded' }) === true &&
        dispatch.isRetryableProviderError({ error: 'x', code: 'internal_server_error' }) === true &&
        dispatch.isRetryableProviderError({ error: 'x', code: 'application_error' }) === true &&
        dispatch.isRetryableProviderError({ error: 'x', code: 'invalid_api_key' }) === false &&
        dispatch.isRetryableProviderError({ error: 'x', code: 'daily_quota_exceeded' }) === false &&
        dispatch.isRetryableProviderError({ error: 'x', code: 'validation_error' }) === false
    )
  );
  assert(
    '⚠ THE CODE BEATS THE PROSE, AND THIS IS THE WHOLE POINT OF THE WIDENING. A message that reads ' +
      'like a rate limit is NOT retried when the code says the request was refused, and a message ' +
      'that reads like an invalid api key IS retried when the code says the provider is busy — both ' +
      'directions, because one direction is satisfiable by the prose matcher alone',
    ok(
      () =>
        dispatch.isRetryableProviderError({
          error: '429 rate limit exceeded, try again',
          code: 'validation_error',
        }) === false &&
        dispatch.isRetryableProviderError({
          error: '401 Unauthorized: invalid api key',
          code: 'rate_limit_exceeded',
        }) === true
    )
  );
  assert(
    '⚠ AND THE STATUS IS THE SECOND READING, NOT THE FIRST. With an UNRECOGNISED code a 429 or a ' +
      '5xx is retried and every other 4xx is terminal — so a newer API code than the installed SDK ' +
      'falls to the protocol rather than to prose',
    ok(
      () =>
        dispatch.isRetryableProviderError({ error: 'x', code: 'teapot_error', status: 429 }) ===
          true &&
        dispatch.isRetryableProviderError({ error: 'x', code: 'teapot_error', status: 503 }) ===
          true &&
        dispatch.isRetryableProviderError({ error: 'x', code: 'teapot_error', status: 422 }) ===
          false &&
        dispatch.isRetryableProviderError({ error: 'x', code: 'teapot_error', status: 401 }) ===
          false
    )
  );
  assert(
    '⚠ AND A RECOGNISED CODE IS NOT OVERRULED BY A STATUS THAT DISAGREES — the vocabulary is more ' +
      'specific than the protocol, and a 500 carrying `validation_error` is still a refused request',
    ok(
      () =>
        dispatch.isRetryableProviderError({
          error: 'x',
          code: 'validation_error',
          status: 500,
        }) === false
    )
  );
  assert(
    'THE PROSE IS THE LAST RESORT AND IT STILL WORKS — SMS has no code vocabulary in this tree and ' +
      "email's thrown path has no provider answer at all, so both arrive with the message only",
    ok(
      () =>
        dispatch.isRetryableProviderError({ error: '429 Too Many Requests' }) === true &&
        dispatch.isRetryableProviderError({ error: '503 Service Unavailable' }) === true &&
        dispatch.isRetryableProviderError({ error: '422 Unprocessable' }) === false &&
        dispatch.isRetryableProviderError({ error: '401 Unauthorized' }) === false
    )
  );
  assert(
    '⚠ AND THE PROSE PATH KEEPS ITS AUTH GUARD IN PRECEDENCE, asserted with a string that matches ' +
      'BOTH patterns — found by slice 5c mutation M4, where "401 Unauthorized" alone passed with the ' +
      'guard deleted because no retry pattern matched it either',
    ok(
      () =>
        dispatch.isRetryableProviderError({
          error: '401 Unauthorized: rate limit on an invalid api key',
        }) === false &&
        dispatch.isRetryableProviderError({ error: '503 rate limit, try again' }) === true
    )
  );
  assert(
    '⚠ THE DISPATCHER PASSES THE CODE AT THE EMAIL CALL SITE — the widening reaching the type and ' +
      'not the call would read as done and change nothing',
    /isRetryableProviderError\(\{\s*error,\s*code: sent\.providerErrorCode,\s*status: sent\.providerStatusCode,?\s*\}\)/.test(
      read(DISPATCH)
    )
  );
  assert(
    'and the SMS call site passes the message alone, because TNZ has no code in this shape — its ' +
      "own 21-value vocabulary is [[GTC-264]]'s and is read off a delivery receipt, not a submission",
    /isRetryableProviderError\(\{ error \}\)/.test(read(DISPATCH))
  );

  // ── Layer L: what is NOT done here ──────────────────────────────────────
  section('Layer L: the limits, asserted so they are not mistaken for oversights');

  const rejectionBody = fnBody(
    stripComments(read(DISPATCH)),
    'export async function recordRejection'
  );
  assert(
    "CONTROL: the function-body reader is BOUNDED — it finds recordRejection's own body and stops " +
      'before the next export, so the absence below is about that function and not about the file',
    rejectionBody.length > 0 &&
      rejectionBody.length < stripComments(read(DISPATCH)).length / 4 &&
      /rejectedAt/.test(rejectionBody) &&
      !/drainOnce/.test(rejectionBody)
  );
  assert(
    "⚠ THE CODE IS STILL NOT PERSISTED. `providerError` holds the provider's words VERBATIM and gains " +
      'no code prefix; the COLUMN now exists (phase 3a) and `recordRejection` does not write it yet. ' +
      'So the DECISION has the code and the RECORD does not, and THIS ASSERTION IS THE 3b MARKER — ' +
      'it inverts in the commit that adds the writer',
    /providerError: args\.error/.test(rejectionBody) && !/providerErrorCode/.test(rejectionBody)
  );
  /*
   * ✅ THE FENCE BELOW FIRED, AND RECORDING THAT IS WORTH MORE THAN QUIETLY FLIPPING IT.
   *
   * Phase 2 asserted the schema had NO `providerErrorCode` column, because the widening was ruled to
   * carry no migration — *"the fence that makes it a fact rather than a promise."* GTC-289 phase 3a
   * adds the column on a founder ruling, and that assertion went RED the moment the column landed.
   * **That is the fence working, not a stale test.** [[GTC-192]]'s false-label rule says the label
   * moves in the same edit as the fact, so both labels here moved rather than one.
   *
   * What is fenced NOW is the half that is still ruled: `providerStatusCode` was ruled OUT — *"a
   * stored value nothing reads is the derivable-drift risk with no consumer to pay for it. The status
   * is read by the retry at the moment it has the live envelope; it never needs to survive."*
   */
  assert(
    '✅ THE COLUMN EXISTS AND ITS RULED-OUT TWIN DOES NOT — providerErrorCode is on OutboundMessage ' +
      '(phase 3a) and providerStatusCode is absent, ruled: the status is read by the retry while it ' +
      'holds the live envelope and never needs to survive. Zone 5',
    ok(() => {
      const schema = read('prisma/schema.prisma');
      return (
        schema.length > 0 &&
        /providerErrorCode String\?/.test(schema) &&
        !/providerStatusCode/.test(schema)
      );
    })
  );
  assert(
    '⚠ AND THE FOUR POLL COLUMNS HAVE NO WRITER EITHER — deliveryState, providerLastEvent, ' +
      'deliveryCheckedAt and deliveryPollDoneAt exist in the schema and appear nowhere in src/, ' +
      'because the poller is a later phase. Slice 4b shipped a field nothing read for the same reason ' +
      'and said so',
    ok(() => {
      const schema = read('prisma/schema.prisma');
      const dispatchSrc = read(DISPATCH);
      const emailDelivery = read(DELIVERY) + read(MODULE);
      const names = [
        'deliveryState',
        'providerLastEvent',
        'deliveryCheckedAt',
        'deliveryPollDoneAt',
      ];
      return (
        names.every((n) => schema.includes(n)) &&
        names.every((n) => !dispatchSrc.includes(n) && !emailDelivery.includes(n))
      );
    })
  );
  assert(
    '⚠ AND NOTHING HERE CLASSIFIES A BOUNCE. A submission error is the provider refusing to take the ' +
      'message; a bounce is the receiving side refusing it after acceptance. Phase 1 owns the second ' +
      'and asserts no hard/soft partition; this module must not grow one either',
    src.length > 0 && !/HARD|SOFT|bounce/i.test(src)
  );
  assert(
    "CONTROL: that matcher really matches — planted source, same reason as layer P's control",
    /HARD|SOFT|bounce/i.test("const b = 'HARD_BOUNCE';")
  );
  assert(
    '⚠ AND THE ONE THING NO SUITE CAN PROVE: not one of the 21 codes has been OBSERVED coming back ' +
      'from Resend. The classification is inference from the names and the module says so — ' +
      '[[GTC-323]] is the artifact and [[GTC-247]] is the live key',
    read(MODULE).includes('GTC-323') && read(MODULE).includes('GTC-247')
  );
  assert(
    'and the two classifications that are least certain are NAMED in the module rather than presented ' +
      'as known — application_error and security_error',
    read(MODULE).includes('application_error') &&
      /UNCERTAIN|least certain|not documented|inference/i.test(read(MODULE))
  );
}

main()
  .catch((err) => {
    console.error('\x1b[31mSuite crashed:\x1b[0m', err);
    failed++;
    redAssertions.push('suite crashed');
  })
  .finally(() => {
    console.log('\n\x1b[1m\x1b[33m=== Test Summary ===\x1b[0m');
    console.log(`Total tests: ${passed + failed}`);
    console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
    console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
    if (failed > 0) {
      console.log('\n\x1b[31mRED:\x1b[0m');
      redAssertions.forEach((a) => console.log(`  ${a}`));
    }
    process.exit(failed > 0 ? 1 : 0);
  });
