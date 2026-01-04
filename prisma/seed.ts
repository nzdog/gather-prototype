import { PrismaClient } from '@prisma/client';
import { makeNzdtChristmas2025Date } from '../src/lib/timezone';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

async function main() {
  console.log('🌱 Starting seed...');

  // Check if this is a fresh seed or incremental reseed
  const existingPeople = await prisma.person.count();
  const isIncremental = existingPeople > 0;

  if (isIncremental) {
    console.log(`ℹ️  Found ${existingPeople} existing people - doing incremental reseed (keeping people/teams/tokens)`);
  }

  // ============================================
  // STEP 1: CREATE OR FETCH PEOPLE
  // ============================================
  const personByName = new Map();

  const peopleData = [
    // Host (also Veg & Sides coordinator)
    { name: "Jacqui & Ian", role: "HOST", teamName: "Vegetables & Sides" },
    // Coordinators
    { name: "Joanna", role: "COORDINATOR", teamName: "Entrées & Nibbles" },
    { name: "Kate", role: "COORDINATOR", teamName: "Mains – Proteins" },
    { name: "Anika", role: "COORDINATOR", teamName: "Puddings" },
    { name: "Gus", role: "COORDINATOR", teamName: "Later Food" },
    { name: "Ian", role: "COORDINATOR", teamName: "Drinks" },
    { name: "Elliot", role: "COORDINATOR", teamName: "Setup" },
    { name: "Nigel", role: "COORDINATOR", teamName: "Clean-up" },
    // Entrées & Nibbles participants
    { name: "Pete", role: "PARTICIPANT", teamName: "Entrées & Nibbles" },
    { name: "Jack", role: "PARTICIPANT", teamName: "Entrées & Nibbles" },
    { name: "Tom", role: "PARTICIPANT", teamName: "Entrées & Nibbles" },
    { name: "Jane", role: "PARTICIPANT", teamName: "Entrées & Nibbles" },
    { name: "Gavin", role: "PARTICIPANT", teamName: "Entrées & Nibbles" },
    // Mains – Proteins participants
    { name: "Angus", role: "PARTICIPANT", teamName: "Mains – Proteins" },
    { name: "Dougal", role: "PARTICIPANT", teamName: "Mains – Proteins" },
    { name: "Robyn", role: "PARTICIPANT", teamName: "Mains – Proteins" },
    // Vegetables & Sides participants
    { name: "Emma", role: "PARTICIPANT", teamName: "Vegetables & Sides" },
    { name: "Grace", role: "PARTICIPANT", teamName: "Vegetables & Sides" },
    // Puddings participants
    { name: "Keith", role: "PARTICIPANT", teamName: "Puddings" },
    { name: "Rosie", role: "PARTICIPANT", teamName: "Puddings" },
    { name: "Lance", role: "PARTICIPANT", teamName: "Puddings" },
    // Clean-up participants
    { name: "George", role: "PARTICIPANT", teamName: "Clean-up" },
    { name: "Aaron", role: "PARTICIPANT", teamName: "Clean-up" },
    { name: "Florence", role: "PARTICIPANT", teamName: "Clean-up" },
    { name: "Emily", role: "PARTICIPANT", teamName: "Clean-up" },
    { name: "Charlie", role: "PARTICIPANT", teamName: "Clean-up" },
    { name: "Lucas", role: "PARTICIPANT", teamName: "Clean-up" },
    { name: "Oliver", role: "PARTICIPANT", teamName: "Clean-up" },
    { name: "Annie", role: "PARTICIPANT", teamName: "Clean-up" },
  ];

  if (isIncremental) {
    // Fetch existing people
    console.log('Fetching existing people...');
    const existingPeopleList = await prisma.person.findMany();
    for (const person of existingPeopleList) {
      const personData = peopleData.find(p => p.name === person.name);
      if (personData) {
        personByName.set(person.name, { ...person, role: personData.role, teamName: personData.teamName });
      }
    }
    console.log(`✓ Fetched ${personByName.size} existing people`);
  } else {
    // Create new people
    console.log('Creating people...');
    for (const personData of peopleData) {
      const person = await prisma.person.create({
        data: { name: personData.name }
      });
      personByName.set(personData.name, { ...person, role: personData.role, teamName: personData.teamName });
    }
    console.log(`✓ Created ${personByName.size} people`);
  }

  // ============================================
  // STEP 2: CREATE OR FETCH EVENT
  // ============================================
  let event;
  const jacqui = personByName.get("Jacqui & Ian");

  if (isIncremental) {
    console.log('Fetching existing event...');
    event = await prisma.event.findFirst();
    if (!event) {
      throw new Error('Incremental seed failed: no existing event found');
    }
    console.log(`✓ Fetched event: ${event.name}`);
  } else {
    console.log('Creating event...');
    event = await prisma.event.create({
      data: {
        name: "Wickham Family Christmas",
        startDate: makeNzdtChristmas2025Date("2025-12-24", "00:00"),
        endDate: makeNzdtChristmas2025Date("2025-12-26", "23:59"),
        status: "CONFIRMING",
        guestCount: 27,
        hostId: jacqui.id,
      }
    });
    console.log(`✓ Created event: ${event.name}`);
  }

  // ============================================
  // STEP 3: CREATE DAYS
  // ============================================
  console.log('Creating days...');

  const daysData = [
    { name: "Christmas Eve", date: makeNzdtChristmas2025Date("2025-12-24", "00:00") },
    { name: "Christmas Day", date: makeNzdtChristmas2025Date("2025-12-25", "00:00") },
    { name: "Boxing Day", date: makeNzdtChristmas2025Date("2025-12-26", "00:00") },
  ];

  const dayByName = new Map();
  for (const dayData of daysData) {
    const day = await prisma.day.create({
      data: {
        name: dayData.name,
        date: dayData.date,
        eventId: event.id,
      }
    });
    dayByName.set(dayData.name, day);
  }

  console.log(`✓ Created ${dayByName.size} days`);

  // ============================================
  // STEP 4: CREATE OR FETCH TEAMS
  // ============================================
  const teamsData = [
    { name: "Entrées & Nibbles", scope: "Pre-meal food, easy grazing", coordinatorName: "Joanna" },
    { name: "Mains – Proteins", scope: "Centre protein dishes for 36-40", coordinatorName: "Kate" },
    { name: "Vegetables & Sides", scope: "Salads + hot veg, volume + balance", coordinatorName: "Jacqui & Ian" },
    { name: "Puddings", scope: "Desserts including GF options", coordinatorName: "Anika" },
    { name: "Later Food", scope: "Evening / next-day easy food", coordinatorName: "Gus" },
    { name: "Drinks", scope: "All drinks + ice", coordinatorName: "Ian" },
    { name: "Setup", scope: "Tables, labels, rubbish setup", coordinatorName: "Elliot" },
    { name: "Clean-up", scope: "Dishwasher, clearing, dessert cleanup", coordinatorName: "Nigel" },
  ];

  const teamByName = new Map();

  if (isIncremental) {
    console.log('Fetching existing teams...');
    const existingTeams = await prisma.team.findMany();
    for (const team of existingTeams) {
      teamByName.set(team.name, team);
    }
    console.log(`✓ Fetched ${teamByName.size} teams`);
  } else {
    console.log('Creating teams...');
    for (const teamData of teamsData) {
      const coordinator = personByName.get(teamData.coordinatorName);
      const team = await prisma.team.create({
        data: {
          name: teamData.name,
          scope: teamData.scope,
          coordinatorId: coordinator.id,
          eventId: event.id,
        }
      });
      teamByName.set(teamData.name, team);
    }
    console.log(`✓ Created ${teamByName.size} teams`);
  }

  // ============================================
  // STEP 5: CREATE OR SKIP PERSONEVENT (MEMBERSHIP)
  // ============================================
  if (isIncremental) {
    console.log('✓ Skipping memberships (already exist)');
  } else {
    console.log('Creating person-event memberships...');
    let membershipCount = 0;
    for (const [_name, person] of personByName) {
      const team = teamByName.get(person.teamName);
      await prisma.personEvent.create({
        data: {
          personId: person.id,
          eventId: event.id,
          teamId: team.id,
          role: person.role,
        }
      });
      membershipCount++;
    }
    console.log(`✓ Created ${membershipCount} memberships`);
  }

  // ============================================
  // DROP-OFF REFERENCE OBJECT
  // ============================================
  const dropOff = {
    eve: { at: makeNzdtChristmas2025Date("2025-12-24", "17:30"), location: "Kate's Kitchen", note: "5:30pm" },
    day: { at: makeNzdtChristmas2025Date("2025-12-25", "12:00"), location: "Marquee", note: "12 noon" },
    box: { at: makeNzdtChristmas2025Date("2025-12-26", "12:00"), location: "Marquee", note: "12 noon" },
    setup: { at: makeNzdtChristmas2025Date("2025-12-25", "10:00"), location: "Marquee", note: "10:00am" },
  };

  // ============================================
  // STEP 6: CREATE ITEMS
  // ============================================
  console.log('Creating items...');

  const itemsData = [
    // ENTRÉES & NIBBLES
    { teamName: "Entrées & Nibbles", name: "Ceviche snapper starter", quantity: "Half platter", assigneeName: "Jack", glutenFree: true, dairyFree: true, dayName: "Christmas Eve", ...dropOff.eve, critical: false },
    { teamName: "Entrées & Nibbles", name: "Ceviche snapper starter", quantity: "Half platter", assigneeName: "Tom", glutenFree: true, dairyFree: true, dayName: "Christmas Eve", ...dropOff.eve, critical: false },
    { teamName: "Entrées & Nibbles", name: "Potato chips, nuts, nibbles", quantity: "Plenty", assigneeName: "Pete", dayName: "Christmas Eve", ...dropOff.eve, critical: false },
    { teamName: "Entrées & Nibbles", name: "Potato chips, nuts, nibbles", quantity: "Plenty", assigneeName: "Joanna", dayName: "Christmas Eve", ...dropOff.eve, critical: false },
    { teamName: "Entrées & Nibbles", name: "Platter food", quantity: "1 platter", assigneeName: "Jane", dayName: "Christmas Day", ...dropOff.day, critical: false },
    { teamName: "Entrées & Nibbles", name: "Platter food", quantity: "1 platter", assigneeName: "Gavin", dayName: "Christmas Day", ...dropOff.day, critical: false },

    // MAINS – PROTEINS
    { teamName: "Mains – Proteins", name: "Turkey + stuffing + gravy", quantity: "1", assigneeName: "Angus", glutenFree: true, dayName: "Christmas Day", ...dropOff.day, critical: true },
    { teamName: "Mains – Proteins", name: "Turkey + stuffing + gravy", quantity: "1", assigneeName: "Dougal", glutenFree: true, dayName: "Christmas Day", ...dropOff.day, critical: true },
    { teamName: "Mains – Proteins", name: "Turkey + stuffing + gravy", quantity: "1", assigneeName: "Robyn", glutenFree: true, dayName: "Christmas Day", ...dropOff.day, critical: true },
    { teamName: "Mains – Proteins", name: "Ham (basted)", quantity: "1", assigneeName: "Kate", glutenFree: true, dayName: "Christmas Day", ...dropOff.day, critical: true },
    { teamName: "Mains – Proteins", name: "Ham (basted)", quantity: "1", assigneeName: "Angus", glutenFree: true, dayName: "Christmas Day", ...dropOff.day, critical: true },
    { teamName: "Mains – Proteins", name: "Beef fillets", quantity: "3", assigneeName: "Kate", glutenFree: true, dairyFree: true, dayName: "Christmas Eve", ...dropOff.eve, critical: true },
    { teamName: "Mains – Proteins", name: "Beef fillets", quantity: "2", assigneeName: "Angus", glutenFree: true, dairyFree: true, dayName: "Christmas Eve", ...dropOff.eve, critical: true },
    { teamName: "Mains – Proteins", name: "Salmon fillets", quantity: "2", assigneeName: "Kate", glutenFree: true, dairyFree: true, dayName: "Christmas Eve", ...dropOff.eve, critical: true },
    { teamName: "Mains – Proteins", name: "Farm sausages", quantity: "Plenty", assigneeName: "Robyn", glutenFree: true, dairyFree: true, dayName: "Christmas Eve", ...dropOff.eve, critical: false },

    // VEGETABLES & SIDES
    { teamName: "Vegetables & Sides", name: "Potato gratin", quantity: "3", assigneeName: null, glutenFree: false, dayName: "Christmas Eve", ...dropOff.eve, critical: false, notes: "UNASSIGNED — needs coordinator to assign within Veg team" },
    { teamName: "Vegetables & Sides", name: "Vege pilaf (raw)", quantity: "Large", assigneeName: "Jacqui & Ian", glutenFree: true, dairyFree: true, dayName: "Christmas Day", ...dropOff.day, critical: false },
    { teamName: "Vegetables & Sides", name: "Coleslaw", quantity: "Large", assigneeName: "Emma", glutenFree: true, dairyFree: true, dayName: "Christmas Day", ...dropOff.day, critical: false },
    { teamName: "Vegetables & Sides", name: "Green salad", quantity: "Large", assigneeName: "Grace", glutenFree: true, dairyFree: true, dayName: "Christmas Day", ...dropOff.day, critical: false },
    { teamName: "Vegetables & Sides", name: "Roasted carrots w/ ricotta", quantity: "Large", assigneeName: "Jacqui & Ian", glutenFree: true, dayName: "Christmas Day", ...dropOff.day, critical: false },
    { teamName: "Vegetables & Sides", name: "New potatoes", quantity: "Large", assigneeName: "Emma", glutenFree: true, dairyFree: true, dayName: "Christmas Day", ...dropOff.day, critical: false },
    { teamName: "Vegetables & Sides", name: "Roast vegetables", quantity: "2 large dishes", assigneeName: "Grace", glutenFree: true, dairyFree: true, dayName: "Christmas Day", ...dropOff.day, critical: false },
    { teamName: "Vegetables & Sides", name: "Beetroot salad", quantity: "2", assigneeName: "Jacqui & Ian", glutenFree: true, dairyFree: true, dayName: "Christmas Day", ...dropOff.day, critical: false },

    // PUDDINGS
    { teamName: "Puddings", name: "Ice cream sticks (minis)", quantity: "36", assigneeName: "Keith", glutenFree: true, dayName: "Christmas Eve", ...dropOff.eve, critical: false },
    { teamName: "Puddings", name: "Sweet platters", quantity: "Platter", assigneeName: null, dayName: "Christmas Eve", ...dropOff.eve, critical: false, notes: "UNASSIGNED — needs coordinator to assign within Puddings team" },
    { teamName: "Puddings", name: "Meringues", quantity: "Plenty", assigneeName: "Rosie", dairyFree: true, dayName: "Christmas Eve", ...dropOff.eve, critical: false },
    { teamName: "Puddings", name: "Ginger crunch (GF)", quantity: "Tray", assigneeName: null, glutenFree: true, dayName: "Christmas Eve", ...dropOff.eve, critical: false, notes: "UNASSIGNED — needs coordinator to assign within Puddings team" },
    { teamName: "Puddings", name: "Fudge", quantity: "Tray", assigneeName: null, glutenFree: true, dayName: "Christmas Eve", ...dropOff.eve, critical: false, notes: "UNASSIGNED — needs coordinator to assign within Puddings team" },
    { teamName: "Puddings", name: "GF Christmas cake", quantity: "1", assigneeName: null, glutenFree: true, dayName: "Christmas Eve", ...dropOff.eve, critical: false, notes: "UNASSIGNED — needs coordinator to assign within Puddings team" },
    { teamName: "Puddings", name: "Xmas pudding (non-GF)", quantity: "2", assigneeName: "Anika", dayName: "Christmas Day", ...dropOff.day, critical: true },
    { teamName: "Puddings", name: "GF Xmas pudding", quantity: "1", assigneeName: null, glutenFree: true, dayName: "Christmas Day", ...dropOff.day, critical: true, notes: "UNASSIGNED — CRITICAL — needs coordinator to assign within Puddings team" },
    { teamName: "Puddings", name: "GF trifle", quantity: "3", assigneeName: null, glutenFree: true, dayName: "Christmas Day", ...dropOff.day, critical: true, notes: "UNASSIGNED — CRITICAL — needs coordinator to assign within Puddings team" },
    { teamName: "Puddings", name: "Pavlova", quantity: "1", assigneeName: "Anika", dairyFree: true, dayName: "Christmas Day", ...dropOff.day, critical: true },
    { teamName: "Puddings", name: "Pavlova", quantity: "1", assigneeName: "Lance", dairyFree: true, dayName: "Christmas Day", ...dropOff.day, critical: true },
    { teamName: "Puddings", name: "Pavlova", quantity: "1", assigneeName: null, dairyFree: true, dayName: "Christmas Day", ...dropOff.day, critical: true, notes: "UNASSIGNED — CRITICAL — needs coordinator to assign within Puddings team" },
    { teamName: "Puddings", name: "Berries", quantity: "Plenty", assigneeName: null, glutenFree: true, dairyFree: true, dayName: "Christmas Day", ...dropOff.day, critical: false, notes: "UNASSIGNED — needs coordinator to assign within Puddings team" },
    { teamName: "Puddings", name: "Vanilla ice cream", quantity: "2 tubs", assigneeName: "Rosie", glutenFree: true, dayName: "Christmas Day", ...dropOff.day, critical: false },
    { teamName: "Puddings", name: "Vanilla ice cream", quantity: "2 tubs", assigneeName: "Lance", glutenFree: true, dayName: "Christmas Day", ...dropOff.day, critical: false },

    // LATER FOOD
    { teamName: "Later Food", name: "BBQ sausages", quantity: "Plenty", assigneeName: "Gus", glutenFree: true, dairyFree: true, dayName: "Boxing Day", ...dropOff.box, critical: false },
    { teamName: "Later Food", name: "Bread buns", quantity: "Plenty", assigneeName: null, dayName: "Boxing Day", ...dropOff.box, critical: false, notes: "UNASSIGNED — needs coordinator to assign within Later Food team" },
    { teamName: "Later Food", name: "GF buns", quantity: "Plenty", assigneeName: null, glutenFree: true, dayName: "Boxing Day", ...dropOff.box, critical: false, notes: "UNASSIGNED — needs coordinator to assign within Later Food team" },
    { teamName: "Later Food", name: "Birthday cake (Joanna's 50th)", quantity: "1", assigneeName: null, dayName: "Boxing Day", ...dropOff.box, critical: true, notes: "UNASSIGNED — CRITICAL — needs coordinator to assign within Later Food team" },

    // DRINKS
    { teamName: "Drinks", name: "Welcoming bubbles", quantity: "Plenty", assigneeName: "Ian", glutenFree: true, dairyFree: true, dayName: null, at: null, location: "Main fridge", note: "Bring on arrival", critical: false },

    // SETUP
    { teamName: "Setup", name: "Table setup + labels", quantity: "All tables", assigneeName: null, dayName: "Christmas Day", ...dropOff.setup, critical: true, notes: "UNASSIGNED — CRITICAL — needs coordinator to assign within Setup team" },
    { teamName: "Setup", name: "Buggy + rubbish bags", quantity: "1 set", assigneeName: "Elliot", dayName: "Christmas Day", ...dropOff.setup, critical: true },

    // CLEAN-UP
    { teamName: "Clean-up", name: "Clear plates (mains)", quantity: "Rostered", assigneeName: "George", dayName: "Christmas Day", at: null, location: "Kitchen", note: "After mains", critical: false },
    { teamName: "Clean-up", name: "Clear plates (mains)", quantity: "Rostered", assigneeName: "Aaron", dayName: "Christmas Day", at: null, location: "Kitchen", note: "After mains", critical: false },
    { teamName: "Clean-up", name: "Clear plates (mains)", quantity: "Rostered", assigneeName: "Florence", dayName: "Christmas Day", at: null, location: "Kitchen", note: "After mains", critical: false },
    { teamName: "Clean-up", name: "Clear plates (mains)", quantity: "Rostered", assigneeName: "Emily", dayName: "Christmas Day", at: null, location: "Kitchen", note: "After mains", critical: false },
    { teamName: "Clean-up", name: "Rinse + dishwasher", quantity: "Rostered", assigneeName: "Charlie", dayName: "Christmas Day", at: null, location: "Kitchen", note: "After mains", critical: false },
    { teamName: "Clean-up", name: "Dessert clean-up", quantity: "Rostered", assigneeName: "Lucas", dayName: "Christmas Day", at: null, location: "Kitchen", note: "After dessert", critical: false },
    { teamName: "Clean-up", name: "Dessert clean-up", quantity: "Rostered", assigneeName: "Oliver", dayName: "Christmas Day", at: null, location: "Kitchen", note: "After dessert", critical: false },
    { teamName: "Clean-up", name: "Dessert clean-up", quantity: "Rostered", assigneeName: "Annie", dayName: "Christmas Day", at: null, location: "Kitchen", note: "After dessert", critical: false },
    { teamName: "Clean-up", name: "Clean-up coordination", quantity: "All", assigneeName: "Nigel", dayName: "Christmas Day", at: null, location: "Kitchen", note: "Ongoing", critical: true },
  ];

  const createdItems = [];
  for (const itemData of itemsData) {
    const team = teamByName.get(itemData.teamName);
    const day = itemData.dayName ? dayByName.get(itemData.dayName) : null;

    const item = await prisma.item.create({
      data: {
        name: itemData.name,
        quantity: itemData.quantity,
        critical: itemData.critical || false,
        glutenFree: itemData.glutenFree || false,
        dairyFree: itemData.dairyFree || false,
        notes: ('notes' in itemData) ? itemData.notes : undefined,
        dropOffAt: ('at' in itemData) ? itemData.at : null,
        dropOffLocation: ('location' in itemData) ? itemData.location : null,
        dropOffNote: ('note' in itemData) ? itemData.note : null,
        teamId: team.id,
        dayId: day?.id || null,
        status: 'UNASSIGNED', // Will be updated when assignment created
      }
    });

    createdItems.push({ ...item, assigneeName: itemData.assigneeName, teamName: itemData.teamName });
  }

  console.log(`✓ Created ${createdItems.length} items`);

  // ============================================
  // STEP 7: CREATE ASSIGNMENTS
  // ============================================
  console.log('Creating assignments...');

  let assignedCount = 0;
  let skippedCount = 0;

  for (const item of createdItems) {
    if (!item.assigneeName) {
      // Intentionally unassigned
      continue;
    }

    const person = personByName.get(item.assigneeName);
    if (!person) {
      console.warn(`SEED WARNING: Unknown person "${item.assigneeName}" for item "${item.name}" — leaving unassigned`);
      skippedCount++;
      continue;
    }

    // Verify team match
    const personEvent = await prisma.personEvent.findFirst({
      where: { personId: person.id, eventId: event.id }
    });

    const team = teamByName.get(item.teamName);
    if (personEvent?.teamId !== team.id) {
      console.warn(`SEED WARNING: "${item.assigneeName}" is not in team "${item.teamName}" — leaving item "${item.name}" unassigned`);
      skippedCount++;
      continue;
    }

    // Create assignment
    await prisma.assignment.create({
      data: {
        itemId: item.id,
        personId: person.id,
      }
    });

    // Update item status to ASSIGNED
    await prisma.item.update({
      where: { id: item.id },
      data: { status: 'ASSIGNED' }
    });

    assignedCount++;
  }

  console.log(`✓ Created ${assignedCount} assignments`);
  if (skippedCount > 0) {
    console.log(`⚠ Skipped ${skippedCount} assignments due to team mismatches`);
  }

  // ============================================
  // STEP 8: CREATE OR SKIP ACCESS TOKENS
  // ============================================
  let tokenCount = 0;

  if (isIncremental) {
    tokenCount = await prisma.accessToken.count();
    console.log(`✓ Skipping tokens (${tokenCount} already exist)`);
  } else {
    console.log('Creating access tokens...');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90); // 90 days from now

    // HOST token for Jacqui & Ian
    await prisma.accessToken.create({
      data: {
        token: generateToken(),
        scope: 'HOST',
        personId: jacqui.id,
        eventId: event.id,
        teamId: null,
        expiresAt,
      }
    });
    tokenCount++;

    // COORDINATOR tokens - create for all team coordinators (regardless of their role)
    for (const [teamName, team] of teamByName) {
      const coordinator = personByName.get(teamsData.find(t => t.name === teamName)!.coordinatorName);
      if (coordinator) {
        await prisma.accessToken.create({
          data: {
            token: generateToken(),
            scope: 'COORDINATOR',
            personId: coordinator.id,
            eventId: event.id,
            teamId: team.id,
            expiresAt,
          }
        });
        tokenCount++;
      }
    }

    // PARTICIPANT tokens
    for (const [_name, person] of personByName) {
      if (person.role === 'PARTICIPANT') {
        await prisma.accessToken.create({
          data: {
            token: generateToken(),
            scope: 'PARTICIPANT',
            personId: person.id,
            eventId: event.id,
            teamId: null,
            expiresAt,
          }
        });
        tokenCount++;
      }
    }

    console.log(`✓ Created ${tokenCount} access tokens`);
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n🎉 Seed complete!\n');
  console.log('Summary:');
  console.log(`- Event: ${event.name}`);
  console.log(`- People: ${personByName.size}`);
  console.log(`- Teams: ${teamByName.size}`);
  console.log(`- Days: ${dayByName.size}`);
  console.log(`- Items: ${createdItems.length}`);
  console.log(`- Assignments: ${assignedCount}`);
  console.log(`- Unassigned: ${createdItems.length - assignedCount}`);
  console.log(`- Access tokens: ${tokenCount}`);

  // Count critical gaps
  const criticalGaps = await prisma.item.count({
    where: {
      team: { eventId: event.id },
      critical: true,
      status: 'UNASSIGNED',
    }
  });
  console.log(`- Critical gaps: ${criticalGaps}`);

  // Fetch all tokens for display
  const tokens = await prisma.accessToken.findMany({
    include: {
      person: true,
    },
    orderBy: {
      scope: 'asc',
    }
  });

  console.log('\n🔑 Magic Link Tokens:\n');
  console.log('HOST:');
  const hostTokens = tokens.filter(t => t.scope === 'HOST');
  for (const token of hostTokens) {
    console.log(`  ${token.person.name}: /h/${token.token}`);
  }

  console.log('\nCOORDINATORS:');
  const coordTokens = tokens.filter(t => t.scope === 'COORDINATOR');
  for (const token of coordTokens) {
    console.log(`  ${token.person.name}: /c/${token.token}`);
  }

  console.log('\nPARTICIPANTS (sample):');
  const participantTokens = tokens.filter(t => t.scope === 'PARTICIPANT');
  for (const token of participantTokens.slice(0, 5)) {
    console.log(`  ${token.person.name}: /p/${token.token}`);
  }
  console.log(`  ... and ${participantTokens.length - 5} more participants`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
