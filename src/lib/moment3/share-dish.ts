import type { Prisma, PrismaClient } from '@prisma/client';
import { recordChange, type LedgerActor, type PendingChange } from '@/lib/ledger';
import { repairItemStatusAfterMutation } from '@/lib/workflow';
import { mayHoldRow, SAME_TEAM_ERROR } from '@/lib/assignment/same-team';
import {
  isDividable,
  roundAmount,
  sumAmounts,
  unitWordOf,
  validShareAmount,
  type ShareAmountLine,
  type SharePreview,
} from '@/lib/moment3/share-split';

/**
 * [[GTC-472]] — SHARING ONE DISH BETWEEN SEVERAL PEOPLE: THE SERVER WORK.
 *
 * "Assign more than one item to several people - eg, both mum and Joanna bring salad", then "I want to
 * divide the dish being shared" (the founder, 22 Nov 2026). Pressing share on a row that has a person
 * makes a COPY of the item, directly under it in its section, gives the copy to the other person, and
 * divides the amount between everyone sharing it. GTC-355 Ruling 2 stands: each row still has ONE
 * person (`Assignment.itemId` is unique), so the send, the nudges, the decide-by clock and the board
 * read it exactly as they read any row. Nothing here sends anything, and none of that code is named.
 *
 * ALL OF IT OR NONE OF IT: the copy, its assignment, every changed amount, the order shifts and the
 * ledger are one transaction. The ledger is written LAST (it takes the event's row lock).
 *
 * HOW ROWS THAT SHARE A DISH ARE RECOGNISED (ruling D1 A, no migration). Nothing on an item says it
 * belongs to a shared dish. The ledger entry that records each copy (CREATE_ITEM) also records
 * `sharedFromItemId` (the row pressed) and `shareRootItemId` (the dish's first row). Finding a dish's
 * rows is looking those entries up, only when sharing. A rename or a move does not break it; a deleted
 * row simply drops out; only rows that CURRENTLY HOLD SOMEONE join a split, so a row whose person was
 * taken off is an ordinary unassigned item again and is left alone. The cost, recorded in the ticket:
 * the app now reads the ledger to decide something, and a plan cloned into another event loses its links.
 *
 * THE OLDER QUANTITY TEXT (`Item.quantity`, which the guest page used to draw). When an amount is
 * divided the older text is cleared on BOTH rows and the clearing is ledgered, so neither row can
 * show a guest the undivided total. When nothing is divided, both rows keep it.
 *
 * `db` is a parameter so a test can hand in a client whose ledger write fails part-way and prove that
 * nothing was kept.
 */

/** A refusal with the status the route answers. */
export class ShareError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Reader = Pick<Prisma.TransactionClient, 'item' | 'assignment' | 'auditEntry' | 'team'>;

export interface ShareParams {
  eventId: string;
  /** The row pressed: the one that already has a person. */
  itemId: string;
  /** Who it is shared with. */
  personId: string;
  actor: LedgerActor;
  /** The role the actor signed in with (HOST, COHOST or COORDINATOR). */
  actorRole: string;
  reason?: string | null;
  /** Her numbers, one line per row of the dish and one for the new row. Unread when nothing divides. */
  amounts?: unknown;
}

export interface ShareResult {
  copyItemId: string;
  copyAssignmentId: string;
  divided: boolean;
  /** Every row of the dish after the share, with its amount (null when the row has none). */
  rows: { itemId: string; personId: string; amount: number | null }[];
  changeSetId: string;
}

type DishRow = Prisma.ItemGetPayload<{
  include: { assignment: { include: { person: { select: { id: true; name: true } } } } };
}>;

interface Loaded {
  pressed: DishRow;
  rootId: string;
  /** The rows that hold someone: the dish's first row first, then in the order they were added. */
  rows: DishRow[];
  preview: SharePreview;
}

/** The dish's first row: the root recorded on this row's own CREATE_ITEM entry, or the row itself. */
async function rootOf(db: Reader, eventId: string, itemId: string): Promise<string> {
  const own = await db.auditEntry.findFirst({
    where: { eventId, actionType: 'CREATE_ITEM', targetType: 'Item', targetId: itemId },
    orderBy: { sequence: 'desc' },
    select: { after: true },
  });
  const root = (own?.after as { shareRootItemId?: unknown } | null)?.shareRootItemId;
  return typeof root === 'string' && root !== '' ? root : itemId;
}

