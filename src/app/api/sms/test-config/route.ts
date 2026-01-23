import { NextResponse } from 'next/server';
import { isSmsEnabled, getSendingNumber } from '@/lib/sms/twilio-client';

/**
 * Test endpoint to verify Twilio configuration
 * Access at: http://localhost:3000/api/sms/test-config
 */
export async function GET() {
  const enabled = isSmsEnabled();
  const phoneNumber = getSendingNumber();

  // Get env vars directly to debug
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  return NextResponse.json({
    smsEnabled: enabled,
    phoneNumber: phoneNumber,
    debug: {
      hasAccountSid: !!accountSid,
      hasAuthToken: !!authToken,
      hasPhoneNumber: !!phoneNumber,
      accountSidPrefix: accountSid?.substring(0, 5) || 'NOT SET',
    },
  });
}
