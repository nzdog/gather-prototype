// src/lib/email.ts
import { Resend } from 'resend';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

// Initialize Resend client lazily to ensure env vars are loaded
let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function sendMagicLinkEmail(to: string, token: string) {
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

export async function sendWelcomeEmail(email: string, eventName: string, eventId: string) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await prisma.magicLink.create({
    data: { email, token, expiresAt },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const magicLinkUrl = `${baseUrl}/auth/verify?token=${token}&returnUrl=${encodeURIComponent(`/plan/${eventId}`)}`;

  const resend = getResendClient();

  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'Gather <noreply@gather.app>',
    to: email,
    subject: `Your event "${eventName}" is ready!`,
    html: `
      <h1>Your event is created!</h1>
      <p>Thanks for using Gather. Your event "${eventName}" is all set up.</p>
      <p>You're currently logged in, but save this link to return anytime:</p>
      <p><a href="${magicLinkUrl}">Access your event →</a></p>
      <p>This link expires in 30 days. You can always request a new one from the sign-in page.</p>
    `,
  });
}
