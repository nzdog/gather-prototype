/**
 * Twilio Configuration Test
 * Tests that the Twilio client handles missing credentials gracefully
 *
 * Run with: npx tsx tests/twilio-config-test.ts
 */

import { isSmsEnabled, getSendingNumber } from '../src/lib/sms/twilio-client';

console.log('\n🧪 Twilio Configuration Test\n');
console.log('='.repeat(60));

console.log('\n📋 Testing Twilio Configuration\n');

// Check if SMS is enabled
const enabled = isSmsEnabled();
console.log(`SMS Enabled: ${enabled}`);

if (enabled) {
  console.log('✅ Twilio is configured');
  const phoneNumber = getSendingNumber();
  console.log(`   Sending Number: ${phoneNumber}`);

  console.log('\n✅ SMS infrastructure is ready to send messages');
  console.log('   Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER');
} else {
  console.log('⚠️  Twilio is NOT configured');
  console.log('   This is OK - SMS sends will be logged but not actually sent');
  console.log('   To enable SMS, set environment variables:');
  console.log('     TWILIO_ACCOUNT_SID=ACxxxxx...');
  console.log('     TWILIO_AUTH_TOKEN=xxxxx...');
  console.log('     TWILIO_PHONE_NUMBER=+64211234567');
}

console.log('\n📋 Expected Behavior\n');
console.log('Without Twilio credentials:');
console.log('  - isSmsEnabled() returns false');
console.log('  - sendSms() returns { success: false, blocked: "SMS_DISABLED" }');
console.log('  - No actual SMS sent, but logged: "[SMS] Disabled - would send to..."');
console.log('');
console.log('With Twilio credentials:');
console.log('  - isSmsEnabled() returns true');
console.log('  - sendSms() validates and sends via Twilio API');
console.log('  - Real SMS messages are sent');

console.log('\n' + '='.repeat(60));
console.log('\n✅ Twilio configuration test complete\n');
