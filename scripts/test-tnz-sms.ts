/**
 * TNZ SMS smoke test
 *
 * Sends a single SMS via the TNZ transport to verify that
 * TNZ_AUTH_TOKEN is valid and the endpoint is reachable. This is a
 * LIVE send — set TEST_SMS_RECIPIENT to a real NZ mobile in E.164
 * format before running, or the script will refuse to proceed.
 *
 * Run with: TEST_SMS_RECIPIENT=+64XXXXXXXXX npm run test:tnz-sms
 */

import { sendViaTnz, isTnzEnabled } from '../src/lib/sms/tnz-client';

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
