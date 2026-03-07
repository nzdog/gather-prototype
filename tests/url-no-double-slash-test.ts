/**
 * GTC-010 — URL No Double Slash Test
 *
 * Asserts that generated participant (/p/), host (/h/), and coordinator (/c/)
 * links never contain double slashes regardless of whether NEXT_PUBLIC_APP_URL
 * has a trailing slash.
 */

import { buildTokenUrl } from '../src/lib/tokens';

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean) {
  if (condition) {
    console.log(`✓ ${description}`);
    passed++;
  } else {
    console.error(`✗ ${description}`);
    failed++;
  }
}

const FAKE_TOKEN = 'abc123def456';

// Test cases: baseUrl variants that should all produce clean URLs
const baseUrlVariants = [
  { label: 'trailing slash', url: 'https://example.com/' },
  { label: 'no trailing slash', url: 'https://example.com' },
  { label: 'trailing slash (localhost)', url: 'http://localhost:3000/' },
  { label: 'no trailing slash (localhost)', url: 'http://localhost:3000' },
  { label: 'empty string', url: '' },
];

const scopes = [
  { scope: 'PARTICIPANT' as const, prefix: 'p' },
  { scope: 'HOST' as const, prefix: 'h' },
  { scope: 'COORDINATOR' as const, prefix: 'c' },
];

console.log('=== GTC-010: URL No Double Slash Test ===\n');

for (const { label, url } of baseUrlVariants) {
  for (const { scope, prefix } of scopes) {
    const result = buildTokenUrl(url, scope, FAKE_TOKEN);
    const hasDoubleSlash = result.includes('//') && !result.startsWith('http');
    // Allow http:// or https:// protocol double slash, but not path double slashes
    const pathPart = result.replace(/^https?:\/\//, '');
    const pathHasDoubleSlash = pathPart.includes('//');

    assert(
      `[${label}] scope=${scope} → no double slash in path (got: ${result})`,
      !pathHasDoubleSlash
    );
    assert(
      `[${label}] scope=${scope} → ends with /${prefix}/${FAKE_TOKEN}`,
      result.endsWith(`/${prefix}/${FAKE_TOKEN}`)
    );
  }
}

// Explicit regression cases
const trailingSlashBase = 'https://gather.app/';
assert(
  `/p/ link with trailing-slash base has no double slash`,
  !buildTokenUrl(trailingSlashBase, 'PARTICIPANT', FAKE_TOKEN)
    .replace('https://', '')
    .includes('//')
);
assert(
  `/h/ link with trailing-slash base has no double slash`,
  !buildTokenUrl(trailingSlashBase, 'HOST', FAKE_TOKEN).replace('https://', '').includes('//')
);
assert(
  `/c/ link with trailing-slash base has no double slash`,
  !buildTokenUrl(trailingSlashBase, 'COORDINATOR', FAKE_TOKEN)
    .replace('https://', '')
    .includes('//')
);

console.log(`\n=== Test Summary ===`);
console.log(`Total tests: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error(`\n✗ ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log(`\n✓ All tests passed!`);
}
