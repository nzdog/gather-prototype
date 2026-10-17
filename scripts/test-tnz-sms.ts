/**
 * TNZ SMS smoke test
 *
 * Sends a single SMS via the TNZ transport to verify that
 * TNZ_AUTH_TOKEN is valid and the endpoint is reachable. This is a
 * LIVE send — set TEST_SMS_RECIPIENT to a real NZ mobile in E.164
 * format before running, or the script will refuse to proceed.
 *
 * Run with: GATHER_LIVE_SENDS=on TEST_SMS_RECIPIENT=+64XXXXXXXXX npm run live:tnz-sms
 *
 * ⚠ [[GTC-274]] — IT SENDS ONLY WITH THE LIVE SWITCH ON, FOR THIS ONE PROCESS. That is a deliberate
 * live run: this one named script, the setting on its own command line and nowhere else, to the
 * founder's own number, on the founder's word in chat. Never set it in `.env` or `.env.local`
 * (`tests/live-switch-test.ts` fails if either does). Without it, `sendViaTnz` stops before its
 * fetch and this script refuses by name below.
 *
 * ⚠ RENAMED FROM `test:tnz-sms` ON 2026-09-27 (founder ruling, GTC-189 slice 8's gate). The gate is
 * now every `test:*` script in package.json, so a live send in that namespace would text someone
 * the day a TNZ token is set.
 */

import { sendViaTnz, isTnzEnabled } from '../src/lib/sms/tnz-client';
import { isLiveSendingOn, LIVE_SENDS_OFF } from '../src/lib/live-sends';

const RECIPIENT = process.env.TEST_SMS_RECIPIENT ?? '+64XXXXXXXXXX';
const MESSAGE = "Gather TNZ SMS test — if you received this it's working.";

async function main() {
  if (RECIPIENT === '+64XXXXXXXXXX') {
    console.error('Set TEST_SMS_RECIPIENT env var before running');
    process.exit(1);
  }

  if (!isTnzEnabled()) {
    console.error('TNZ_AUTH_TOKEN not set');
    process.exit(1);
  }

  if (!isLiveSendingOn()) {
    console.error(`REFUSED — ${LIVE_SENDS_OFF}. This script sends a real text; see its header.`);
    process.exit(1);
  }

  console.log(`[TNZ test] Sending to ${RECIPIENT}`);
  console.log(`[TNZ test] Message: ${MESSAGE}`);

  const result = await sendViaTnz({ to: RECIPIENT, message: MESSAGE });

  console.log('[TNZ test] Full response:');
  console.log(JSON.stringify(result, null, 2));

  if (result.success) {
    console.log('SUCCESS');
    process.exit(0);
  } else {
    console.log(`FAILED: ${result.error ?? 'unknown error'}`);
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`FAILED: ${message}`);
  process.exit(1);
});
