// scripts/validate-phase1-helpers.ts
// Helper functions for Phase 1 validation

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

// Track created resources for cleanup
const createdResources = {
  users: [] as string[],
  persons: [] as string[],
  events: [] as string[],
  sessions: [] as string[],
  magicLinks: [] as string[],
  accessTokens: [] as string[],
};

export { prisma, createdResources };

// ============================================
// Test Data Creation Helpers
// ============================================

export async function createTestUser(email: string) {
  const user = await prisma.user.create({
    data: { email },
  });
  createdResources.users.push(user.id);
  return user;
}

export async function createTestPerson(name: string, email?: string, userId?: string) {
  const person = await prisma.person.create({
    data: {
      name,
      email,
      userId,
    },
  });
  createdResources.persons.push(person.id);
  return person;
}

export async function createTestEvent(hostId: string, name: string = 'Test Event') {
  const event = await prisma.event.create({
    data: {
      name,
      hostId,
      startDate: new Date('2026-12-25'),
      endDate: new Date('2026-12-26'),
      status: 'DRAFT',
    },
  });
  createdResources.events.push(event.id);
  return event;
}

export async function createTestSession(userId: string, expiresInDays: number = 30) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });
  createdResources.sessions.push(session.id);
  return session;
}

export async function createTestMagicLink(email: string) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  const magicLink = await prisma.magicLink.create({
    data: {
      email,
      token,
      expiresAt,
    },
  });
  createdResources.magicLinks.push(magicLink.id);
  return magicLink;
}

export async function createTestAccessToken(
  personId: string,
  eventId: string,
  scope: 'HOST' | 'COORDINATOR' | 'PARTICIPANT',
  teamId?: string
) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

  const accessToken = await prisma.accessToken.create({
    data: {
      token,
      personId,
      eventId,
      scope,
      teamId,
      expiresAt,
    },
  });
  createdResources.accessTokens.push(accessToken.id);
  return accessToken;
}

export async function createTestTeam(eventId: string, name: string, coordinatorId: string) {
  const team = await prisma.team.create({
    data: {
      name,
      eventId,
      coordinatorId,
    },
  });
  return team;
}

export async function createTestPersonEvent(
  personId: string,
  eventId: string,
  role: 'HOST' | 'COORDINATOR' | 'PARTICIPANT' = 'PARTICIPANT',
  teamId?: string
) {
  const personEvent = await prisma.personEvent.create({
    data: {
      personId,
      eventId,
      role,
      teamId,
    },
  });
  return personEvent;
}

export async function createTestEventRole(
  userId: string,
  eventId: string,
  role: 'HOST' | 'COHOST' | 'COORDINATOR'
) {
  const eventRole = await prisma.eventRole.create({
    data: {
      userId,
      eventId,
      role,
    },
  });
  return eventRole;
}

// ============================================
// Cleanup
// ============================================

export async function cleanup() {
  try {
    // Delete in reverse dependency order
    if (createdResources.sessions.length > 0) {
      await prisma.session.deleteMany({
        where: { id: { in: createdResources.sessions } },
      });
    }

    if (createdResources.magicLinks.length > 0) {
      await prisma.magicLink.deleteMany({
        where: { id: { in: createdResources.magicLinks } },
      });
    }

    if (createdResources.accessTokens.length > 0) {
      await prisma.accessToken.deleteMany({
        where: { id: { in: createdResources.accessTokens } },
      });
    }

    if (createdResources.events.length > 0) {
      await prisma.event.deleteMany({
        where: { id: { in: createdResources.events } },
      });
    }

    if (createdResources.persons.length > 0) {
      await prisma.person.deleteMany({
        where: { id: { in: createdResources.persons } },
      });
    }

    if (createdResources.users.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdResources.users } },
      });
    }

    console.log('✓ Cleaned up all test data');
  } catch (error) {
    console.error('✗ Cleanup failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// ============================================
// Validation Helpers
// ============================================

export function logSuccess(message: string) {
  console.log(`✓ ${message}`);
}

export function logFailure(message: string, details?: any) {
  console.error(`✗ ${message}`);
  if (details) {
    console.error('  Details:', details);
  }
}

export function logSection(title: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(title);
  console.log('='.repeat(60));
}
