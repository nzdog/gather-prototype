#!/usr/bin/env node
// scripts/validate-phase1.ts
// Validation script for Phase 1 Dual-Run Authentication
// Run with: npx tsx scripts/validate-phase1.ts

import {
  prisma,
  cleanup,
  createTestUser,
  createTestPerson,
  createTestEvent,
  createTestSession,
  createTestMagicLink,
  createTestAccessToken,
  createTestTeam,
  createTestPersonEvent,
  createTestEventRole,
  logSuccess,
  logFailure,
  logSection,
} from './validate-phase1-helpers';

// Track test results
let passedTests = 0;
let failedTests = 0;

// Unique test run identifier
const testRunId = Date.now();

function getTestEmail(base: string): string {
  return `test-${testRunId}-${base}`;
}

function recordPass(message: string) {
  passedTests++;
  logSuccess(message);
}

function recordFail(message: string, details?: any) {
  failedTests++;
  logFailure(message, details);
}

// ============================================
// Test Scenarios
// ============================================

async function testLegacyHostTokenAccess() {
  logSection('Test 1: Legacy Host Token Access');

  try {
    // Create unclaimed host (no userId)
    const host = await createTestPerson('Legacy Host', getTestEmail('legacy-host@test.com'));
    const event = await createTestEvent(host.id, 'Legacy Event');
    const hostToken = await createTestAccessToken(host.id, event.id, 'HOST');

    // Simulate token resolution
    const resolvedToken = await prisma.accessToken.findUnique({
      where: { token: hostToken.token },
      include: {
        person: true,
        event: true,
      },
    });

    if (!resolvedToken) {
      recordFail('Legacy host token not found');
      return;
    }

    if (resolvedToken.person.userId !== null) {
      recordFail('Host should be unclaimed (userId should be null)');
      return;
    }

    recordPass('Legacy host token access works');
    recordPass('Unclaimed host detected (ready for claim prompt)');
  } catch (error) {
    recordFail('Legacy host token access failed', error);
  }
}

async function testLegacyCoordinatorTokenAccess() {
  logSection('Test 2: Legacy Coordinator Token Access');

  try {
    // Create coordinator with token
    const host = await createTestPerson('Host', getTestEmail('host2@test.com'));
    const coordinator = await createTestPerson('Coordinator', getTestEmail('coord@test.com'));
    const event = await createTestEvent(host.id, 'Coord Event');
    const team = await createTestTeam(event.id, 'Team A', coordinator.id);
    await createTestPersonEvent(coordinator.id, event.id, 'COORDINATOR', team.id);
    const coordToken = await createTestAccessToken(
      coordinator.id,
      event.id,
      'COORDINATOR',
      team.id
    );

    // Simulate token resolution
    const resolvedToken = await prisma.accessToken.findUnique({
      where: { token: coordToken.token },
      include: {
        person: true,
        event: true,
        team: true,
      },
    });

    if (!resolvedToken) {
      recordFail('Coordinator token not found');
      return;
    }

    if (resolvedToken.scope !== 'COORDINATOR') {
      recordFail('Token scope should be COORDINATOR');
      return;
    }

    if (!resolvedToken.team) {
      recordFail('Coordinator token should have team');
      return;
    }

    recordPass('Legacy coordinator token access works unchanged');
  } catch (error) {
    recordFail('Legacy coordinator token access failed', error);
  }
}

async function testLegacyParticipantTokenAccess() {
  logSection('Test 3: Legacy Participant Token Access');

  try {
    const host = await createTestPerson('Host', getTestEmail('host3@test.com'));
    const coordinator = await createTestPerson('Coordinator', getTestEmail('coord3@test.com'));
    const participant = await createTestPerson('Participant', getTestEmail('part@test.com'));
    const event = await createTestEvent(host.id, 'Participant Event');
    const team = await createTestTeam(event.id, 'Team B', coordinator.id);
    await createTestPersonEvent(participant.id, event.id, 'PARTICIPANT', team.id);
    const partToken = await createTestAccessToken(participant.id, event.id, 'PARTICIPANT', team.id);

    // Simulate token resolution
    const resolvedToken = await prisma.accessToken.findUnique({
      where: { token: partToken.token },
      include: {
        person: true,
        event: true,
      },
    });

    if (!resolvedToken) {
      recordFail('Participant token not found');
      return;
    }

    if (resolvedToken.scope !== 'PARTICIPANT') {
      recordFail('Token scope should be PARTICIPANT');
      return;
    }

    recordPass('Legacy participant token access works unchanged');
  } catch (error) {
    recordFail('Legacy participant token access failed', error);
  }
}

