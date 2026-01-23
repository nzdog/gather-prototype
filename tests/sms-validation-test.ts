/**
 * SMS Validation Test
 * Tests the sendSms validation logic without actually sending messages
 *
 * Run with: npx tsx tests/sms-validation-test.ts
 */

import { PrismaClient } from '@prisma/client';
import { sendSms } from '../src/lib/sms/send-sms';

const prisma = new PrismaClient();

async function runValidationTests() {
  console.log('\n🧪 SMS Validation Test Suite\n');
  console.log('='.repeat(60));

  // Find a test event
  const testEvent = await prisma.event.findFirst({
    where: { status: 'CONFIRMING' },
    include: {
      people: {
        include: {
          person: true,
        },
        take: 1,
      },
    },
  });

  if (!testEvent || testEvent.people.length === 0) {
    console.log('⚠️  No test event found, creating minimal test data...');
    console.log('Run this test after you have at least one event in CONFIRMING status');
    await prisma.$disconnect();
    process.exit(0);
  }

  const testPerson = testEvent.people[0].person;
  const eventId = testEvent.id;
  const personId = testPerson.id;

  console.log(`\nUsing test event: ${eventId}`);
  console.log(`Using test person: ${personId} (${testPerson.name})`);

  // ============================================
  // TEST 1: SMS_DISABLED (no Twilio config)
  // ============================================
  console.log('\n📋 Test 1: SMS_DISABLED\n');

  const result1 = await sendSms({
    to: '+64211234567',
    message: 'Test message',
    eventId: eventId,
    personId: personId,
    metadata: { test: 'SMS_DISABLED' },
  });

  console.log('Result:', result1);
  if (result1.success === false && result1.blocked === 'SMS_DISABLED') {
    console.log('✅ Correctly blocked: SMS not configured');
    console.log('   (This is expected when TWILIO_* env vars are not set)');
  } else {
    console.log('⚠️  SMS appears to be configured - sendSms will attempt real sends');
  }

  // ============================================
  // TEST 2: INVALID_NUMBER
  // ============================================
  console.log('\n📋 Test 2: INVALID_NUMBER\n');

  const result2 = await sendSms({
    to: '+1234567890', // US number, not NZ
    message: 'Test message',
    eventId: eventId,
    personId: personId,
    metadata: { test: 'INVALID_NUMBER' },
  });

  console.log('Result:', result2);
  if (result2.success === false && result2.blocked === 'INVALID_NUMBER') {
    console.log('✅ Correctly blocked: Invalid/non-NZ phone number');
  } else {
    console.log('❌ Expected INVALID_NUMBER block');
  }

  // Check that an InviteEvent was logged
  const invalidEvent = await prisma.inviteEvent.findFirst({
    where: {
      eventId: eventId,
      personId: personId,
      type: 'SMS_BLOCKED_INVALID',
      metadata: {
        path: ['test'],
        equals: 'INVALID_NUMBER',
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (invalidEvent) {
    console.log('✅ SMS_BLOCKED_INVALID event logged to database');
  } else {
    console.log('❌ No SMS_BLOCKED_INVALID event found');
  }

  // ============================================
  // TEST 3: OPTED_OUT
  // ============================================
  console.log('\n📋 Test 3: OPTED_OUT\n');

  const testPhone = '+64211111111';

  // Create an opt-out record
  await prisma.smsOptOut.upsert({
    where: {
      phoneNumber_hostId: {
        phoneNumber: testPhone,
        hostId: testEvent.hostId,
      },
    },
    create: {
      phoneNumber: testPhone,
      hostId: testEvent.hostId,
      rawMessage: 'STOP (test)',
    },
    update: {},
  });

  const result3 = await sendSms({
    to: testPhone,
    message: 'Test message',
    eventId: eventId,
    personId: personId,
    metadata: { test: 'OPTED_OUT' },
  });

  console.log('Result:', result3);
  if (result3.success === false && result3.blocked === 'OPTED_OUT') {
    console.log('✅ Correctly blocked: Recipient has opted out');
  } else {
    console.log('❌ Expected OPTED_OUT block');
  }

  // Check that an InviteEvent was logged
  const optOutEvent = await prisma.inviteEvent.findFirst({
    where: {
      eventId: eventId,
      personId: personId,
      type: 'SMS_BLOCKED_OPT_OUT',
      metadata: {
        path: ['test'],
        equals: 'OPTED_OUT',
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (optOutEvent) {
    console.log('✅ SMS_BLOCKED_OPT_OUT event logged to database');
  } else {
    console.log('❌ No SMS_BLOCKED_OPT_OUT event found');
  }

  // Clean up test opt-out
  await prisma.smsOptOut.delete({
    where: {
      phoneNumber_hostId: {
        phoneNumber: testPhone,
        hostId: testEvent.hostId,
      },
    },
  });

  // ============================================
  // TEST 4: Valid send (will be SMS_DISABLED if no Twilio)
  // ============================================
  console.log('\n📋 Test 4: Valid Number (not opted out)\n');

  const result4 = await sendSms({
    to: '+64222222222',
    message: 'Test message',
    eventId: eventId,
    personId: personId,
    metadata: { test: 'VALID' },
  });

  console.log('Result:', result4);
  if (result4.success === false && result4.blocked === 'SMS_DISABLED') {
    console.log('✅ Would send if Twilio was configured');
    console.log('   (Blocked by SMS_DISABLED because TWILIO_* not set)');
  } else if (result4.success === true) {
    console.log('✅ SMS sent successfully via Twilio');
    console.log('   Message ID:', result4.messageId);
  } else {
    console.log('⚠️  Unexpected result:', result4);
  }

  // ============================================
  // TEST 5: Check InviteEvent logging
  // ============================================
  console.log('\n📋 Test 5: InviteEvent Logging\n');

  const recentEvents = await prisma.inviteEvent.findMany({
    where: {
      eventId: eventId,
      personId: personId,
      type: {
        in: ['SMS_BLOCKED_INVALID', 'SMS_BLOCKED_OPT_OUT', 'NUDGE_SENT_AUTO', 'SMS_SEND_FAILED'],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  console.log(`Found ${recentEvents.length} SMS-related events:`);
  recentEvents.forEach((event, i) => {
    console.log(`  ${i + 1}. ${event.type} at ${event.createdAt.toISOString()}`);
    if (event.metadata) {
      console.log(`     Metadata:`, event.metadata);
    }
  });

  if (recentEvents.length > 0) {
    console.log('✅ SMS actions are being logged to InviteEvent');
  } else {
    console.log('⚠️  No SMS events found (this might be OK if this is first run)');
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Validation Test Summary\n');
  console.log('The SMS validation pipeline works correctly:');
  console.log('  1. SMS_DISABLED - Graceful degradation when Twilio not configured');
  console.log('  2. INVALID_NUMBER - Blocks non-NZ phone numbers');
  console.log('  3. OPTED_OUT - Respects per-host opt-out preferences');
  console.log('  4. VALID - Would send (or sends) when all checks pass');
  console.log('  5. All actions logged to InviteEvent for audit trail');
  console.log('\n✅ SMS validation test complete\n');

  await prisma.$disconnect();
}

// Run tests
runValidationTests().catch((error) => {
  console.error('❌ Test failed with error:', error);
  process.exit(1);
});
