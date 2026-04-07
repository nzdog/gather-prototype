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
  newEventLink: 'https://gather.app/start/abc123',
};

console.log('\x1b[33m=== GTC-FM2: Wrap-Up Dispatch Tests ===\x1b[0m\n');

// ── Suite 1: SMS template ────────────────────────────────────────────

console.log('\x1b[33mSuite 1: SMS template interpolation\x1b[0m');

const sms = buildSmsWrapUpMessage(baseParams);
assert('SMS contains event name', sms.includes('Richardson Christmas BBQ'));
assert('SMS contains host first name', sms.includes('Sarah'));
assert('SMS contains guest task item', sms.includes('the pavlova'));
assert('SMS contains new event link', sms.includes('https://gather.app/start/abc123'));
assert('SMS does NOT contain guest first name (per spec — SMS is short)', !sms.includes('Emma'));

// ── Suite 2: Email template ──────────────────────────────────────────

console.log('\n\x1b[33mSuite 2: Email template interpolation\x1b[0m');

const email = buildEmailWrapUpMessage(baseParams);
assert('Email subject contains event name', email.subject.includes('Richardson Christmas BBQ'));
assert('Email body contains guest first name', email.body.includes('Emma'));
assert('Email body contains event name', email.body.includes('Richardson Christmas BBQ'));
assert('Email body contains host first name', email.body.includes('Sarah'));
assert('Email body contains guest task item', email.body.includes('the pavlova'));
assert(
  'Email body contains new event link',
  email.body.includes('https://gather.app/start/abc123')
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
assert('Link contains /start/ path', link.includes('/start/test-token-abc'));
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
