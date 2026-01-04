import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * POST /api/demo/reset
 *
 * Resets the database by clearing all data and reseeding
 */
export async function POST() {
  try {
    console.log('[Reset] Starting database reset (keeping tokens)...');

    // Step 1: Delete only items and assignments, keep people/teams/tokens
    console.log('[Reset] Deleting items and assignments...');
    await prisma.$transaction([
      prisma.auditEntry.deleteMany(),
      prisma.assignment.deleteMany(),
      prisma.item.deleteMany(),
      prisma.day.deleteMany(),
    ]);
    console.log('[Reset] Items deleted successfully');

    // Step 2: Run the seed script (will skip existing people/teams/tokens)
    console.log('[Reset] Running seed script...');
    const { stdout, stderr } = await execAsync('npx prisma db seed');
    console.log('[Reset] Seed stdout:', stdout);
    if (stderr) {
      console.warn('[Reset] Seed stderr:', stderr);
    }
    console.log('[Reset] Seed completed successfully');

    // Step 3: Verify data
    const itemCount = await prisma.item.count();
    const tokenCount = await prisma.accessToken.count();
    console.log(`[Reset] Verification: ${itemCount} items, ${tokenCount} tokens`);

    return NextResponse.json({
      success: true,
      message: 'Database reset successfully (tokens preserved)',
      itemCount,
      tokenCount,
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