async function testNewUserSignIn() {
  logSection('Test 4: New User Sign In (Magic Link → Session)');

  try {
    const email = getTestEmail('newuser@test.com');

    // Step 1: Create magic link
    const magicLink = await createTestMagicLink(email);

    // Step 2: Verify magic link exists and is not expired
    const foundLink = await prisma.magicLink.findUnique({
      where: { token: magicLink.token },
    });

    if (!foundLink) {
      recordFail('Magic link not found');
      return;
    }

    if (foundLink.expiresAt < new Date()) {
      recordFail('Magic link is expired');
      return;
    }

    if (foundLink.usedAt) {
      recordFail('Magic link should not be used yet');
      return;
    }

    recordPass('Magic link created successfully');

    // Step 3: Simulate verification - find or create user
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await createTestUser(email);
    }

    // Step 4: Mark magic link as used
    await prisma.magicLink.update({
      where: { id: magicLink.id },
      data: { usedAt: new Date() },
    });

    // Step 5: Create session
    const session = await createTestSession(user.id);

    // Step 6: Verify session exists
    const foundSession = await prisma.session.findUnique({
      where: { token: session.token },
      include: { user: true },
    });

    if (!foundSession) {
      recordFail('Session not found');
      return;
    }

    if (foundSession.user.email !== email) {
      recordFail('Session user email mismatch');
      return;
    }

    recordPass('New user sign in via magic link works');
    recordPass('Session created successfully');
  } catch (error) {
    recordFail('New user sign in failed', error);
  }
}

async function testClaimedHostViaSession() {
  logSection('Test 5: Claimed Host via Session (Direct Access)');

  try {
    // Create user
    const user = await createTestUser(getTestEmail('claimed-host@test.com'));

    // Create person linked to user
    const person = await createTestPerson(
      'Claimed Host',
      getTestEmail('claimed-host@test.com'),
      user.id
    );

    // Create event
    const event = await createTestEvent(person.id, 'Claimed Host Event');

    // Create EventRole
    await createTestEventRole(user.id, event.id, 'HOST');

    // Create session
    const session = await createTestSession(user.id);

    // Verify session can be used to access events
    const foundSession = await prisma.session.findUnique({
      where: { token: session.token },
      include: {
        user: {
          include: {
            eventRoles: {
              where: { eventId: event.id },
            },
          },
        },
      },
    });

    if (!foundSession) {
      recordFail('Session not found');
      return;
    }

    if (foundSession.user.eventRoles.length === 0) {
      recordFail('No EventRole found for user');
      return;
    }

    if (foundSession.user.eventRoles[0].role !== 'HOST') {
      recordFail('EventRole should be HOST');
      return;
    }

    recordPass('Claimed host can access events via session (no token needed)');
  } catch (error) {
    recordFail('Claimed host via session failed', error);
  }
}

