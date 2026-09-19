/**
 * THE DEMO SEED — the Henderson board, and the only board in this repo the press can run
 * against.
 *
 * ── ⚠ EVERY ADDRESS IS ON A RESERVED DOMAIN, AND THAT IS A SAFETY PROPERTY ───
 *
 * Founder ruling, 2026-09-19. Until then this file wrote 37 addresses at gmail.com,
 * outlook.com, xtra.co.nz and yahoo.com — fabricated names at REAL, RESOLVING providers. They
 * are nobody's addresses, and that is not the same as nobody receiving them: a working Resend
 * key plus one press is 37 delivery attempts at real mail servers, and `aarav.ph@gmail.com`
 * may well belong to a stranger.
 *
 * ⚠ THE EVIDENCE IS [[GTC-189]] SLICE 5e's INCIDENT, and it is why this is a ruling rather
 * than tidiness. That sweep enrolled and attempted 20 rows across four real boards before
 * anybody noticed. Nothing was delivered, and [[GTC-322]] records the reason in the founder's
 * words: *"a broken Resend key and reserved email domains. Both luck."* **This change makes
 * one half of that not-luck.** `example.com` is reserved by RFC 2606 and does not resolve, so
 * a press against this board attempts nothing that can reach a person.
 *
 * ⚠ AND IT CHANGES WHAT A RESEED PRODUCES, NOT WHAT IS IN `gather_dev` NOW. The 37 consumer
 * addresses already exist there. Whether to rewrite them as data is a separate decision and a
 * separate write — surfaced, not taken.
 *
 * ── ⚠ AND THE HOST NOW HAS AN ACCOUNT, WITHOUT WHICH THE PRESS REFUSES THIS BOARD ──
 *
 * This file created NO `User` at all until 2026-09-19, so a freshly seeded Henderson board had
 * a host with no account — and ruling AC refuses exactly that: *"an event whose host has no
 * account is fixed before it sends, not sent with a hole in it,"* because the reply-to is
 * `User.email` and a message whose replies go nowhere is the hole.
 *
 * **So the only pressable board in `gather_dev` was pressable only by accident:** its
 * `sarah.henderson@demo.gather` account was minted by the magic-link CLAIM flow on 2026-03-13,
 * by hand, and [[GTC-269]] records it as the account that then accumulated HOST on two events.
 * A rebuild from this file would have produced a board the press refuses. It now creates the
 * account and the `EventRole` deliberately.
 */
import { PrismaClient } from '@prisma/client';
import { makeNzdtChristmasDate } from '../src/lib/timezone';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

/**
 * ⚠ RESERVED BY RFC 2606 AND NON-RESOLVING. Every seeded address uses it. See the header: a
 * fabricated name at a REAL provider is still a real delivery attempt.
 */
const SEED_DOMAIN = 'example.com';

/** The host's login account. Ruling AC refuses a press without one — see the header. */
const HOST_ACCOUNT_EMAIL = `sarah.henderson@${SEED_DOMAIN}`;

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

