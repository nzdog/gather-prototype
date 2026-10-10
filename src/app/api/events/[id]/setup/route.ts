import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { validateDietaryData, type DietaryData } from '@/lib/dietary';
import { CONFIG_EVENT_TYPES } from '@/lib/ai/config-loader';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { bringBackPlan, putAwayPlan, waitingPlanRevisionId } from '@/lib/workflow';

interface SectionData {
  items: string[];
  stillDeciding: boolean;
}

interface SetupCleanupData {
  setupCrew: boolean;
  cleanupCrew: boolean;
  kidsOnDishes: boolean;
  stillDeciding: boolean;
}

interface OptionTreeLevelSelection {
  options: string[];
  freeText: string;
}

type OptionTreeSelections = Record<string, OptionTreeLevelSelection>;

interface ExtendedCategoryEntry {
  selections?: OptionTreeSelections;
  stillDeciding?: boolean;
}

type ExtendedCategoriesData = Record<string, ExtendedCategoryEntry>;

interface OtherJobsAccordionData {
  freeText: string;
  stillDeciding: boolean;
}

interface EventSetupBody {
  eventType?: string;
  eventTypeOther?: string;
  mainsData?: SectionData;
  sidesData?: SectionData;
  dessertsData?: SectionData;
  drinksData?: SectionData;
  setupCleanupData?: SetupCleanupData;
  dietaryData?: DietaryData;
  otherNotes?: string;
  extendedCategoriesData?: ExtendedCategoriesData;
  setUpData?: OtherJobsAccordionData;
  cleanUpData?: OtherJobsAccordionData;
  otherJobsOtherData?: OtherJobsAccordionData;
  /**
   * [[GTC-355]] Q4 — "Plan looks good →" sends `true`. The route stamps
   * `EventSetup.planApprovedAt` the first time and keeps it after, so the entry rule opens
   * an approved plan at Moment 3. Only `true` is accepted; there is no un-approve.
   */
  planApproved?: unknown;
  /**
   * [[GTC-374]] — invites only, either way until the press. The host's alone (plan Q4: only the host
   * holds and sends), refused after the press (it is fixed then). [[GTC-375]]: `true` on an event
   * with a plan puts the plan away, and `false` brings a put-away plan back, each in one transaction
   * with the flag (plan Q5).
   */
  invitesOnly?: unknown;
}

const OTHER_JOBS_FIELDS = ['setUpData', 'cleanUpData', 'otherJobsOtherData'] as const;
type OtherJobsField = (typeof OTHER_JOBS_FIELDS)[number];

