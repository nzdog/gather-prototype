/**
 * GTC-127 Phase 3 — measure actual prompt sizes for the Kate test event.
 *
 * Loads the event, its EventSetup, and households from the DB; reconstructs
 * the exact arguments each Moment 2 AI call uses; then builds the four
 * prompts and reports char length + approximate tokens (chars / 4).
 *
 * Run: `npx tsx tests/measure-moment2-prompts.ts [eventId]`
 * Default eventId is Kate's: 909a2d6c-0cab-46a5-a988-861d3ba6b7bc
 */

import { PrismaClient } from '@prisma/client';
import { buildSectionPrompt } from '../src/app/api/events/[id]/generate-section/route';
import {
  buildGapPrompt,
  buildDietaryCoveragePrompt,
  buildThingsToConsiderPrompt,
} from '../src/app/api/events/[id]/finalize-plan/route';
import {
  MAX_TOKENS_SECTION_GENERATION,
  MAX_TOKENS_GAP_FILL,
  MAX_TOKENS_DIETARY_COVERAGE,
  MAX_TOKENS_CONSIDERATIONS,
} from '../src/lib/ai/token-limits';

const prisma = new PrismaClient();

const KATE_EVENT_ID = '909a2d6c-0cab-46a5-a988-861d3ba6b7bc';

type GeneratedItem = {
  name: string;
  quantity: number;
  unit: string;
  servingSize: string;
  notes?: string;
  dietaryTags?: string[];
};

const approxTokens = (s: string) => Math.ceil(s.length / 4);

const fmtRow = (label: string, systemChars: number, userChars: number, cap: number) => {
  const total = systemChars + userChars;
  const tokens = approxTokens(label) + approxTokens(' '.repeat(total));
  const inputTokens = Math.ceil((systemChars + userChars) / 4);
  const headroom = Math.round((1 - inputTokens / cap) * 100);
  return [
    label.padEnd(30),
    `sys ${String(systemChars).padStart(4)}c`,
    `usr ${String(userChars).padStart(5)}c`,
    `in  ${String(inputTokens).padStart(4)}t`,
    `cap ${String(cap).padStart(5)}t`,
    `headroom ${String(headroom).padStart(3)}%`,
  ].join('  ');
};

(async () => {
  const eventId = process.argv[2] || KATE_EVENT_ID;

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    // eslint-disable-next-line no-console
    console.error(`Event ${eventId} not found`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const setup = await prisma.eventSetup.findUnique({ where: { eventId } });
  const households = await prisma.household.findMany({
    where: { eventId },
    include: { members: true },
  });

  let totalAdults = 0;
  let totalKids = 0;
  for (const h of households) {
    for (const m of h.members) {
      if (m.householdRole === 'CHILD') totalKids++;
      else totalAdults++;
    }
    if (typeof (h as Record<string, unknown>).littleCount === 'number') {
      totalKids += (h as Record<string, unknown>).littleCount as number;
    }
  }
  if (totalAdults === 0 && totalKids === 0) {
    totalAdults = event.guestCount ?? 10;
  }

  const eventType = setup?.eventType ?? 'Other';
  const dietaryData = setup?.dietaryData as { requirements?: string[]; other?: string } | null;
  const dietaryRequirements = dietaryData?.requirements ?? [];

  const householdData = {
    totalAdults,
    totalKids,
    dietaryRequirements,
    kidsWithJobs: [] as string[],
  };

  const generatedData =
    setup?.generatedData &&
    typeof setup.generatedData === 'object' &&
    !Array.isArray(setup.generatedData)
      ? (setup.generatedData as Record<string, GeneratedItem[]>)
      : {};

  /* eslint-disable no-console */
  console.error('');
  console.error('=== GTC-127 Phase 3 prompt measurements ===');
  console.error(`event:       ${event.name} (${eventId})`);
  console.error(`type:        ${eventType}`);
  console.error(`guests:      ${totalAdults} adults + ${totalKids} kids`);
  console.error(`dietary:     ${dietaryRequirements.join(', ') || 'none'}`);
  console.error(`sections:    ${Object.keys(generatedData).join(', ') || 'none stored'}`);
  console.error('');

  // Section generation (one prompt per food section)
  const sections = ['mains', 'sides', 'desserts', 'drinks', 'setup', 'dietary'] as const;
  for (const section of sections) {
    const sectionData = (() => {
      const key =
        section === 'setup'
          ? 'setupCleanupData'
          : section === 'dietary'
            ? 'dietaryData'
            : `${section}Data`;
      return (setup as Record<string, unknown>)?.[key] ?? {};
    })() as Record<string, unknown>;

    const { system, user } = buildSectionPrompt(
      section,
      eventType,
      sectionData as Parameters<typeof buildSectionPrompt>[2],
      householdData
    );
    console.error(
      fmtRow(`section-gen (${section})`, system.length, user.length, MAX_TOKENS_SECTION_GENERATION)
    );
  }

  // Gap-fill (used when a section had no stored generation)
  const gap = buildGapPrompt('mains', eventType, householdData);
  console.error(
    fmtRow('gap-fill (mains)', gap.system.length, gap.user.length, MAX_TOKENS_GAP_FILL)
  );

  // Dietary coverage — uses everything generatedData currently holds
  const allItems = Object.entries(generatedData).map(([cat, items]) => ({
    category: cat,
    items: items ?? [],
  }));
  const cov = buildDietaryCoveragePrompt(allItems, dietaryRequirements);
  console.error(
    fmtRow('dietary-coverage', cov.system.length, cov.user.length, MAX_TOKENS_DIETARY_COVERAGE)
  );

  // Things to consider
  const consider = buildThingsToConsiderPrompt(eventType, totalAdults + totalKids);
  console.error(
    fmtRow(
      'things-to-consider',
      consider.system.length,
      consider.user.length,
      MAX_TOKENS_CONSIDERATIONS
    )
  );

  console.error('');
  console.error('Headroom = 1 - (input-tokens / cap). The cap applies to OUTPUT');
  console.error('tokens; input tokens are listed here purely to gauge prompt bloat.');
  console.error('Observed OUTPUT sizes (from pre-GTC-127 server logs) sit at');
  console.error('~950-1080 tokens for section-gen and similar for gap-fill.');
  /* eslint-enable no-console */

  await prisma.$disconnect();
})();
