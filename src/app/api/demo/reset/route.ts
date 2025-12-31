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
    // Step 1: Delete all data in the correct order to respect foreign key constraints
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

    // Step 2: Run the seed script
    await execAsync('npx prisma db seed');

    return NextResponse.json({
      success: true,
      message: 'Database reset and reseeded successfully'
    });
  } catch (error) {
    console.error('Reset failed:', error);
    return NextResponse.json(
      { error: 'Failed to reset database', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
