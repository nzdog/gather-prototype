// src/lib/email.ts
import { Resend } from 'resend';

// Initialize Resend client lazily to ensure env vars are loaded
let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function sendMagicLinkEmail(
  to: string,
  token: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const link = `${baseUrl}/auth/verify?token=${token}`;

  const resend = getResendClient();

  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'Gather <noreply@gather.app>',
    to,
    subject: 'Sign in to Gather',
    text: `Click here to sign in to Gather:\n\n${link}\n\nThis link expires in 15 minutes.`,
  });
}
