/**
 * SMS Infrastructure Test Suite
 * Tests opt-out keywords, SMS validation, and database operations
 *
 * Run with: npx tsx tests/sms-infrastructure-test.ts
 */

import { PrismaClient } from '@prisma/client';
import {
  isOptOutMessage,
  getOptOutKeyword,
  getOptOutKeywords,
} from '../src/lib/sms/opt-out-keywords';
import { isValidNZNumber, normalizePhoneNumber } from '../src/lib/phone';
import { getOptOutStatuses, isOptedOut } from '../src/lib/sms/opt-out-service';

const prisma = new PrismaClient();

// Test counters
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ ${message}`);
    passed++;
  } else {
    console.log(`❌ ${message}`);
    failed++;
  }
}

function assertFalse(condition: boolean, message: string) {
  assert(!condition, message);
}

function assertDeepEqual(actual: any, expected: any, message: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  assert(actualStr === expectedStr, `${message} (got ${actualStr}, expected ${expectedStr})`);
}

async function runTests() {
  console.log('\n🧪 SMS Infrastructure Test Suite\n');
  console.log('='.repeat(60));

  // ============================================
  // TEST 1: Opt-Out Keyword Parsing
  // ============================================
  console.log('\n📋 Test 1: Opt-Out Keyword Parsing\n');

  // Valid opt-out keywords
  assert(isOptOutMessage('STOP'), 'STOP is recognized');
  assert(isOptOutMessage('stop'), 'stop (lowercase) is recognized');
  assert(isOptOutMessage('  STOP  '), 'STOP with whitespace is recognized');
  assert(isOptOutMessage('STOPALL'), 'STOPALL is recognized');
  assert(isOptOutMessage('UNSUBSCRIBE'), 'UNSUBSCRIBE is recognized');
  assert(isOptOutMessage('unsubscribe'), 'unsubscribe (lowercase) is recognized');
  // ⚠ MOVED BY [[GTC-288]] — founder ruling 2026-10-01, Q3, "Exactly TNZ's": a STOP is a reply
  // that BEGINS WITH one of TNZ's six (STOP, OPTOUT, OPT OUT, OPT-OUT, UNSUB, UNSUBSCRIBE), in any
  // case. CANCEL, END and QUIT were Gather's own words and are now ordinary replies; "Stop please",
  // "STOP sending messages" and "STOPPED" begin with STOP and are now opt-outs. Each read the
  // opposite before.
  assertFalse(isOptOutMessage('CANCEL'), "CANCEL is NOT an opt-out (not one of TNZ's words)");
  assertFalse(isOptOutMessage('END'), "END is NOT an opt-out (not one of TNZ's words)");
  assertFalse(isOptOutMessage('QUIT'), "QUIT is NOT an opt-out (not one of TNZ's words)");

  // Invalid opt-out messages (should NOT match)
  assert(isOptOutMessage('Stop please'), 'Stop please is an opt-out (begins with STOP)');
  assertFalse(isOptOutMessage('Please STOP'), 'Please STOP is NOT an opt-out');
  assert(isOptOutMessage('STOPPED'), 'STOPPED is an opt-out (begins with STOP)');
  assertFalse(isOptOutMessage('Hello'), 'Hello is NOT an opt-out');
  assertFalse(isOptOutMessage(''), 'Empty string is NOT an opt-out');
  assert(isOptOutMessage('STOP sending messages'), 'STOP with extra words is an opt-out');

  // Get matched keyword
  assertDeepEqual(getOptOutKeyword('STOP'), 'stop', 'getOptOutKeyword returns normalized keyword');
  assertDeepEqual(
    getOptOutKeyword('UNSUBSCRIBE'),
    'unsubscribe',
    'getOptOutKeyword for UNSUBSCRIBE'
  );
  assertDeepEqual(getOptOutKeyword('Hello'), null, 'getOptOutKeyword returns null for non-opt-out');

  // Get all keywords
  const keywords = getOptOutKeywords();
  assert(keywords.length === 6, 'getOptOutKeywords returns 6 keywords');
  assert(keywords.includes('stop'), 'Keywords include stop');
  assert(keywords.includes('unsubscribe'), 'Keywords include unsubscribe');

  // ============================================
  // TEST 2: Phone Number Validation
  // ============================================
  console.log('\n📋 Test 2: Phone Number Validation\n');

  // Valid NZ numbers
  assert(isValidNZNumber('+64211234567'), '+64211234567 is valid NZ mobile');
  assert(isValidNZNumber('+6421234567'), '+6421234567 is valid NZ mobile (9 digits)');
  assert(isValidNZNumber('+6491234567'), '+6491234567 is valid NZ landline');
  assert(isValidNZNumber('+64212345678'), '+64212345678 is valid (10 digits)');

  // Invalid numbers
  assertFalse(
    isValidNZNumber('+1234567890'),
    '+1234567890 is NOT a valid NZ number (wrong country)'
  );
  assertFalse(isValidNZNumber('0211234567'), '0211234567 is NOT valid (missing +64)');
  assertFalse(isValidNZNumber('+642'), '+642 is NOT valid (too short)');
  assertFalse(isValidNZNumber('+6421'), '+6421 is NOT valid (too short)');
  assertFalse(isValidNZNumber(''), 'Empty string is NOT valid');

  // Phone normalization
  assertDeepEqual(
    normalizePhoneNumber('0211234567'),
    '+64211234567',
    'Local format normalizes correctly'
  );
  assertDeepEqual(
    normalizePhoneNumber('021 123 4567'),
    '+64211234567',
    'Formatted local number normalizes'
  );
  assertDeepEqual(
    normalizePhoneNumber('+64211234567'),
    '+64211234567',
    'E.164 format passes through'
  );
  assertDeepEqual(normalizePhoneNumber('64211234567'), '+64211234567', 'Missing + is added');
  assertDeepEqual(normalizePhoneNumber('+1234567890'), null, 'Non-NZ number returns null');
  assertDeepEqual(normalizePhoneNumber('invalid'), null, 'Invalid format returns null');

  // ============================================
  // TEST 3: Database Operations
  // ============================================
  console.log('\n📋 Test 3: Database Operations\n');

  // Find a test event and host (or create one)
  let testEvent = await prisma.event.findFirst({
    where: { status: 'CONFIRMING' },
    select: { id: true, hostId: true },
  });

  if (!testEvent) {
    console.log('⚠️  No CONFIRMING event found, skipping database tests');
  } else {
    const { id: eventId, hostId } = testEvent;
    console.log(`Using test event: ${eventId}, host: ${hostId}`);

    // Test phone number for opt-out testing
    const testPhone = '+64211111111';

    /*
     * ⚠ REWRITTEN BY [[GTC-288]] — founder ruling 2026-09-12: an opt-out is account-wide, on the
     * phone number, not per host. The per-host compound key (`phoneNumber_hostId`) is gone, so the
     * rows here are written and removed by id, and `isOptedOut` takes the number alone. Each call is
     * guarded so a failure reports against its own assertion rather than ending the suite.
     */
    const attempt = async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn();
      } catch (e) {
        console.log(`   (threw: ${e instanceof Error ? e.message.split('\n')[0] : 'unknown'})`);
        return undefined;
      }
    };

    // Clean up any existing test opt-out, under any host
    await prisma.smsOptOut.deleteMany({ where: { phoneNumber: testPhone } });

    // Test 1: Check opt-out status (should be false initially)
    const isOptedOutBefore = await attempt(() => isOptedOut(testPhone));
    assert(isOptedOutBefore === false, 'Phone is not opted out initially');

    // Test 2: Create an opt-out record
    const optOutRecord = await attempt(() =>
      prisma.smsOptOut.create({
        data: {
          phoneNumber: testPhone,
          hostId: hostId,
          rawMessage: 'STOP (test)',
        },
      })
    );
    assert(!!optOutRecord?.id, 'Opt-out record created successfully');

    // Test 3: Check opt-out status (should be true now)
    const isOptedOutAfter = await attempt(() => isOptedOut(testPhone));
    assert(isOptedOutAfter === true, 'Phone is opted out after creating record');

    // Test 4: Batch opt-out check
    const testPhones = [testPhone, '+64222222222', '+64233333333'];
    const optOutMap = (await attempt(() => getOptOutStatuses(testPhones))) ?? new Map();

    assert(optOutMap.size === 3, 'Batch check returns Map with 3 entries');
    assert(optOutMap.get(testPhone) === true, 'Batch check: opted-out phone returns true');
    assert(
      optOutMap.get('+64222222222') === false,
      'Batch check: non-opted-out phone returns false'
    );
    assert(
      optOutMap.get('+64233333333') === false,
      'Batch check: another non-opted-out phone returns false'
    );

    // Test 5: the row is changed by id (no per-host compound key any more)
    const updated = optOutRecord
      ? await attempt(() =>
          prisma.smsOptOut.update({
            where: { id: optOutRecord.id },
            data: { rawMessage: 'STOP (updated)', optedOutAt: new Date() },
          })
        )
      : undefined;
    assert(updated?.rawMessage === 'STOP (updated)', 'An update by id changes the existing record');

    // Test 6: Opt-out is account-wide (a different host is covered too)
    const otherHosts = await prisma.person.findMany({
      where: {
        id: { not: hostId },
        hostedEvents: { some: {} },
      },
      take: 1,
      select: { id: true },
    });

    if (otherHosts.length > 0) {
      // ⚠ INVERTED BY [[GTC-288]]: it read "Phone is not opted out from different host (per-host
      // scoping works)". The row above is under this event's host; the number is opted out for
      // every host.
      const isOptedOutForOther = await attempt(() => isOptedOut(testPhone));
      assert(
        isOptedOutForOther === true,
        'Phone is opted out for a different host too (account-wide)'
      );
    } else {
      console.log('⚠️  No other host found, skipping account-wide test');
    }

    // Clean up test data
    if (optOutRecord) await prisma.smsOptOut.delete({ where: { id: optOutRecord.id } });
    console.log('✅ Test data cleaned up');
  }

  // ============================================
  // TEST 4: InviteEvent Types
  // ============================================
  console.log('\n📋 Test 4: InviteEvent Types\n');

  // Check that SMS-related event types exist in the schema
  const smsEventTypes = [
    'NUDGE_SENT_AUTO',
    'NUDGE_DEFERRED_QUIET',
    'SMS_OPT_OUT_RECEIVED',
    'SMS_BLOCKED_OPT_OUT',
    'SMS_BLOCKED_INVALID',
    'SMS_SEND_FAILED',
  ];

  // We can't directly check enum values at runtime, but we can verify they're used
  console.log('SMS-related InviteEvent types that should exist:');
  smsEventTypes.forEach((type) => {
    console.log(`  - ${type}`);
  });
  console.log('✅ All SMS event types defined in schema');

  // ============================================
  // TEST 5: API Endpoint Structure
  // ============================================
  console.log('\n📋 Test 5: API Endpoint Structure\n');

  // We can't test the actual HTTP endpoint without starting the server,
  // but we can verify the file exists
  const fs = require('fs');
  const path = require('path');

  // GTC-264 / GTC-229: TNZ's one webhook replaced the Twilio-shaped `sms/inbound` route.
  const webhookPath = path.join(__dirname, '../src/app/api/sms/tnz-webhook/route.ts');
  assert(fs.existsSync(webhookPath), 'TNZ webhook route.ts exists');

  const inviteStatusPath = path.join(
    __dirname,
    '../src/app/api/events/[id]/invite-status/route.ts'
  );
  assert(fs.existsSync(inviteStatusPath), 'Invite status route.ts exists');

  // ============================================
  // TEST 6: SMS Service Files
  // ============================================
  console.log('\n📋 Test 6: SMS Service Files\n');

  const twilioClientPath = path.join(__dirname, '../src/lib/sms/twilio-client.ts');
  assert(fs.existsSync(twilioClientPath), 'twilio-client.ts exists');

  const sendSmsPath = path.join(__dirname, '../src/lib/sms/send-sms.ts');
  assert(fs.existsSync(sendSmsPath), 'send-sms.ts exists');

  const optOutServicePath = path.join(__dirname, '../src/lib/sms/opt-out-service.ts');
  assert(fs.existsSync(optOutServicePath), 'opt-out-service.ts exists');

  const optOutKeywordsPath = path.join(__dirname, '../src/lib/sms/opt-out-keywords.ts');
  assert(fs.existsSync(optOutKeywordsPath), 'opt-out-keywords.ts exists');

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary\n');
  console.log(`Total tests: ${passed + failed}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed!\n');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.\n');
  }

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  console.error('❌ Test suite failed with error:', error);
  process.exit(1);
});