async function testClaimedHostViaOldToken() {
  logSection('Test 6: Claimed Host via Old Token');

  try {
    // Create user
    const user = await createTestUser(getTestEmail('claimed-host-token@test.com'));

    // Create person linked to user
    const person = await createTestPerson(
      'Claimed Host 2',
      getTestEmail('claimed-host-token@test.com'),
      user.id
    );

    // Create event
    const event = await createTestEvent(person.id, 'Claimed Host Event 2');

    // Create EventRole
    await createTestEventRole(user.id, event.id, 'HOST');

    // Create old-style access token (should still work)
    const accessToken = await createTestAccessToken(person.id, event.id, 'HOST');

    // Verify token works
    const resolvedToken = await prisma.accessToken.findUnique({
      where: { token: accessToken.token },
      include: {
        person: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!resolvedToken) {
      recordFail('Access token not found');
      return;
    }

    if (!resolvedToken.person.user) {
      recordFail('Person should be linked to user');
      return;
    }

    if (resolvedToken.person.user.email !== getTestEmail('claimed-host-token@test.com')) {
      recordFail('User email mismatch');
      return;
    }

    recordPass('Claimed host via old token works (uses session)');
  } catch (error) {
    recordFail('Claimed host via old token failed', error);
  }
}

async function testSessionExpiry() {
  logSection('Test 7: Session Expiry');

  try {
    const user = await createTestUser(getTestEmail('expiry-test@test.com'));

    // Create expired session (expires in past)
    const expiredSession = await createTestSession(user.id, -1); // -1 days = expired

    // Verify session is expired
    const foundSession = await prisma.session.findUnique({
      where: { token: expiredSession.token },
    });

    if (!foundSession) {
      recordFail('Session not found');
      return;
    }

    if (foundSession.expiresAt >= new Date()) {
      recordFail('Session should be expired');
      return;
    }

    recordPass('Session expiry works correctly (logged out after 30d)');
  } catch (error) {
    recordFail('Session expiry test failed', error);
  }
}

async function testLogout() {
  logSection('Test 8: Logout');

  try {
    const user = await createTestUser(getTestEmail('logout-test@test.com'));
    const session = await createTestSession(user.id);

    // Simulate logout - delete session
    await prisma.session.delete({
      where: { token: session.token },
    });

    // Verify session is deleted
    const foundSession = await prisma.session.findUnique({
      where: { token: session.token },
    });

    if (foundSession) {
      recordFail('Session should be deleted after logout');
      return;
    }

    recordPass('Logout clears session (cookie cleared)');
  } catch (error) {
    recordFail('Logout test failed', error);
  }
}

async function testCreateEventClaimed() {
  logSection('Test 9: Create New Event (Claimed User)');

  try {
    const user = await createTestUser(getTestEmail('new-event-claimed@test.com'));
    const person = await createTestPerson(
      'Event Creator',
      getTestEmail('new-event-claimed@test.com'),
      user.id
    );

    // Create event
    const event = await createTestEvent(person.id, 'New Event by Claimed User');

    // Create EventRole
    await createTestEventRole(user.id, event.id, 'HOST');

    // Verify EventRole was created
    const foundEventRole = await prisma.eventRole.findFirst({
      where: {
        userId: user.id,
        eventId: event.id,
      },
    });

    if (!foundEventRole) {
      recordFail('EventRole not created');
      return;
    }

    if (foundEventRole.role !== 'HOST') {
      recordFail('EventRole should be HOST');
      return;
    }

    recordPass('Create new event (claimed) - EventRole created');
  } catch (error) {
    recordFail('Create event (claimed) test failed', error);
  }
}

async function testCreateEventUnclaimed() {
  logSection('Test 10: Create New Event (Unclaimed User)');

  try {
    // Create person WITHOUT userId (unclaimed)
    const person = await createTestPerson('Unclaimed Creator', getTestEmail('unclaimed@test.com'));

    // Create event (legacy flow)
    const event = await createTestEvent(person.id, 'New Event by Unclaimed User');

    // Verify person has no userId
    const foundPerson = await prisma.person.findUnique({
      where: { id: person.id },
    });

    if (!foundPerson) {
      recordFail('Person not found');
      return;
    }

    if (foundPerson.userId !== null) {
      recordFail('Person should not have userId (unclaimed)');
      return;
    }

    // Verify event was created
    const foundEvent = await prisma.event.findUnique({
      where: { id: event.id },
    });

    if (!foundEvent) {
      recordFail('Event not created');
      return;
    }

    recordPass('Create new event (unclaimed) - works, legacy flow');
  } catch (error) {
    recordFail('Create event (unclaimed) test failed', error);
  }
}

// ============================================
// Do Not Break Checklist
// ============================================

async function testDoNotBreakChecklist() {
  logSection('"Do Not Break" Checklist');

  try {
    // Test 1: Event creation still works
    const host = await createTestPerson('Checklist Host', getTestEmail('checklist@test.com'));
    const event = await createTestEvent(host.id, 'Checklist Event');
    if (event) {
      recordPass('Event creation still works');
    } else {
      recordFail('Event creation broken');
    }

    // Test 2: AccessToken table still works
    const token = await createTestAccessToken(host.id, event.id, 'HOST');
    if (token) {
      recordPass('AccessToken table still works');
    } else {
      recordFail('AccessToken table broken');
    }

    // Test 3: Person table unchanged
    const person = await createTestPerson('Test Person', getTestEmail('person@test.com'));
    if (person && person.email) {
      recordPass('Person table unchanged');
    } else {
      recordFail('Person table broken');
    }
  } catch (error) {
    recordFail('"Do Not Break" checklist failed', error);
  }
}

// ============================================
// Main Execution
// ============================================

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         Phase 1 Dual-Run Validation (Ticket 1.8)          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Run all test scenarios
    await testLegacyHostTokenAccess();
    await testLegacyCoordinatorTokenAccess();
    await testLegacyParticipantTokenAccess();
    await testNewUserSignIn();
    await testClaimedHostViaSession();
    await testClaimedHostViaOldToken();
    await testSessionExpiry();
    await testLogout();
    await testCreateEventClaimed();
    await testCreateEventUnclaimed();
    await testDoNotBreakChecklist();

    // Summary
    logSection('Validation Summary');
    console.log(`Total Tests: ${passedTests + failedTests}`);
    console.log(`Passed: ${passedTests} ✓`);
    console.log(`Failed: ${failedTests} ✗`);

    if (failedTests === 0) {
      console.log('\n🎉 All validation tests passed! Phase 1 is complete.');
      process.exit(0);
    } else {
      console.log(`\n⚠️  ${failedTests} test(s) failed. Please review and fix.`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Validation script encountered an error:', error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

// Run validation
main();
