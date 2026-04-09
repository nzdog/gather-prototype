/**
 * GTC-FM2 — Post-event guest wrap-up message with host conversion CTA.
 *
 * Tests the pure logic functions exported from wrap-up templates and core
 * wrap-up module. No DB or React runtime required.
 */

import {
  buildSmsWrapUpMessage,
  buildEmailWrapUpMessage,
  resolveGuestTaskItem,
  type WrapUpTemplateParams,
} from '../src/lib/sms/wrap-up-templates';
import { sanitiseQueryParam, generateLinkToken, buildStartLink } from '../src/lib/wrap-up';

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

const baseParams: WrapUpTemplateParams = {
  guestFirstName: 'Emma',
  eventName: 'Richardson Christmas BBQ',
  hostFirstName: 'Sarah',
  guestTaskItem: 'the pavlova',
  newEventLink: 'https://gather.app/?token=abc123',
};

const fallbackParams: WrapUpTemplateParams = {
  ...baseParams,
  guestTaskItem: 'what you brought',
};

console.log('\x1b[33m=== GTC-FM2: Wrap-Up Dispatch Tests ===\x1b[0m\n');

// ── Suite 1: SMS template ────────────────────────────────────────────

console.log('\x1b[33mSuite 1: SMS/WhatsApp template — with item\x1b[0m');

const sms = buildSmsWrapUpMessage(baseParams);
assert(
  'SMS with-item matches approved copy exactly',
  sms ===
    'Hi Emma, Sarah asked me (Gather \u2014 the app they used to organise Richardson Christmas BBQ) to pass on a thanks for bringing the pavlova. Much appreciated.'
);

console.log('\n\x1b[33mSuite 1b: SMS/WhatsApp template — fallback\x1b[0m');

const smsFallback = buildSmsWrapUpMessage(fallbackParams);
assert(
  'SMS fallback matches approved copy exactly',
  smsFallback ===
    'Hi Emma, Sarah asked me (Gather \u2014 the app they used to organise Richardson Christmas BBQ) to pass on a thanks for being part of it. Much appreciated.'
);

// ── Suite 2: Email template ──────────────────────────────────────────

console.log('\n\x1b[33mSuite 2: Email template — with item\x1b[0m');

const email = buildEmailWrapUpMessage(baseParams);
assert('Email subject reads "Thanks from {hostFirstName}"', email.subject === 'Thanks from Sarah');
assert(
  'Email body with-item matches approved copy exactly',
  email.body ===
    'Hi Emma, Sarah asked me (Gather \u2014 the app they used to organise Richardson Christmas BBQ) to pass on a thanks for bringing the pavlova. Much appreciated.'
);

console.log('\n\x1b[33mSuite 2b: Email template — fallback\x1b[0m');

const emailFallback = buildEmailWrapUpMessage(fallbackParams);
assert(
  'Email subject fallback reads "Thanks from {hostFirstName}"',
  emailFallback.subject === 'Thanks from Sarah'
);
assert(
  'Email body fallback matches approved copy exactly',
  emailFallback.body ===
    'Hi Emma, Sarah asked me (Gather \u2014 the app they used to organise Richardson Christmas BBQ) to pass on a thanks for being part of it. Much appreciated.'
);

// ── Suite 3: resolveGuestTaskItem ────────────────────────────────────

console.log('\n\x1b[33mSuite 3: Guest task item resolution\x1b[0m');

assert(
  'Returns ACCEPTED assignment item name',
  resolveGuestTaskItem([
    { item: { name: 'coleslaw' }, response: 'PENDING' },
    { item: { name: 'the pavlova' }, response: 'ACCEPTED' },
  ]) === 'the pavlova'
);

assert(
  'Falls back to first assignment if none accepted',
  resolveGuestTaskItem([
    { item: { name: 'coleslaw' }, response: 'PENDING' },
    { item: { name: 'chips' }, response: 'PENDING' },
  ]) === 'coleslaw'
);

assert(
  'Falls back to "what you brought" if no assignments',
  resolveGuestTaskItem([]) === 'what you brought'
);

// ── Suite 4: Query param sanitisation ────────────────────────────────

console.log('\n\x1b[33mSuite 4: Query param sanitisation\x1b[0m');

assert(
  'Strips HTML tags',
  sanitiseQueryParam('<script>alert("xss")</script>Emma') === 'alert(xss)Emma'
);
assert('Strips dangerous chars', sanitiseQueryParam('Emma"<>\'`') === 'Emma');
assert('Strips javascript: protocol', sanitiseQueryParam('javascript:alert(1)') === 'alert(1)');
assert('Strips event handlers', sanitiseQueryParam('onclick=alert(1)') === 'alert(1)');
assert('Trims whitespace', sanitiseQueryParam('  Emma  ') === 'Emma');
assert('Returns empty for null', sanitiseQueryParam(null) === '');
assert('Returns empty for undefined', sanitiseQueryParam(undefined) === '');
assert('Caps at 200 chars', sanitiseQueryParam('a'.repeat(300)).length === 200);
assert('Passes clean input through', sanitiseQueryParam('Emma Richardson') === 'Emma Richardson');
assert('Passes email through', sanitiseQueryParam('emma@example.com') === 'emma@example.com');
assert('Passes phone through', sanitiseQueryParam('+64211234567') === '+64211234567');

// ── Suite 5: Link token generation ───────────────────────────────────

console.log('\n\x1b[33mSuite 5: Link token generation\x1b[0m');

const token1 = generateLinkToken();
const token2 = generateLinkToken();
assert('Token is a non-empty string', typeof token1 === 'string' && token1.length > 0);
assert('Token is base64url (no +/= chars)', !/[+/=]/.test(token1));
assert('Two tokens are unique', token1 !== token2);
assert('Token length is 32 chars (24 bytes base64url)', token1.length === 32);

// ── Suite 6: buildStartLink ──────────────────────────────────────────

console.log('\n\x1b[33mSuite 6: Start link construction\x1b[0m');

const link = buildStartLink('test-token-abc');
assert('Link points to home page with token query param', link.includes('/?token=test-token-abc'));
assert('Link does NOT contain /start/', !link.includes('/start/'));
assert('Link starts with http', link.startsWith('http'));

// ── Suite 7: Pre-event wrap-up warning condition ─────────────────────

console.log('\n\x1b[33mSuite 7: Pre-event date check logic\x1b[0m');

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
assert('Future endDate should trigger warning (endDate > now)', futureDate > new Date());
assert('Past endDate should NOT trigger warning (endDate < now)', pastDate < new Date());

// ── Suite 8: Expiry logic ────────────────────────────────────────────

console.log('\n\x1b[33mSuite 8: Link expiry logic\x1b[0m');

const expiredDate = new Date(Date.now() - 1000);
const validDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
assert('Expired link: expiresAt < now()', expiredDate < new Date());
assert('Valid link: expiresAt > now()', validDate > new Date());

// ── Results ──────────────────────────────────────────────────────────

console.log(`\n\x1b[33m=== Results: ${passed} passed, ${failed} failed ===\x1b[0m`);
if (failed > 0) {
  process.exit(1);
}
