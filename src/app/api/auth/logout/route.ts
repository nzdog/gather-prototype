// src/app/api/auth/logout/route.ts
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const sessionToken = cookies().get('session')?.value;

  if (sessionToken) {
    // Delete session from database
    await prisma.session.delete({
      where: { token: sessionToken }
    }).catch(() => {
      // Session might not exist, ignore error
    });

    // Clear cookie
    cookies().delete('session');
  }

  return Response.json({ ok: true });
}
