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

/**
 * Validate Twilio webhook signature
 * Use this to verify inbound webhooks are actually from Twilio
 */
export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  if (!authToken) return false;

  const twilioLib = require('twilio');
  return twilioLib.validateRequest(authToken, signature, url, params);
}