async function load(db: Reader, eventId: string, itemId: string): Promise<Loaded> {
  const pressed = await db.item.findUnique({
    where: { id: itemId },
    include: { assignment: { include: { person: { select: { id: true, name: true } } } } },
  });
  if (!pressed) throw new ShareError(404, 'NOT_FOUND', 'Item not found');
  const team = await db.team.findUnique({
    where: { id: pressed.teamId },
    select: { eventId: true },
  });
  if (!team || team.eventId !== eventId) {
    throw new ShareError(400, 'WRONG_EVENT', 'Item does not belong to this event');
  }
  if (!pressed.assignment) {
    throw new ShareError(400, 'NO_HOLDER', 'Give the dish to someone first');
  }

  const rootId = await rootOf(db, eventId, itemId);
  const links = await db.auditEntry.findMany({
    where: {
      eventId,
      actionType: 'CREATE_ITEM',
      targetType: 'Item',
      after: { path: ['shareRootItemId'], equals: rootId },
    },
    orderBy: { sequence: 'asc' },
    select: { targetId: true },
  });
  const ids = [...new Set([rootId, ...links.map((l) => l.targetId), itemId])];
  const found = await db.item.findMany({
    where: { id: { in: ids }, team: { eventId } },
    include: { assignment: { include: { person: { select: { id: true, name: true } } } } },
  });
  const byId = new Map(found.map((i) => [i.id, i]));
  const rows = ids
    .map((id) => byId.get(id))
    .filter((i): i is DishRow => !!i && i.assignment !== null);

  const sameUnit = rows.every(
    (r) =>
      r.quantityUnit === pressed.quantityUnit && r.quantityUnitCustom === pressed.quantityUnitCustom
  );
  const divided =
    sameUnit &&
    rows.length > 0 &&
    rows.every((r) =>
      isDividable({
        kind: r.kind,
        quantityState: r.quantityState,
        quantityAmount: r.quantityAmount,
        quantityDeferredTo: r.quantityDeferredTo,
      })
    );
  const preview: SharePreview = {
    dishName: pressed.name,
    kind: pressed.kind,
    divided,
    total: divided ? sumAmounts(rows.map((r) => r.quantityAmount as number)) : null,
    unitWord: unitWordOf(pressed),
    rows: rows.map((r) => ({
      itemId: r.id,
      personId: r.assignment!.personId,
      name: r.assignment!.person.name,
      amount: r.quantityAmount,
      response: r.assignment!.response,
    })),
  };
  return { pressed, rootId, rows, preview };
}

/** What the split screen needs for this dish. Reads only; writes nothing. */
export async function readShare(
  db: Reader,
  args: { eventId: string; itemId: string }
): Promise<SharePreview> {
  return (await load(db, args.eventId, args.itemId)).preview;
}

function readLines(raw: unknown): ShareAmountLine[] {
  if (!Array.isArray(raw)) throw new ShareError(400, 'BAD_AMOUNTS', 'The amounts are missing');
  const lines: ShareAmountLine[] = [];
  for (const entry of raw) {
    const e = entry as { itemId?: unknown; before?: unknown; amount?: unknown } | null;
    if (!e || typeof e !== 'object')
      throw new ShareError(400, 'BAD_AMOUNTS', 'Each amount needs a line');
    if (e.itemId !== null && typeof e.itemId !== 'string') {
      throw new ShareError(400, 'BAD_AMOUNTS', 'Each line names a row, or is the new one');
    }
    if (!validShareAmount(e.amount)) {
      throw new ShareError(
        400,
        'BAD_AMOUNTS',
        'Each amount must be above zero, with at most two decimals'
      );
    }
    const before = e.before === null || e.before === undefined ? null : e.before;
    if (before !== null && typeof before !== 'number') {
      throw new ShareError(400, 'BAD_AMOUNTS', 'Each line carries the amount she was shown');
    }
    lines.push({ itemId: e.itemId as string | null, before, amount: e.amount });
  }
  if (lines.filter((l) => l.itemId === null).length !== 1) {
    throw new ShareError(400, 'BAD_AMOUNTS', 'There must be exactly one line for the new row');
  }
  const named = lines.filter((l) => l.itemId !== null).map((l) => l.itemId);
  if (new Set(named).size !== named.length) {
    throw new ShareError(400, 'BAD_AMOUNTS', 'A row appears twice');
  }
  return lines;
}

const STALE_WORDS = 'The dish changed while you were looking. Try again.';

