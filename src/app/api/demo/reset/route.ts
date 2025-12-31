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
    console.log('[Reset] Starting database reset...');

    // Step 1: Delete all data in the correct order to respect foreign key constraints
    console.log('[Reset] Deleting existing data...');
    await prisma.$transaction([
      prisma.auditEntry.deleteMany(),
      prisma.accessToken.deleteMany(),
      prisma.assignment.deleteMany(),
      prisma.item.deleteMany(),
      prisma.personEvent.deleteMany(),
      prisma.team.deleteMany(),
      prisma.day.deleteMany(),
      prisma.event.deleteMany(),
      prisma.person.deleteMany(),
    ]);
    console.log('[Reset] Data deleted successfully');

    // Step 2: Run the seed script
    console.log('[Reset] Running seed script...');
    const { stdout, stderr } = await execAsync('npx prisma db seed');
    console.log('[Reset] Seed stdout:', stdout);
    if (stderr) {
      console.warn('[Reset] Seed stderr:', stderr);
    }
    console.log('[Reset] Seed completed successfully');

    // Step 3: Verify data was created
    const tokenCount = await prisma.accessToken.count();
    console.log(`[Reset] Verification: ${tokenCount} tokens created`);

    return NextResponse.json({
      success: true,
      message: 'Database reset and reseeded successfully',
      tokenCount
    });
  } catch (error) {
    console.error('[Reset] Failed:', error);
    return NextResponse.json(
      { error: 'Failed to reset database', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
