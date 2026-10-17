import twilio from 'twilio';

// Environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Validation
const isConfigured = !!(accountSid && authToken && phoneNumber);

if (!isConfigured) {
  console.warn(
    '[Twilio] SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER environment variables.'
  );
}

// Create client (or null if not configured)
const client = isConfigured ? twilio(accountSid, authToken) : null;

/**
 * Check if SMS sending is enabled
 */
export function isSmsEnabled(): boolean {
  return isConfigured;
}

/**
 * Get the configured sending phone number
 */
export function getSendingNumber(): string | null {
  return phoneNumber || null;
}

/**
 * Get the Twilio client (for sending messages)
 * Returns null if not configured
 */
export function getTwilioClient() {
  return client;
}

// GTC-214: `validateTwilioSignature` was deleted here. It had zero callers, and the
// inbound handler it looked like it protected never called it — dead verification code
// reads as though a path is secured when it is not. Inbound signature verification is
// GTC-229's, and will need TNZ's scheme rather than Twilio's. Do not restore this from
// git history to "wire it up".
