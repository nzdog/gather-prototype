// src/lib/auth/session.ts
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function getUser() {
  const sessionToken = cookies().get('session')?.value;
  if (!sessionToken) return null;

  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    // Clear expired session cookie
    cookies().delete('session');
    return null;
  }

  return session.user;
}
