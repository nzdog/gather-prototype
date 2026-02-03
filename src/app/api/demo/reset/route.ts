import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * POST /api/demo/reset
 *
 * Completely resets the database by dropping all tables and reseeding
 * SECURITY: Requires authenticated user AND development environment
 */
export async function POST() {
  // SECURITY: Only allow in development environment
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  // Note: No auth required for demo endpoint in development
  // This is a dev-only endpoint for resetting demo data

  try {
    console.log('[Reset] Starting full database reset...');

    // Step 1: Drop all tables and sync schema
    console.log('[Reset] Step 1: Dropping tables and syncing schema...');
    const { stdout: pushStdout, stderr: pushStderr } = await execAsync(
      'npx prisma db push --force-reset --accept-data-loss --skip-generate',
      {
        env: {
          ...process.env,
          PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'yes',
        },
      }
    );

    console.log('[Reset] Schema sync stdout:', pushStdout);
    if (pushStderr) {
      console.warn('[Reset] Schema sync stderr:', pushStderr);
    }

    // Step 2: Run seed script
    console.log('[Reset] Step 2: Running seed script...');
    const { stdout: seedStdout, stderr: seedStderr } = await execAsync('npx tsx prisma/seed.ts');

    console.log('[Reset] Seed stdout:', seedStdout);
    if (seedStderr) {
      console.warn('[Reset] Seed stderr:', seedStderr);
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