/** The copy's data: everything about the dish except identity, who has it, and where it sits. */
function copyData(
  pressed: DishRow,
  divided: boolean,
  amount: number | null,
  displayOrder: number | null
) {
  const data: Prisma.ItemUncheckedCreateInput = {
    teamId: pressed.teamId,
    name: pressed.name,
    kind: pressed.kind,
    // The older text never carries a total onto a divided row.
    quantity: divided ? null : pressed.quantity,
    description: pressed.description,
    critical: pressed.critical,
    status: 'UNASSIGNED',
    previouslyAssignedTo: null,
    quantityAmount: divided ? amount : pressed.quantityAmount,
    quantityUnit: pressed.quantityUnit,
    quantityUnitCustom: pressed.quantityUnitCustom,
    quantityText: pressed.quantityText,
    // The three quantity fields are the original's: nothing reads label or source, and the Move-on
    // rule must see the copy exactly as it sees the original.
    quantityState: pressed.quantityState,
    quantityLabel: pressed.quantityLabel,
    quantitySource: pressed.quantitySource,
    quantityDerivedFromTemplate: pressed.quantityDerivedFromTemplate,
    placeholderAcknowledged: pressed.placeholderAcknowledged,
    quantityDeferredTo: pressed.quantityDeferredTo,
    criticalReason: pressed.criticalReason,
    criticalSource: pressed.criticalSource,
    criticalOverride: pressed.criticalOverride,
    glutenFree: pressed.glutenFree,
    dairyFree: pressed.dairyFree,
    vegetarian: pressed.vegetarian,
    equipmentLoad: pressed.equipmentLoad,
    durationMinutes: pressed.durationMinutes,
    notes: pressed.notes,
    prepStartTime: pressed.prepStartTime,
    prepEndTime: pressed.prepEndTime,
    serveTime: pressed.serveTime,
    dropOffAt: pressed.dropOffAt,
    // Copied as data only: the per-dish decide-by value. The clock is not touched.
    decideByOffsetHours: pressed.decideByOffsetHours,
    dropOffLocation: pressed.dropOffLocation,
    dropOffNote: pressed.dropOffNote,
    dayId: pressed.dayId,
    // The host made this row by hand: a regenerate never throws it away.
    source: 'MANUAL',
    isProtected: false,
    aiGenerated: false,
    displayOrder,
  };
  if (pressed.dietaryTags !== null) data.dietaryTags = pressed.dietaryTags as Prisma.InputJsonValue;
  if (pressed.equipmentNeeds !== null)
    data.equipmentNeeds = pressed.equipmentNeeds as Prisma.InputJsonValue;
  return data;
}

/**
 * Make the copy, give it to the person, divide the amount, and write the ledger: one transaction.
 * Throws a `ShareError` for every refusal, having written nothing.
 */
