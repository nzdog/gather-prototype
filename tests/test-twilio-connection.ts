/**
 * Test Twilio Connection with Test Credentials
 */

// Load environment variables first
import { config } from 'dotenv';
config();

import twilio from 'twilio';

async function testConnection() {
  console.log('\n🧪 Testing Twilio Connection\n');
  console.log('='.repeat(60));

  // Check env vars
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  console.log('\n📋 Configuration Check\n');
  console.log(`Account SID: ${accountSid ? accountSid.substring(0, 10) + '...' : 'NOT SET'}`);
  console.log(`Auth Token: ${authToken ? '✓ SET (hidden)' : 'NOT SET'}`);
  console.log(`Phone Number: ${phoneNumber || 'NOT SET'}`);

  if (!accountSid || !authToken || !phoneNumber) {
    console.log('\n❌ Missing credentials in environment');
    process.exit(1);
  }

  console.log('\n✅ All credentials present\n');

  // Initialize Twilio client
  console.log('📋 Testing Twilio Client Initialization\n');

  try {
    const client = twilio(accountSid, authToken);
    console.log('✅ Twilio client initialized successfully');

    // Test API connection (get account info)
    console.log('\n📋 Testing API Connection\n');
    const account = await client.api.accounts(accountSid).fetch();

    console.log('✅ Successfully connected to Twilio API');
    console.log(`   Account Status: ${account.status}`);
    console.log(`   Account Type: ${account.type}`);

    console.log('\n📋 Test Mode Check\n');
    if (accountSid.startsWith('AC') && account.type === 'Trial') {
      console.log('✅ Using TEST/TRIAL credentials');
      console.log('   Messages will NOT actually be sent');
      console.log('   Perfect for development and testing');
    } else if (account.type === 'Full') {
      console.log('✅ Using LIVE credentials');
      console.log('   Messages WILL be sent (costs apply)');
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n🎉 Twilio configuration is working!\n');
    console.log('Next steps:');
    console.log('  1. Run: npx tsx tests/sms-infrastructure-test.ts');
    console.log("  2. Test sending an SMS (won't actually send in test mode)");
    console.log('  3. Check dashboard for SMS status display\n');
  } catch (error: any) {
    console.log('\n❌ Failed to connect to Twilio API');
    console.log(`   Error: ${error.message}`);

    if (error.code === 20003) {
      console.log('\n   This usually means:');
      console.log('   - Invalid Account SID or Auth Token');
      console.log('   - Check your credentials in .env file');
    }

    process.exit(1);
  }
}

testConnection();
