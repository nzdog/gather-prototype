/**
 * GTC-208 — `/api/sms/test-send` removed, not guarded.
 *
 * The route had zero auth on its POST, took a caller-supplied `to`, and reached a
 * real SMS send via `sendSms()` (TNZ for +64/+61, Twilio otherwise) — gated only by
 * E.164 format and per-host opt-out, never by auth. It had no callers anywhere in the
 * app (confirmed by repo-wide grep) and its own docstring described it as a manual
 * curl-only dev/debug tool. Ruling: REMOVE rather than guard — there is no caller to
 * preserve, and a permanently-guarded real-SMS-send route is more surface than a
 * deleted one.
 *
 * This is a structural, filesystem-level test, not a live HTTP/route-handler test:
 * Next's App Router resolves routes from the filesystem, so the absence of
 * `route.ts` at this path IS the 404 — there is no handler left to invoke in-process
 * (the house pattern used elsewhere, e.g. security-validation.ts, requires a handler
 * to call). Also confirms no code or config anywhere still imports/references the
 * removed path, and that the underlying send infrastructure it borrowed
 * (`sendSms`/`sendViaTnz`) is untouched — this ticket deleted a caller, not the
 * infrastructure real routes depend on.
 *
 * No SMS is sent by this test, live or otherwise — it only inspects the filesystem
 * and source text.
 *
 * Run: npx tsx tests/sms-test-send-removed-test.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`${GREEN}✓${RESET} ${label}`);
    passed++;
  } else {
    console.error(`${RED}✗${RESET} ${label}`);
    failed++;
    redAssertions.push(label);
  }
}

const ROOT = path.join(__dirname, '..');
const ROUTE_PATH = 'src/app/api/sms/test-send/route.ts';
const ROUTE_DIR = 'src/app/api/sms/test-send';

function readCode(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

console.log(`${BOLD}${YELLOW}=== GTC-208: /api/sms/test-send removed ===${RESET}\n`);

// ── The route no longer exists ─────────────────────────────────────────────
// App Router has no dynamic registration — a missing route.ts at this path IS the
// 404. There is nothing left to invoke in-process; the file's absence is the proof.
assert(
  'route.ts no longer exists at src/app/api/sms/test-send [an unauthenticated POST now 404s]',
  !fs.existsSync(path.join(ROOT, ROUTE_PATH))
);
assert(
  'the route directory itself is gone, not just emptied',
  !fs.existsSync(path.join(ROOT, ROUTE_DIR))
);

// ── Nothing in code or config still points at it ───────────────────────────
const SEARCH_DIRS = ['src', 'scripts', 'tests'];
const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|json)$/;
const referencingFiles: string[] = [];

function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full);
    } else if (CODE_EXTENSIONS.test(entry.name)) {
      const content = fs.readFileSync(full, 'utf-8');
      if (content.includes('sms/test-send')) {
        referencingFiles.push(path.relative(ROOT, full));
      }
    }
  }
}

for (const dir of SEARCH_DIRS) {
  walk(path.join(ROOT, dir));
}

// This test file itself legitimately mentions the string in comments/constants above
// — exclude it from the "nothing references it" check.
const unexpectedReferences = referencingFiles.filter(
  (f) => f !== 'tests/sms-test-send-removed-test.ts'
);

assert(
  'no code or config in src/scripts/tests still references sms/test-send',
  unexpectedReferences.length === 0
);
if (unexpectedReferences.length > 0) {
  console.error(`  ${RED}Found in:${RESET} ${unexpectedReferences.join(', ')}`);
}

// ── The infrastructure the deleted route borrowed is untouched ────────────
// This ticket removed a caller with no auth, not the send machinery real,
// correctly-guarded routes rely on.
assert(
  'src/lib/sms/send-sms.ts still exists (infra untouched)',
  fs.existsSync(path.join(ROOT, 'src/lib/sms/send-sms.ts'))
);
const sendSmsCode = readCode('src/lib/sms/send-sms.ts');
assert(
  'sendSms still exports the real send function untouched',
  sendSmsCode.includes('export async function sendSms')
);

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n${RED}RED — ${failed} assertion(s) failed:${RESET}`);
  for (const r of redAssertions) console.error(`  ✗ ${r}`);
  process.exit(1);
}
console.log(
  `${GREEN}GREEN — /api/sms/test-send is gone; nothing references it; send infra intact.${RESET}`
);