export async function shareDish(
  db: Pick<PrismaClient, '$transaction'>,
  p: ShareParams
): Promise<ShareResult> {
  return db.$transaction(
    async (tx) => {
      // Two presses on the same row at once wait for each other here.
      await tx.$queryRaw`SELECT id FROM "Item" WHERE id = ${p.itemId} FOR UPDATE`;

      const event = await tx.event.findUnique({
        where: { id: p.eventId },
        select: { hostId: true },
      });
      if (!event) throw new ShareError(404, 'NOT_FOUND', 'Event not found');

      const { pressed, rootId, rows, preview } = await load(tx, p.eventId, p.itemId);

      const personEvent = await tx.personEvent.findUnique({
        where: { personId_eventId: { personId: p.personId, eventId: p.eventId } },
        include: { person: { select: { id: true, name: true } } },
      });
      if (!personEvent)
        throw new ShareError(404, 'PERSON_NOT_IN_EVENT', 'Person is not part of this event');

      // The same-team rule, exactly as the assign route asks it.
      if (!mayHoldRow(personEvent, pressed, p.actorRole, event.hostId)) {
        throw new ShareError(400, 'SAME_TEAM', SAME_TEAM_ERROR);
      }
      if (rows.some((r) => r.assignment!.personId === p.personId)) {
        throw new ShareError(409, 'ALREADY_HAS', 'That person already has this dish');
      }

      // Her numbers, when the amount divides.
      const divided = preview.divided;
      let lines: ShareAmountLine[] = [];
      if (divided) {
        lines = readLines(p.amounts);
        const ids = new Set(rows.map((r) => r.id));
        const named = lines.filter((l) => l.itemId !== null).map((l) => l.itemId as string);
        if (named.length !== ids.size || !named.every((id) => ids.has(id))) {
          throw new ShareError(409, 'STALE', STALE_WORDS);
        }
        for (const r of rows) {
          const line = lines.find((l) => l.itemId === r.id)!;
          if (
            line.before === null ||
            roundAmount(line.before) !== roundAmount(r.quantityAmount as number)
          ) {
            throw new ShareError(409, 'STALE', STALE_WORDS);
          }
        }
      }
      const newLine = lines.find((l) => l.itemId === null) ?? null;

      // ── Placement: directly under the row pressed, in the order she sees. ──
      const siblings = await tx.item.findMany({
        where: { teamId: pressed.teamId },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, displayOrder: true },
      });
      const orders = siblings.map((s) => s.displayOrder);
      const clean = orders.every((o) => o !== null) && new Set(orders).size === orders.length;
      const copy = await tx.item.create({
        data: copyData(
          pressed,
          divided,
          newLine ? newLine.amount : null,
          clean ? (pressed.displayOrder as number) + 1 : null
        ),
        select: { id: true },
      });
      if (clean) {
        await tx.item.updateMany({
          where: {
            teamId: pressed.teamId,
            displayOrder: { gt: pressed.displayOrder as number },
            NOT: { id: copy.id },
          },
          data: { displayOrder: { increment: 1 } },
        });
      } else {
        // Missing or tied order numbers: number the section once, in the order she already sees.
        const ordered: string[] = [];
        for (const s of siblings) {
          ordered.push(s.id);
          if (s.id === pressed.id) ordered.push(copy.id);
        }
        for (let i = 0; i < ordered.length; i++) {
          const was = siblings.find((s) => s.id === ordered[i])?.displayOrder ?? null;
          if (was !== i + 1) {
            await tx.item.update({ where: { id: ordered[i] }, data: { displayOrder: i + 1 } });
          }
        }
      }

      // ── The assignment, and the item's status the way the assign route sets it. ──
      const assignment = await tx.assignment.create({
        data: { itemId: copy.id, personId: p.personId },
        select: { id: true, response: true },
      });
      await repairItemStatusAfterMutation(tx, copy.id);

      // ── The rows already sharing: their new amounts, only if still as she saw them. ──
      const changes: PendingChange[] = [
        {
          action: 'CREATE_ITEM',
          targetType: 'Item',
          targetId: copy.id,
          before: null,
          after: {
            name: pressed.name,
            kind: pressed.kind,
            quantity: divided ? null : pressed.quantity,
            teamId: pressed.teamId,
            quantityAmount: divided ? (newLine as ShareAmountLine).amount : pressed.quantityAmount,
            quantityUnit: pressed.quantityUnit,
            quantityUnitCustom: pressed.quantityUnitCustom,
            // The link (ruling D1 A): how rows that share a dish are recognised.
            sharedFromItemId: pressed.id,
            shareRootItemId: rootId,
          },
        },
        {
          action: 'CREATE_ASSIGNMENT',
          targetType: 'Assignment',
          targetId: assignment.id,
          before: null,
          after: {
            personId: p.personId,
            personName: personEvent.person.name,
            response: assignment.response,
          },
          context: { assignmentResponse: null },
        },
      ];
      const after: ShareResult['rows'] = [];
      for (const r of rows) {
        const line = lines.find((l) => l.itemId === r.id);
        const to = divided && line ? line.amount : r.quantityAmount;
        if (
          divided &&
          line &&
          roundAmount(to as number) !== roundAmount(r.quantityAmount as number)
        ) {
          const data: Prisma.ItemUncheckedUpdateManyInput = { quantityAmount: to };
          const clearsText = r.quantity !== null && r.quantity !== undefined;
          if (clearsText) data.quantity = null;
          // The item edit route's own flip: a regenerate must keep the divided amount.
          if (r.source === 'GENERATED') data.source = 'HOST_EDITED';
          const done = await tx.item.updateMany({
            where: { id: r.id, quantityAmount: r.quantityAmount },
            data,
          });
          if (done.count !== 1) throw new ShareError(409, 'STALE', STALE_WORDS);
          const context = { assignmentResponse: r.assignment!.response };
          changes.push({
            action: 'EDIT_ITEM',
            targetType: 'Item',
            targetId: r.id,
            field: 'quantityAmount',
            before: r.quantityAmount,
            after: to,
            context,
          });
          if (clearsText) {
            changes.push({
              action: 'EDIT_ITEM',
              targetType: 'Item',
              targetId: r.id,
              field: 'quantity',
              before: r.quantity,
              after: null,
              context,
            });
          }
        }
        after.push({ itemId: r.id, personId: r.assignment!.personId, amount: to });
      }
      after.push({
        itemId: copy.id,
        personId: p.personId,
        amount: divided ? (newLine as ShareAmountLine).amount : pressed.quantityAmount,
      });

      // ── The ledger, last. ──
      const recorded = await recordChange(tx, {
        eventId: p.eventId,
        actor: p.actor,
        reason: p.reason ?? null,
        changes,
      });

      return {
        copyItemId: copy.id,
        copyAssignmentId: assignment.id,
        divided,
        rows: after,
        changeSetId: recorded.changeSetId,
      };
    },
    { timeout: 20000, maxWait: 10000 }
  );
}
