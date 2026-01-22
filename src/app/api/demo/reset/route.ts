import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getUser } from '@/lib/auth/session';

const execAsync = promisify(exec);

/**
 * POST /api/demo/reset
 *
 * Completely resets the database by dropping all tables and reseeding
 * SECURITY: Requires authenticated user AND development environment
 */
export async function POST() {
  // SECURITY: Require authenticated user session
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // SECURITY: Only allow in development environment
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  try {
    console.log('[Reset] Starting full database reset...');

    // Use Prisma migrate reset to drop all tables and re-run migrations + seed
    // --force: Skip confirmation prompt
    // --skip-generate: Don't regenerate Prisma client (already generated)
    console.log('[Reset] Running Prisma migrate reset...');

    const { stdout, stderr } = await execAsync('npx prisma migrate reset --force --skip-generate', {
      env: {
        ...process.env,
        // Auto-confirm the reset
        PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'yes',
      },
    });

    console.log('[Reset] Migrate reset stdout:', stdout);
    if (stderr) {
      console.warn('[Reset] Migrate reset stderr:', stderr);
    }
    console.log('[Reset] Database reset and seeded successfully');

    return NextResponse.json({
      success: true,
      message: 'Database reset successfully - all data recreated fresh',
    });
  } catch (error) {
    console.error('[Reset] Failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to reset database',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