async function main() {
  console.log('🌱 Starting fresh seed...');

  // ============================================
  // STEP 1: CREATE PEOPLE (43 total)
  // ============================================
  const personByName = new Map();

  const peopleData = [
    // HENDERSONS (12 people)
    { name: 'Sarah Henderson', role: 'HOST', teamName: 'Mains', phone: '+6421234567' },
    {
      name: 'Rob Henderson',
      role: 'COORDINATOR',
      teamName: 'Setup & Equipment',
      phone: '+6421234568',
    },
    {
      name: 'Jenny Henderson',
      role: 'PARTICIPANT',
      teamName: 'Mains',
      email: 'jenny.h@example.com',
    },
    {
      name: 'Mike Henderson',
      role: 'PARTICIPANT',
      teamName: 'Mains',
      email: 'mike.henderson@example.com',
    },
    {
      name: 'Emma Henderson',
      role: 'PARTICIPANT',
      teamName: 'Desserts',
      email: 'emma.h@example.com',
    },
    {
      name: 'Jake Henderson',
      role: 'COORDINATOR',
      teamName: 'Cleanup',
      email: 'jake.h@example.com',
    },
    {
      name: 'Lily Henderson',
      role: 'PARTICIPANT',
      teamName: 'Starters & Nibbles',
      email: 'lily.henderson@example.com',
    },
    {
      name: 'Sophie Henderson',
      role: 'PARTICIPANT',
      teamName: 'Salads & Sides',
      email: 'sophie.h@example.com',
    }, // vegetarian
    {
      name: 'Tom Henderson',
      role: 'COORDINATOR',
      teamName: 'Kids Zone',
      email: 'tom.henderson@example.com',
    },
    /*
     * ⚠ AMY HOLDS A PHONE AND HAS OPTED OUT OF TEXTS — [[GTC-301]]'s PER-HOST FACT, WHICH HAD
     * NO INSTANCE ANYWHERE. Founder ruling, 2026-09-19.
     *
     * `SmsOptOut` held ZERO rows in `gather_dev` and no seed wrote one, so Do-Not-Touch Zone
     * 7's per-host half — the table `checkOptOut` in `sendSms` refuses on, and the one
     * `readAskPreview` merges — had never been exercised against data. Only the global boolean
     * `Person.smsOptedOut` ever was.
     *
     * ⚠ SHE HAS NO EMAIL ON PURPOSE. `askChannelOf` is email-first, so an opt-out on somebody
     * holding an address changes nothing about the ask and would prove nothing. With a phone
     * and no address she is the one case where Zone 7 decides the route: ruling O's *"a no to
     * one channel is treated as a no to being chased"* puts her on the host's list with
     * `SMS_OPTED_OUT` rather than `NO_CHANNEL`.
     *
     * ⚠ AND IT CHANGES WHAT A RESEED MEASURES: the host list keeps its four people and gains a
     * SECOND why-code. Every measurement in [[GTC-189]] taken against the current
     * `gather_dev` copy — 38 recipients, 4 host list, all NO_CHANNEL — was taken before this
     * and does not describe a reseeded board.
     */
    {
      name: 'Amy Henderson',
      role: 'PARTICIPANT',
      teamName: 'Drinks',
      phone: '+6421234570',
      smsOptedOut: true,
    }, // UNTRACKABLE BY TEXT — Zone 7, per host
    { name: 'Max Henderson', role: 'PARTICIPANT', teamName: 'Kids Zone' }, // UNTRACKABLE (kid)
    {
      name: 'Olivia Henderson',
      role: 'PARTICIPANT',
      teamName: 'Desserts',
      email: 'olivia.h@example.com',
    },

    // NGUYENS (8 people)
    {
      name: 'David Nguyen',
      role: 'COORDINATOR',
      teamName: 'Drinks',
      phone: '+6421234569',
      email: 'david.nguyen@example.com',
    },
    {
      name: 'Michelle Nguyen',
      role: 'PARTICIPANT',
      teamName: 'Desserts',
      email: 'michelle.nguyen@example.com',
    },
    {
      name: 'Ethan Nguyen',
      role: 'PARTICIPANT',
      teamName: 'Starters & Nibbles',
      email: 'ethan.n@example.com',
    },
    {
      name: 'Grace Nguyen',
      role: 'PARTICIPANT',
      teamName: 'Salads & Sides',
      email: 'grace.nguyen@example.com',
    }, // vegetarian
    {
      name: 'Lucas Nguyen',
      role: 'PARTICIPANT',
      teamName: 'Cleanup',
      email: 'lucas.nguyen@example.com',
    },
    {
      name: 'Mia Nguyen',
      role: 'PARTICIPANT',
      teamName: 'Starters & Nibbles',
      email: 'mia.n@example.com',
    },
    { name: 'Noah Nguyen', role: 'PARTICIPANT', teamName: 'Kids Zone' }, // UNTRACKABLE (kid)
    {
      name: 'Chloe Nguyen',
      role: 'PARTICIPANT',
      teamName: 'Mains',
      email: 'chloe.nguyen@example.com',
    }, // gluten-free

    // TURNERS (8 people)
    {
      name: 'Kate Turner',
      role: 'COORDINATOR',
      teamName: 'Starters & Nibbles',
      phone: '+6421234570',
      email: 'kate.turner@example.com',
    },
    {
      name: 'James Turner',
      role: 'PARTICIPANT',
      teamName: 'Mains',
      email: 'james.turner@example.com',
    },
    {
      name: 'Isabella Turner',
      role: 'PARTICIPANT',
      teamName: 'Desserts',
      email: 'isabella.t@example.com',
    }, // gluten-free
    {
      name: 'Jack Turner',
      role: 'PARTICIPANT',
      teamName: 'Cleanup',
      email: 'jack.turner@example.com',
    },
    {
      name: 'Charlotte Turner',
      role: 'PARTICIPANT',
      teamName: 'Salads & Sides',
      email: 'charlotte.t@example.com',
    },
    { name: 'Harry Turner', role: 'PARTICIPANT', teamName: 'Drinks', email: 'harry.t@example.com' },
    {
      name: 'Amelia Turner',
      role: 'PARTICIPANT',
      teamName: 'Kids Zone',
      email: 'amelia.turner@example.com',
    },
    {
      name: 'Oscar Turner',
      role: 'PARTICIPANT',
      teamName: 'Starters & Nibbles',
      email: 'oscar.t@example.com',
    },

    // PATEL-HENDERSONS (8 people)
    {
      name: 'Priya Patel-Henderson',
      role: 'COORDINATOR',
      teamName: 'Salads & Sides',
      phone: '+6421234571',
      email: 'priya.ph@example.com',
    },
    {
      name: 'Raj Patel-Henderson',
      role: 'PARTICIPANT',
      teamName: 'Mains',
      email: 'raj.ph@example.com',
    },
    {
      name: 'Aarav Patel-Henderson',
      role: 'PARTICIPANT',
      teamName: 'Cleanup',
      email: 'aarav.ph@example.com',
    },
    {
      name: 'Zara Patel-Henderson',
      role: 'PARTICIPANT',
      teamName: 'Desserts',
      email: 'zara.ph@example.com',
    }, // vegetarian, gluten-free
    {
      name: 'Arjun Patel-Henderson',
      role: 'PARTICIPANT',
      teamName: 'Starters & Nibbles',
      email: 'arjun.ph@example.com',
    }, // vegetarian
    {
      name: 'Maya Patel-Henderson',
      role: 'PARTICIPANT',
      teamName: 'Kids Zone',
      email: 'maya.ph@example.com',
    },
    {
      name: 'Liam Patel-Henderson',
      role: 'PARTICIPANT',
      teamName: 'Drinks',
      email: 'liam.ph@example.com',
    },
    {
      name: 'Nina Patel-Henderson',
      role: 'PARTICIPANT',
      teamName: 'Salads & Sides',
      email: 'nina.ph@example.com',
    }, // vegan

    // O'BRIENS (7 people)
    {
      name: "Finn O'Brien",
      role: 'COORDINATOR',
      teamName: 'Desserts',
      email: 'finn.obrien@example.com',
    },
    {
      name: "Siobhan O'Brien",
      role: 'PARTICIPANT',
      teamName: 'Salads & Sides',
      email: 'siobhan.obrien@example.com',
    }, // dairy-free
    {
      name: "Connor O'Brien",
      role: 'PARTICIPANT',
      teamName: 'Mains',
      email: 'connor.ob@example.com',
    },
    {
      name: "Maeve O'Brien",
      role: 'PARTICIPANT',
      teamName: 'Starters & Nibbles',
      email: 'maeve.obrien@example.com',
    },
    {
      name: "Declan O'Brien",
      role: 'PARTICIPANT',
      teamName: 'Cleanup',
      email: 'declan.ob@example.com',
    },
    {
      name: "Aoife O'Brien",
      role: 'PARTICIPANT',
      teamName: 'Drinks',
      email: 'aoife.obrien@example.com',
    }, // vegetarian, dairy-free
    { name: "Ronan O'Brien", role: 'PARTICIPANT', teamName: 'Kids Zone' }, // UNTRACKABLE (kid)
  ];

  console.log('Creating people...');
  for (const personData of peopleData) {
    const person = await prisma.person.create({
      data: {
        name: personData.name,
        email: (personData as any).email || null,
        phoneNumber: (personData as any).phone || null,
        /*
         * [[GTC-301]]'s GLOBAL fact. The PER-HOST row goes in below, once the host exists —
         * `SmsOptOut` keys on `hostId`, so it cannot be written from inside this loop.
         * ⚠ BOTH ARE SET FOR AMY DELIBERATELY: the two facts have different writers and
         * different readers, and a seed that set only one would leave whichever reader it
         * missed still untested. GTC-301 is the ticket that says nobody had named that.
         */
        smsOptedOut: (personData as any).smsOptedOut === true,
      },
    });
    personByName.set(personData.name, {
      ...person,
      role: personData.role,
      teamName: personData.teamName,
    });
  }
  console.log(`✓ Created ${personByName.size} people`);

  // ============================================
  // STEP 2: CREATE EVENT
  // ============================================
  const sarah = personByName.get('Sarah Henderson');

  console.log('Creating event...');
  const event = await prisma.event.create({
    data: {
      name: 'Henderson Family Christmas 2026',
      startDate: makeNzdtChristmasDate('2026-12-24', '00:00'),
      endDate: makeNzdtChristmasDate('2026-12-26', '23:59'),
      status: 'CONFIRMING',
      isDemo: true,
      occasionType: 'CHRISTMAS',
      guestCount: 43,
      hostId: sarah.id,
      venueName: "Uncle Rob's place, Mangawhai",
      venueType: 'HOME',
      venueKitchenAccess: 'FULL',
      venueOvenCount: 1,
      venueBbqAvailable: true,
      dietaryStatus: 'SPECIFIED',
      dietaryVegetarian: 6,
      dietaryVegan: 1,
      dietaryGlutenFree: 3,
      dietaryDairyFree: 2,
    },
  });
  console.log(`✓ Created event: ${event.name}`);

  /*
   * ── ⚠ THE HOST'S ACCOUNT, WITHOUT WHICH THE PRESS REFUSES THIS BOARD ────────
   *
   * Ruling AC ([[GTC-189]] decision 12): *"an event whose host has no account is fixed before
   * it sends, not sent with a hole in it."* The reply-to is `User.email` (ruling F) and there
   * is no custom reply-to column, so no account means replies go nowhere.
   *
   * This file created no `User` until 2026-09-19, so a freshly seeded board was refused by
   * `pressSend` with `HOST_HAS_NO_ACCOUNT`. The account that made `gather_dev`'s copy
   * pressable was minted by the magic-link CLAIM flow, by hand, in March — see the header.
   *
   * `EventRole` is what `requireEventRole` reads, so the account needs both rows: the `User`
   * for the reply-to, and the role for the session guard on every host route.
   */
  const hostUser = await prisma.user.create({
    data: { email: HOST_ACCOUNT_EMAIL },
  });
  await prisma.person.update({ where: { id: sarah.id }, data: { userId: hostUser.id } });
  await prisma.eventRole.create({
    data: { userId: hostUser.id, eventId: event.id, role: 'HOST' },
  });
  console.log(`✓ Host account: ${hostUser.email} (and an EventRole on this event)`);

  /*
   * ── ⚠ ZONE 7's PER-HOST OPT-OUT ROW — see Amy Henderson in `peopleData` ─────
   *
   * `SmsOptOut` keys on `[phoneNumber, hostId]`, so it can only be written once the host
   * Person exists. It held ZERO rows in `gather_dev` and no seed wrote one, so the table
   * `checkOptOut` refuses on — and the one `readAskPreview` merges through `smsOptedOutFact`
   * — had never been exercised against data.
   *
   * ⚠ THE `rawMessage` IS WHAT A REAL STOP LOOKS LIKE, because a row with a null message is a
   * row nobody can tell from an administrative write.
   */
  const amy = personByName.get('Amy Henderson');
  await prisma.smsOptOut.create({
    data: {
      phoneNumber: amy.phoneNumber,
      hostId: sarah.id,
      rawMessage: 'STOP',
    },
  });
  console.log(`✓ Zone 7: one SmsOptOut row for ${amy.name} under this host`);

  /*
   * ── ⚠ RULING AC'S REFUSAL NEEDS A POPULATION, AND THIS IS IT ────────────────
   *
   * Founder ruling, 2026-09-19: seed *"one event whose host has no User"*, because it is a
   * population a ruling already depends on and one a rebuild otherwise destroys.
   *
   * ⚠ THE INSTRUCTION WAS GIVEN ON A READING THAT TURNED OUT BACKWARDS, AND THE SHAPE IS
   * SEEDED ANYWAY BECAUSE THE INTENT SURVIVES IT. The executor had reported that no seed
   * creates a host without an account; in fact this file created NOTHING BUT that shape, and
   * `gather_dev`'s two instances ("Kate test event", "Summer BBQ Party") are hand-made rather
   * than the only ones possible. So what was actually missing after a rebuild was a host WITH
   * an account — fixed above — and this event makes the refusal's population DELIBERATE rather
   * than accidental, which is what the ruling was for.
   *
   * It carries one membership and one item so the press has something to refuse ABOUT: a
   * refusal on an empty event would be indistinguishable from `NO_RECIPIENTS`.
   */
  const orphanHost = await prisma.person.create({
    data: { name: 'Unclaimed Host', email: `unclaimed.host@${SEED_DOMAIN}` },
  });
  const unclaimedEvent = await prisma.event.create({
    data: {
      name: 'Unclaimed event — the host never signed in',
      startDate: makeNzdtChristmasDate('2026-12-24', '00:00'),
      endDate: makeNzdtChristmasDate('2026-12-26', '23:59'),
      status: 'CONFIRMING',
      isDemo: true,
      hostId: orphanHost.id,
    },
  });
  await prisma.personEvent.create({
    data: { personId: orphanHost.id, eventId: unclaimedEvent.id, role: 'HOST' },
  });
  const orphanGuest = await prisma.person.create({
    data: { name: 'Unclaimed Guest', email: `unclaimed.guest@${SEED_DOMAIN}` },
  });
  await prisma.personEvent.create({
    data: { personId: orphanGuest.id, eventId: unclaimedEvent.id, role: 'PARTICIPANT' },
  });
  const unclaimedTeam = await prisma.team.create({
    data: { name: 'Mains', eventId: unclaimedEvent.id, coordinatorId: orphanHost.id },
  });
  const unclaimedItem = await prisma.item.create({
    data: { teamId: unclaimedTeam.id, name: 'A dish nobody will be asked for', kind: 'ITEM' },
  });
  await prisma.assignment.create({
    data: { itemId: unclaimedItem.id, personId: orphanGuest.id, response: 'PENDING' },
  });
  console.log(`✓ Created ${unclaimedEvent.name} — ruling AC's refusal has a population`);

  // ============================================
  // STEP 3: CREATE DAYS
  // ============================================
  console.log('Creating days...');

  const daysData = [
    { name: 'Christmas Eve', date: makeNzdtChristmasDate('2026-12-24', '00:00') },
    { name: 'Christmas Day', date: makeNzdtChristmasDate('2026-12-25', '00:00') },
    { name: 'Boxing Day', date: makeNzdtChristmasDate('2026-12-26', '00:00') },
  ];

  const dayByName = new Map();
  for (const dayData of daysData) {
    const day = await prisma.day.create({
      data: {
        name: dayData.name,
        date: dayData.date,
        eventId: event.id,
      },
    });
    dayByName.set(dayData.name, day);
  }

  console.log(`✓ Created ${dayByName.size} days`);

  // ============================================
  // STEP 4: CREATE TEAMS
  // ============================================
  const teamsData = [
    { name: 'Starters & Nibbles', scope: 'Pre-meal appetizers', coordinatorName: 'Kate Turner' },
    { name: 'Mains', scope: 'Main proteins and BBQ', coordinatorName: 'Sarah Henderson' },
    {
      name: 'Salads & Sides',
      scope: 'Salads and side dishes',
      coordinatorName: 'Priya Patel-Henderson',
    },
    { name: 'Desserts', scope: 'Desserts and sweets', coordinatorName: "Finn O'Brien" },
    { name: 'Drinks', scope: 'All beverages', coordinatorName: 'David Nguyen' },
    { name: 'Kids Zone', scope: 'Kids activities and setup', coordinatorName: 'Tom Henderson' },
    {
      name: 'Setup & Equipment',
      scope: 'Tables, chairs, equipment',
      coordinatorName: 'Rob Henderson',
    },
    { name: 'Cleanup', scope: 'Cleanup and rubbish', coordinatorName: 'Jake Henderson' },
  ];

  const teamByName = new Map();

  console.log('Creating teams...');
  for (const teamData of teamsData) {
    const coordinator = personByName.get(teamData.coordinatorName);
    const team = await prisma.team.create({
      data: {
        name: teamData.name,
        scope: teamData.scope,
        coordinatorId: coordinator.id,
        eventId: event.id,
      },
    });
    teamByName.set(teamData.name, team);
  }
  console.log(`✓ Created ${teamByName.size} teams`);

  // ============================================
  // STEP 5: CREATE PERSONEVENT (MEMBERSHIP)
  // ============================================
  console.log('Creating person-event memberships...');
  let membershipCount = 0;
  for (const [_name, person] of personByName) {
    const team = teamByName.get(person.teamName);

    // Determine reachability tier and contact method
    let reachabilityTier: 'DIRECT' | 'UNTRACKABLE' = 'UNTRACKABLE';
    let contactMethod: 'EMAIL' | 'SMS' | 'NONE' = 'NONE';

    if (person.phoneNumber) {
      contactMethod = 'SMS';
      reachabilityTier = 'DIRECT';
    } else if (person.email) {
      contactMethod = 'EMAIL';
      reachabilityTier = 'DIRECT';
    }

    await prisma.personEvent.create({
      data: {
        personId: person.id,
        eventId: event.id,
        teamId: team.id,
        role: person.role,
        reachabilityTier,
        contactMethod,
      },
    });
    membershipCount++;
  }
  console.log(`✓ Created ${membershipCount} memberships`);

  // ============================================
  // DROP-OFF REFERENCE
  // ============================================
  const dropOff = {
    eve: {
      at: makeNzdtChristmasDate('2026-12-24', '17:00'),
      location: "Rob's Kitchen",
      note: '5pm Christmas Eve',
    },
    day: {
      at: makeNzdtChristmasDate('2026-12-25', '12:00'),
      location: 'Main BBQ Area',
      note: '12 noon Christmas Day',
    },
    morning: {
      at: makeNzdtChristmasDate('2026-12-25', '09:00'),
      location: 'Kitchen',
      note: '9am Christmas Day',
    },
    box: {
      at: makeNzdtChristmasDate('2026-12-26', '12:00'),
      location: 'BBQ Area',
      note: '12 noon Boxing Day',
    },
    setup: {
      at: makeNzdtChristmasDate('2026-12-25', '10:00'),
      location: 'Backyard',
      note: '10am Christmas Day',
    },
  };

  // ============================================
  // STEP 6: CREATE ITEMS (56 total)
  // ============================================
  console.log('Creating items...');

  const itemsData = [
    // STARTERS & NIBBLES (8 items)
    {
      teamName: 'Starters & Nibbles',
      name: 'Whitebait fritters',
      quantity: '2 plates',
      assigneeName: 'Kate Turner',
      dayName: 'Christmas Eve',
      ...dropOff.eve,
      critical: false,
    },
    {
      teamName: 'Starters & Nibbles',
      name: 'Cheese platter (Kapiti cheese)',
      quantity: 'Large platter',
      assigneeName: 'Lily Henderson',
      dayName: 'Christmas Eve',
      ...dropOff.eve,
      critical: false,
    },
    {
      teamName: 'Starters & Nibbles',
      name: 'Crackers and dips',
      quantity: 'Plenty',
      assigneeName: 'Ethan Nguyen',
      dayName: 'Christmas Eve',
      ...dropOff.eve,
      critical: false,
    },
    {
      teamName: 'Starters & Nibbles',
      name: 'Prawn cocktail',
      quantity: '2 bowls',
      assigneeName: null,
      dayName: 'Christmas Eve',
      ...dropOff.eve,
      critical: false,
      notes: 'UNASSIGNED',
    },
    {
      teamName: 'Starters & Nibbles',
      name: 'Bluff oysters',
      quantity: '2 dozen',
      assigneeName: 'Oscar Turner',
      dayName: 'Christmas Eve',
      ...dropOff.eve,
      critical: false,
    },
    {
      teamName: 'Starters & Nibbles',
      name: 'Veggie sticks and hummus',
      quantity: 'Large platter',
      assigneeName: 'Arjun Patel-Henderson',
      glutenFree: true,
      dairyFree: true,
      vegetarian: true,
      dayName: 'Christmas Eve',
      ...dropOff.eve,
      critical: false,
    },
    {
      teamName: 'Starters & Nibbles',
      name: 'Salami and olives',
      quantity: '2 plates',
      assigneeName: 'Mia Nguyen',
      dayName: 'Christmas Eve',
      ...dropOff.eve,
      critical: false,
    },
    {
      teamName: 'Starters & Nibbles',
      name: 'Chips and nuts',
      quantity: 'Plenty',
      assigneeName: "Maeve O'Brien",
      dayName: 'Christmas Eve',
      ...dropOff.eve,
      critical: false,
    },

    // MAINS (10 items)
    {
      teamName: 'Mains',
      name: 'Whole glazed ham',
      quantity: '1 large (8kg+)',
      assigneeName: 'Sarah Henderson',
      glutenFree: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: true,
    },
    {
      teamName: 'Mains',
      name: 'BBQ lamb leg',
      quantity: '2 legs',
      assigneeName: 'James Turner',
      glutenFree: true,
      dairyFree: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: true,
    },
    {
      teamName: 'Mains',
      name: 'Grilled snapper',
      quantity: '3 large fish',
      assigneeName: null,
      glutenFree: true,
      dairyFree: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: true,
      notes: 'UNASSIGNED — CRITICAL',
    },
    {
      teamName: 'Mains',
      name: 'BBQ chicken drumsticks',
      quantity: '30 pieces',
      assigneeName: 'Mike Henderson',
      glutenFree: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
    },
    {
      teamName: 'Mains',
      name: 'Vegetarian nut roast',
      quantity: '1 large',
      assigneeName: null,
      glutenFree: false,
      vegetarian: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: true,
      notes: 'UNASSIGNED — CRITICAL for vegetarians',
    },
    {
      teamName: 'Mains',
      name: 'Sausages for BBQ',
      quantity: '3kg',
      assigneeName: 'Jenny Henderson',
      glutenFree: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
    },
    {
      teamName: 'Mains',
      name: 'Bacon for breakfast',
      quantity: '2kg',
      assigneeName: 'Raj Patel-Henderson',
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: false,
    },
    {
      teamName: 'Mains',
      name: 'Grilled halloumi',
      quantity: '4 blocks',
      assigneeName: 'Chloe Nguyen',
      glutenFree: true,
      vegetarian: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
    },
    {
      teamName: 'Mains',
      name: 'Salmon fillets',
      quantity: '2kg',
      assigneeName: null,
      glutenFree: true,
      dayName: 'Christmas Eve',
      ...dropOff.eve,
      critical: false,
      notes: 'UNASSIGNED',
    },
    {
      teamName: 'Mains',
      name: 'Beef sausages',
      quantity: '2kg',
      assigneeName: "Connor O'Brien",
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
    },

    // SALADS & SIDES (8 items)
    {
      teamName: 'Salads & Sides',
      name: 'Coleslaw',
      quantity: 'Large bowl',
      assigneeName: 'Priya Patel-Henderson',
      glutenFree: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
    },
    {
      teamName: 'Salads & Sides',
      name: 'Potato salad',
      quantity: 'Large bowl',
      assigneeName: 'Charlotte Turner',
      glutenFree: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
    },
    {
      teamName: 'Salads & Sides',
      name: 'Green salad',
      quantity: 'Large bowl',
      assigneeName: 'Sophie Henderson',
      glutenFree: true,
      dairyFree: true,
      vegetarian: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
    },
    {
      teamName: 'Salads & Sides',
      name: 'Roasted kumara salad',
      quantity: 'Large bowl',
      assigneeName: 'Nina Patel-Henderson',
      glutenFree: true,
      dairyFree: true,
      vegetarian: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
    },
    {
      teamName: 'Salads & Sides',
      name: 'Pasta salad',
      quantity: 'Large bowl',
      assigneeName: null,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
      notes: 'UNASSIGNED',
    },
    {
      teamName: 'Salads & Sides',
      name: 'Tomato and basil salad',
      quantity: 'Large bowl',
      assigneeName: 'Grace Nguyen',
      glutenFree: true,
      dairyFree: true,
      vegetarian: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
    },
    {
      teamName: 'Salads & Sides',
      name: 'Corn on the cob',
      quantity: '20 cobs',
      assigneeName: "Siobhan O'Brien",
      glutenFree: true,
      dairyFree: true,
      vegetarian: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
    },
    {
      teamName: 'Salads & Sides',
      name: 'Bread rolls',
      quantity: '50 rolls',
      assigneeName: null,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
      notes: 'UNASSIGNED',
    },

    // DESSERTS (7 items)
    {
      teamName: 'Desserts',
      name: 'Pavlova',
      quantity: '2 large',
      assigneeName: "Finn O'Brien",
      glutenFree: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: true,
    },
    {
      teamName: 'Desserts',
      name: 'Trifle',
      quantity: '1 large bowl',
      assigneeName: 'Emma Henderson',
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
    },
    {
      teamName: 'Desserts',
      name: 'Fruit salad',
      quantity: '2 large bowls',
      assigneeName: 'Michelle Nguyen',
      glutenFree: true,
      dairyFree: true,
      vegetarian: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
    },
    {
      teamName: 'Desserts',
      name: 'Christmas cake',
      quantity: '1',
      assigneeName: 'Olivia Henderson',
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
    },
    {
      teamName: 'Desserts',
      name: 'Feijoa crumble',
      quantity: '2 dishes',
      assigneeName: null,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
      notes: 'UNASSIGNED',
    },
    {
      teamName: 'Desserts',
      name: "Whittaker's chocolate",
      quantity: '10 blocks',
      assigneeName: 'Isabella Turner',
      glutenFree: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
    },
    {
      teamName: 'Desserts',
      name: 'Ice cream',
      quantity: '4 tubs',
      assigneeName: 'Zara Patel-Henderson',
      glutenFree: true,
      dayName: 'Christmas Day',
      ...dropOff.day,
      critical: false,
    },

    // DRINKS (6 items)
    {
      teamName: 'Drinks',
      name: 'Ice',
      quantity: '4 large bags',
      assigneeName: 'David Nguyen',
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: true,
    },
    {
      teamName: 'Drinks',
      name: 'Beer (DB Export, Speights)',
      quantity: '2 crates',
      assigneeName: 'Harry Turner',
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: false,
    },
    {
      teamName: 'Drinks',
      name: 'Wine (Sauvignon Blanc, Pinot Noir)',
      quantity: '12 bottles',
      assigneeName: 'Liam Patel-Henderson',
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: false,
    },
    {
      teamName: 'Drinks',
      name: 'L&P and soft drinks',
      quantity: '4 large bottles',
      assigneeName: "Aoife O'Brien",
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: false,
    },
    {
      teamName: 'Drinks',
      name: 'Juice boxes for kids',
      quantity: '24 pack',
      assigneeName: null,
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: false,
      notes: 'UNASSIGNED',
    },
    {
      teamName: 'Drinks',
      name: 'Water bottles',
      quantity: '24 pack',
      assigneeName: null,
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: false,
      notes: 'UNASSIGNED',
    },

    // KIDS ZONE (5 items)
    {
      teamName: 'Kids Zone',
      name: 'Sunscreen SPF 50+',
      quantity: '3 bottles',
      assigneeName: 'Tom Henderson',
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: true,
    },
    {
      teamName: 'Kids Zone',
      name: 'Beach toys and buckets',
      quantity: '1 bag',
      assigneeName: 'Amelia Turner',
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: false,
    },
    {
      teamName: 'Kids Zone',
      name: 'Cricket set',
      quantity: '1',
      assigneeName: 'Maya Patel-Henderson',
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: false,
    },
    {
      teamName: 'Kids Zone',
      name: 'Inflatable pool',
      quantity: '1',
      assigneeName: null,
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: false,
      notes: 'UNASSIGNED',
    },
    {
      teamName: 'Kids Zone',
      name: 'Kids table and chairs',
      quantity: '1 set',
      assigneeName: null,
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: false,
      notes: 'UNASSIGNED',
    },

    // SETUP & EQUIPMENT (7 items)
    {
      teamName: 'Setup & Equipment',
      name: 'Trestle tables',
      quantity: '4 tables',
      assigneeName: 'Rob Henderson',
      dayName: 'Christmas Day',
      ...dropOff.setup,
      critical: true,
    },
    {
      teamName: 'Setup & Equipment',
      name: 'Chairs',
      quantity: '45 chairs',
      assigneeName: null,
      dayName: 'Christmas Day',
      ...dropOff.setup,
      critical: true,
      notes: 'UNASSIGNED — CRITICAL',
    },
    {
      teamName: 'Setup & Equipment',
      name: 'Chilly bins',
      quantity: '4 large',
      assigneeName: 'Rob Henderson',
      dayName: 'Christmas Day',
      ...dropOff.setup,
      critical: false,
    },
    {
      teamName: 'Setup & Equipment',
      name: 'BBQ (gas)',
      quantity: '1',
      assigneeName: 'Rob Henderson',
      dayName: 'Christmas Day',
      ...dropOff.setup,
      critical: true,
      notes: 'Rob bringing his',
    },
    {
      teamName: 'Setup & Equipment',
      name: 'Speaker and playlist',
      quantity: '1',
      assigneeName: null,
      dayName: 'Christmas Day',
      ...dropOff.setup,
      critical: false,
      notes: 'UNASSIGNED',
    },
    {
      teamName: 'Setup & Equipment',
      name: 'Gazebo/marquee',
      quantity: '2',
      assigneeName: null,
      dayName: 'Christmas Day',
      ...dropOff.setup,
      critical: false,
      notes: 'UNASSIGNED',
    },
    {
      teamName: 'Setup & Equipment',
      name: 'Serving platters and utensils',
      quantity: 'Complete set',
      assigneeName: 'Rob Henderson',
      dayName: 'Christmas Day',
      ...dropOff.setup,
      critical: false,
    },

    // CLEANUP (5 items)
    {
      teamName: 'Cleanup',
      name: 'Rubbish bags',
      quantity: '2 rolls',
      assigneeName: 'Jake Henderson',
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: false,
    },
    {
      teamName: 'Cleanup',
      name: 'Recycling bins',
      quantity: '3 bins',
      assigneeName: 'Lucas Nguyen',
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: false,
    },
    {
      teamName: 'Cleanup',
      name: 'Dish soap and sponges',
      quantity: 'Plenty',
      assigneeName: 'Jack Turner',
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: false,
    },
    {
      teamName: 'Cleanup',
      name: 'Ziplock bags for leftovers',
      quantity: '2 boxes',
      assigneeName: 'Aarav Patel-Henderson',
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: false,
    },
    {
      teamName: 'Cleanup',
      name: 'Tea towels',
      quantity: '10',
      assigneeName: "Declan O'Brien",
      dayName: 'Christmas Day',
      ...dropOff.morning,
      critical: false,
    },
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
        glutenFree: (itemData as any).glutenFree || false,
        dairyFree: (itemData as any).dairyFree || false,
        vegetarian: (itemData as any).vegetarian || false,
        notes: 'notes' in itemData ? (itemData as any).notes : undefined,
        dropOffAt: 'at' in itemData ? (itemData as any).at : null,
        dropOffLocation: 'location' in itemData ? (itemData as any).location : null,
        dropOffNote: 'note' in itemData ? (itemData as any).note : null,
        teamId: team.id,
        dayId: day?.id || null,
        status: 'UNASSIGNED',
      },
    });

    createdItems.push({
      ...item,
      assigneeName: (itemData as any).assigneeName,
      teamName: itemData.teamName,
    });
  }

  console.log(`✓ Created ${createdItems.length} items`);

  // ============================================
  // STEP 7: CREATE ASSIGNMENTS
  // ============================================
  console.log('Creating assignments...');

  // Assignment response distribution:
  // 60% ACCEPTED, 20% PENDING, 10% DECLINED, 10% no assignment (already unassigned)
  const assignedItems = createdItems.filter((item) => item.assigneeName);
  const totalAssigned = assignedItems.length;
  const acceptedCount = Math.floor(totalAssigned * 0.6);
  const pendingCount = Math.floor(totalAssigned * 0.2);
  const declinedCount = Math.floor(totalAssigned * 0.1);

  let assignedCount = 0;
  let skippedCount = 0;
  let assignmentIndex = 0;

  for (const item of createdItems) {
    if (!item.assigneeName) {
      continue;
    }

    const person = personByName.get(item.assigneeName);
    if (!person) {
      console.warn(
        `SEED WARNING: Unknown person "${item.assigneeName}" for item "${item.name}" — leaving unassigned`
      );
      skippedCount++;
      continue;
    }

    // Verify team match
    const personEvent = await prisma.personEvent.findFirst({
      where: { personId: person.id, eventId: event.id },
    });

    const team = teamByName.get(item.teamName);
    if (personEvent?.teamId !== team.id) {
      console.warn(
        `SEED WARNING: "${item.assigneeName}" is not in team "${item.teamName}" — leaving item "${item.name}" unassigned`
      );
      skippedCount++;
      continue;
    }

    // Determine assignment response
    let response: 'ACCEPTED' | 'PENDING' | 'DECLINED' = 'ACCEPTED';
    if (assignmentIndex >= acceptedCount && assignmentIndex < acceptedCount + pendingCount) {
      response = 'PENDING';
    } else if (
      assignmentIndex >= acceptedCount + pendingCount &&
      assignmentIndex < acceptedCount + pendingCount + declinedCount
    ) {
      response = 'DECLINED';
    }

    // Create assignment
    await prisma.assignment.create({
      data: {
        itemId: item.id,
        personId: person.id,
        response,
      },
    });

    // Update item status to ASSIGNED
    await prisma.item.update({
      where: { id: item.id },
      data: { status: 'ASSIGNED' },
    });

    assignedCount++;
    assignmentIndex++;
  }

  console.log(`✓ Created ${assignedCount} assignments`);
  console.log(`  - ${acceptedCount} ACCEPTED, ${pendingCount} PENDING, ${declinedCount} DECLINED`);
  if (skippedCount > 0) {
    console.log(`⚠ Skipped ${skippedCount} assignments due to team mismatches`);
  }

  // ============================================
  // STEP 8: CREATE ACCESS TOKENS
  // ============================================
  console.log('Creating access tokens...');
  let tokenCount = 0;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);

  // HOST token for Sarah
  await prisma.accessToken.create({
    data: {
      token: generateToken(),
      scope: 'HOST',
      personId: sarah.id,
      eventId: event.id,
      teamId: null,
      expiresAt,
    },
  });
  tokenCount++;

  // COORDINATOR tokens
  for (const [teamName, team] of teamByName) {
    const coordinator = personByName.get(
      teamsData.find((t) => t.name === teamName)!.coordinatorName
    );
    if (coordinator) {
      await prisma.accessToken.create({
        data: {
          token: generateToken(),
          scope: 'COORDINATOR',
          personId: coordinator.id,
          eventId: event.id,
          teamId: team.id,
          expiresAt,
        },
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
        },
      });
      tokenCount++;
    }
  }

  console.log(`✓ Created ${tokenCount} access tokens`);

  // ============================================
  // STEP 9: CREATE INVITE EVENTS
  // ============================================
  console.log('Creating invite events...');

  // Create invite send confirmation
  await prisma.inviteEvent.create({
    data: {
      eventId: event.id,
      personId: sarah.id,
      type: 'INVITE_SEND_CONFIRMED',
      metadata: { timestamp: new Date().toISOString() },
    },
  });

  // Create some link opened events
  const linkOpenedPeople = [
    'Kate Turner',
    'David Nguyen',
    'Priya Patel-Henderson',
    "Finn O'Brien",
    'Rob Henderson',
  ];
  for (const personName of linkOpenedPeople) {
    const person = personByName.get(personName);
    if (person) {
      await prisma.inviteEvent.create({
        data: {
          eventId: event.id,
          personId: person.id,
          type: 'LINK_OPENED',
          metadata: { timestamp: new Date().toISOString() },
        },
      });
    }
  }

  // Create some response submitted events
  const respondedPeople = ['Kate Turner', 'David Nguyen', 'Priya Patel-Henderson'];
  for (const personName of respondedPeople) {
    const person = personByName.get(personName);
    if (person) {
      await prisma.inviteEvent.create({
        data: {
          eventId: event.id,
          personId: person.id,
          type: 'RESPONSE_SUBMITTED',
          metadata: { timestamp: new Date().toISOString() },
        },
      });
    }
  }

  console.log(`✓ Created ${1 + linkOpenedPeople.length + respondedPeople.length} invite events`);

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n🎉 Seed complete!\n');
  console.log('Summary:');
  console.log(`- Event: ${event.name}`);
  console.log(`- Venue: ${event.venueName}`);
  console.log(`- Guests: ${event.guestCount}`);
  console.log(`- People: ${personByName.size}`);
  console.log(`- Teams: ${teamByName.size}`);
  console.log(`- Days: ${dayByName.size}`);
  console.log(`- Items: ${createdItems.length}`);
  console.log(`- Assigned: ${assignedCount}`);
  console.log(`- Unassigned: ${createdItems.length - assignedCount}`);
  console.log(`- Access tokens: ${tokenCount}`);

  // Count critical gaps
  const criticalGaps = await prisma.item.count({
    where: {
      team: { eventId: event.id },
      critical: true,
      status: 'UNASSIGNED',
    },
  });
  console.log(`- Critical gaps: ${criticalGaps}`);

  // Dietary summary
  console.log('\nDietary Requirements:');
  console.log(`- Vegetarian: ${event.dietaryVegetarian}`);
  console.log(`- Vegan: ${event.dietaryVegan}`);
  console.log(`- Gluten-free: ${event.dietaryGlutenFree}`);
  console.log(`- Dairy-free: ${event.dietaryDairyFree}`);

  // Fetch all tokens for display
  const tokens = await prisma.accessToken.findMany({
    include: {
      person: true,
    },
    orderBy: {
      scope: 'asc',
    },
  });

  console.log('\n🔑 Magic Link Tokens:\n');
  console.log('HOST:');
  const hostTokens = tokens.filter((t) => t.scope === 'HOST');
  for (const token of hostTokens) {
    console.log(`  ${token.person.name}: /h/${token.token}`);
  }

  console.log('\nCOORDINATORS:');
  const coordTokens = tokens.filter((t) => t.scope === 'COORDINATOR');
  for (const token of coordTokens) {
    console.log(`  ${token.person.name}: /c/${token.token}`);
  }

  console.log('\nPARTICIPANTS (sample):');
  const participantTokens = tokens.filter((t) => t.scope === 'PARTICIPANT');
  for (const token of participantTokens.slice(0, 8)) {
    console.log(`  ${token.person.name}: /p/${token.token}`);
  }
  console.log(`  ... and ${participantTokens.length - 8} more participants`);

  console.log('\n✅ Demo ready at /demo');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
