import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { callClaudeForJSON } from '@/lib/ai/claude';
import { MAX_TOKENS_SECTION_GENERATION } from '@/lib/ai/token-limits';
import {
  buildSectionPrompt,
  VALID_MOMENT2_SECTIONS,
  type Moment2Section,
  type OptionTreeSelections,
} from '@/lib/ai/prompts';

const AI_CALL_LIMIT = 20;

interface GeneratedItem {
  name: string;
  quantity: number;
  unit: string;
  servingSize: string;
  notes?: string;
}

interface SectionInput {
  items?: Array<{ name: string; included: boolean }>;
  stillDeciding?: boolean;
  setupCrew?: boolean;
  cleanupCrew?: boolean;
  kidsOnDishes?: boolean;
  requirements?: string[];
  other?: string;
  // GTC-133: option-tree selections from the new modal path
  selections?: OptionTreeSelections;
}

interface RequestBody {
  section: Moment2Section;
  eventType: string;
  eventTypeOther?: string;
  sectionData: SectionInput;
  householdData: {
    totalAdults: number;
    totalKids: number;
    dietaryRequirements: string[];
    kidsWithJobs: string[];
  };
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // AI call cap check
    if ((event.aiCallsUsed ?? 0) >= AI_CALL_LIMIT) {
      return NextResponse.json({ error: 'AI call limit reached for this event' }, { status: 429 });
    }

    const body: RequestBody = await request.json();

    // Validate section
    if (!VALID_MOMENT2_SECTIONS.includes(body.section)) {
      return NextResponse.json(
        { error: 'Invalid section', allowed: VALID_MOMENT2_SECTIONS },
        { status: 400 }
      );
    }

    // GTC-137: dietary is a pure input — refuse generation requests for it.
    // Dietary requirements are now threaded into food section prompts as a
    // generation constraint instead.
    if (body.section === 'dietary') {
      return NextResponse.json(
        { error: 'Dietary is an input-only section; no items are generated for it (GTC-137)' },
        { status: 400 }
      );
    }

    // Skip if still deciding
    if (body.sectionData?.stillDeciding) {
      return NextResponse.json({ items: [], stored: false });
    }

    // Build and execute AI call
    const { system, user } = buildSectionPrompt(
      body.section,
      body.eventType,
      body.sectionData,
      body.householdData
    );

    const result = await callClaudeForJSON<{ items: GeneratedItem[] }>(system, user, {
      maxTokens: MAX_TOKENS_SECTION_GENERATION,
      temperature: 0.8,
      callSiteLabel: `generate-section:${body.section}`,
    });

    const items = result.items ?? [];

    // Store result in EventSetup.generatedData
    const setup = await prisma.eventSetup.findUnique({
      where: { eventId },
    });

    const existingData =
      setup?.generatedData &&
      typeof setup.generatedData === 'object' &&
      !Array.isArray(setup.generatedData)
        ? (setup.generatedData as Record<string, unknown>)
        : {};

    const updatedData = JSON.parse(JSON.stringify({ ...existingData, [body.section]: items }));

    await prisma.eventSetup.upsert({
      where: { eventId },
      create: {
        eventId,
        generatedData: updatedData,
      },
      update: {
        generatedData: updatedData,
      },
    });

    // Increment AI call counter
    await prisma.event.update({
      where: { id: eventId },
      data: { aiCallsUsed: { increment: 1 } },
    });

    return NextResponse.json({ items, stored: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate section',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
