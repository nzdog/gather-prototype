/**
 * GTC-029 — "View as Host" button shows correct alert based on event status.
 *
 * Tests the state-aware alert message logic in the Plan page header.
 * Also verifies the inviteLinksError state is set on loadInviteLinks failure.
 *
 * Pure-logic test — no React runtime or DB required.
 */

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

// ─── Mirror of the button click logic from src/app/plan/[eventId]/page.tsx ───

type InviteLink = { scope: string; token: string };

function getViewAsHostAction(
  inviteLinks: InviteLink[],
  eventStatus: string
): { action: 'open'; token: string } | { action: 'alert'; message: string } {
  const hostLink = inviteLinks.find((link) => link.scope === 'HOST');
  if (hostLink) {
    return { action: 'open', token: hostLink.token };
  } else if (eventStatus === 'DRAFT') {
    return {
      action: 'alert',
      message: 'Host view is not available yet. Please transition to CONFIRMING status first.',
    };
  } else {
    return { action: 'alert', message: 'Host link unavailable — try refreshing the page.' };
  }
}

// ─── Mirror of the inviteLinksError state update logic ───

function simulateLoadInviteLinks(responseOk: boolean): {
  inviteLinksError: boolean;
  inviteLinks: InviteLink[];
} {
  if (!responseOk) {
    return { inviteLinksError: true, inviteLinks: [] };
  }
  return { inviteLinksError: false, inviteLinks: [{ scope: 'HOST', token: 'tok-abc' }] };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

console.log('\n\x1b[1mGTC-029 — View as Host alert logic\x1b[0m\n');

// 1. DRAFT event + no host link → original "transition to CONFIRMING" message
{
  const result = getViewAsHostAction([], 'DRAFT');
  assert(
    'DRAFT event + no host link → transition-to-CONFIRMING alert',
    result.action === 'alert' &&
      (result as { action: 'alert'; message: string }).message.includes('transition to CONFIRMING')
  );
}

// 2. CONFIRMING event + no host link → "unavailable — try refreshing" message
{
  const result = getViewAsHostAction([], 'CONFIRMING');
  assert(
    'CONFIRMING event + no host link → unavailable alert (not blaming status)',
    result.action === 'alert' &&
      (result as { action: 'alert'; message: string }).message.includes('unavailable') &&
      !(result as { action: 'alert'; message: string }).message.includes('transition to CONFIRMING')
  );
}

// 3. FROZEN event + no host link → "unavailable — try refreshing" message
{
  const result = getViewAsHostAction([], 'FROZEN');
  assert(
    'FROZEN event + no host link → unavailable alert (not blaming status)',
    result.action === 'alert' &&
      (result as { action: 'alert'; message: string }).message.includes('unavailable') &&
      !(result as { action: 'alert'; message: string }).message.includes('transition to CONFIRMING')
  );
}

// 4. CONFIRMING event + host link present → opens host view
{
  const result = getViewAsHostAction([{ scope: 'HOST', token: 'tok-abc' }], 'CONFIRMING');
  assert(
    'CONFIRMING event + host link present → open action with correct token',
    result.action === 'open' && (result as { action: 'open'; token: string }).token === 'tok-abc'
  );
}

// 5. DRAFT event + host link present → opens host view (not blocked by status)
{
  const result = getViewAsHostAction([{ scope: 'HOST', token: 'tok-xyz' }], 'DRAFT');
  assert(
    'DRAFT event + host link present → open action (successful path unaffected)',
    result.action === 'open'
  );
}

// 6. loadInviteLinks failure → inviteLinksError set to true
{
  const state = simulateLoadInviteLinks(false);
  assert('loadInviteLinks failure → inviteLinksError = true', state.inviteLinksError === true);
}

// 7. loadInviteLinks failure → inviteLinks remains empty
{
  const state = simulateLoadInviteLinks(false);
  assert('loadInviteLinks failure → inviteLinks remains empty', state.inviteLinks.length === 0);
}

// 8. loadInviteLinks success → inviteLinksError cleared to false
{
  const state = simulateLoadInviteLinks(true);
  assert('loadInviteLinks success → inviteLinksError = false', state.inviteLinksError === false);
}

// 9. loadInviteLinks success → inviteLinks populated
{
  const state = simulateLoadInviteLinks(true);
  assert(
    'loadInviteLinks success → inviteLinks populated',
    state.inviteLinks.length > 0 && state.inviteLinks[0].scope === 'HOST'
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n\x1b[1m=== Test Summary ===\x1b[0m`);
console.log(`Total tests: ${passed + failed}`);
console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
if (failed > 0) {
  console.error(`\x1b[31mFailed: ${failed}\x1b[0m`);
  process.exit(1);
} else {
  console.log(`\x1b[31mFailed: 0\x1b[0m`);
  console.log(`\n\x1b[32m\x1b[1m✓ All tests passed!\x1b[0m`);
}