function validateOtherJobsField(field: OtherJobsField, value: unknown): NextResponse | null {
  if (value === null) return null;
  if (!isPlainObject(value)) {
    return NextResponse.json(
      {
        error: `${field} must be an object with shape { freeText: string, stillDeciding: boolean }`,
      },
      { status: 400 }
    );
  }
  const allowedKeys = new Set(['freeText', 'stillDeciding']);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return NextResponse.json(
        { error: `${field} contains unexpected key "${key}". Allowed: freeText, stillDeciding` },
        { status: 400 }
      );
    }
  }
  if ('freeText' in value && typeof value.freeText !== 'string') {
    return NextResponse.json({ error: `${field}.freeText must be a string` }, { status: 400 });
  }
  if ('stillDeciding' in value && typeof value.stillDeciding !== 'boolean') {
    return NextResponse.json(
      { error: `${field}.stillDeciding must be a boolean` },
      { status: 400 }
    );
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const setup = await prisma.eventSetup.findUnique({
      where: { eventId },
    });
    // [[GTC-375]] (W2): whether a plan is put away, waiting for "Let’s do this →" to bring it back.
    const planPutAway = setup?.invitesOnly
      ? (await waitingPlanRevisionId(prisma, eventId)) !== null
      : false;

    return NextResponse.json({ setup: setup ?? null, planPutAway });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch event setup',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const body: EventSetupBody = await request.json();

    // Validate eventType
    if (body.eventType !== undefined) {
      // GTC-151: validate against CONFIG_EVENT_TYPES — the same source the
      // modal's chips render from — so client and server can never diverge.
      // (The old hardcoded legacy list rejected 9 of the 11 pickable types.)
      if (!(CONFIG_EVENT_TYPES as readonly string[]).includes(body.eventType)) {
        return NextResponse.json(
          { error: 'Invalid eventType', allowed: CONFIG_EVENT_TYPES },
          { status: 400 }
        );
      }

      if (body.eventType === 'Other' && !body.eventTypeOther?.trim()) {
        return NextResponse.json(
          { error: 'eventTypeOther is required when eventType is "Other"' },
          { status: 400 }
        );
      }
    }

    // Validate dietaryData if provided — three-state shape with coherence
    // rules (GTC-150): status must match content; legacy statusless writes
    // are still accepted and inferred on read.
    if (body.dietaryData !== undefined) {
      const dietaryError = validateDietaryData(body.dietaryData);
      if (dietaryError) {
        return NextResponse.json({ error: dietaryError }, { status: 400 });
      }
    }

    // Validate extendedCategoriesData shape if provided. Lightweight gate: must be a
    // plain object whose values are plain objects. Per-level selection shape is trusted
    // to the modal — mismatched data round-trips harmlessly through Prisma's Json column.
    if (body.extendedCategoriesData !== undefined) {
      if (!isPlainObject(body.extendedCategoriesData)) {
        return NextResponse.json(
          { error: 'extendedCategoriesData must be an object keyed by category' },
          { status: 400 }
        );
      }
      for (const [key, entry] of Object.entries(body.extendedCategoriesData)) {
        if (!isPlainObject(entry)) {
          return NextResponse.json(
            { error: `extendedCategoriesData.${key} must be an object` },
            { status: 400 }
          );
        }
      }
    }

    // Validate the three Other-jobs free-text fields if present
    for (const field of OTHER_JOBS_FIELDS) {
      if (field in body) {
        const err = validateOtherJobsField(field, body[field] as unknown);
        if (err) return err;
      }
    }

    if ('planApproved' in body && body.planApproved !== true) {
      return NextResponse.json({ error: 'planApproved must be true' }, { status: 400 });
    }

    // [[GTC-374]] — invites only: the host's, and before the press.
    if ('invitesOnly' in body) {
      if (typeof body.invitesOnly !== 'boolean') {
        return NextResponse.json({ error: 'invitesOnly must be a boolean' }, { status: 400 });
      }
      if (auth.role !== 'HOST') {
        return NextResponse.json(
          { error: 'Only the host can choose invites only' },
          { status: 403 }
        );
      }
      if (event.sentAt) {
        return NextResponse.json(
          { error: 'The invitations have gone, so invites only is fixed' },
          { status: 409 }
        );
      }
    }

    // Build update data — only include fields present in the request body
    const data: Record<string, unknown> = {};
    if (body.planApproved === true) {
      const existing = await prisma.eventSetup.findUnique({
        where: { eventId },
        select: { planApprovedAt: true },
      });
      data.planApprovedAt = existing?.planApprovedAt ?? new Date();
    }
    if ('eventType' in body) data.eventType = body.eventType;
    if ('eventTypeOther' in body) data.eventTypeOther = body.eventTypeOther;
    if ('mainsData' in body) data.mainsData = body.mainsData;
    if ('sidesData' in body) data.sidesData = body.sidesData;
    if ('dessertsData' in body) data.dessertsData = body.dessertsData;
    if ('drinksData' in body) data.drinksData = body.drinksData;
    if ('setupCleanupData' in body) data.setupCleanupData = body.setupCleanupData;
    if ('dietaryData' in body) data.dietaryData = body.dietaryData;
    if ('otherNotes' in body) data.otherNotes = body.otherNotes;
    if ('extendedCategoriesData' in body) data.extendedCategoriesData = body.extendedCategoriesData;
    if ('setUpData' in body) data.setUpData = body.setUpData;
    if ('cleanUpData' in body) data.cleanUpData = body.cleanUpData;
    if ('otherJobsOtherData' in body) data.otherJobsOtherData = body.otherJobsOtherData;
    if ('invitesOnly' in body) data.invitesOnly = body.invitesOnly;

    const upsert = { where: { eventId }, create: { eventId, ...data }, update: data };

    if (!('invitesOnly' in body)) {
      const setup = await prisma.eventSetup.upsert(upsert);
      return NextResponse.json({ setup });
    }

    /*
     * [[GTC-375]] — the plan put away with the flag set, or brought back with it cleared, in one
     * transaction, so neither can half-happen. The revision and its audit entry name the acting
     * Person (AuditEntry.actorId references Person, C10). No AccessToken is written (plan Q10).
     */
    const actor = await ledgerActorForUser(auth.user, auth.role);
    if (!actor.id) {
      // An authenticated host always resolves to a Person; the guard narrows the type.
      return NextResponse.json({ error: 'Could not resolve acting person' }, { status: 500 });
    }
    const actorId = actor.id;
    const result = await prisma.$transaction(
      async (tx) => {
        const moved =
          body.invitesOnly === true
            ? { putAway: await putAwayPlan(tx, eventId, actorId) }
            : await bringBackPlan(tx, eventId, actorId);
        return { setup: await tx.eventSetup.upsert(upsert), ...moved };
      },
      { timeout: 30000 }
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to save event setup',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
