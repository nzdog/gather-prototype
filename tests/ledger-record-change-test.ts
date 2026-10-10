/**
 * GTC-168 (A2) — recordChange() integration tests.
 *
 * The why-scope rule is pure and tested in `ledger-why-scope-test.ts`. This file
 * tests the write path against a real database: sequence monotonicity, changeSet
 * grouping, actorName freezing, SYSTEM actors, and the honest-null reason semantics.
 *
 * Creates its own throwaway event and deletes it at the end, whether or not the
 * assertions pass. Requires DATABASE_URL.
 */

import { PrismaClient } from '@prisma/client';
import { recordChange, type PendingChange } from '../src/lib/ledger';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}`);
    failed++;
  }
}

const SUFFIX = `gtc168-${process.pid}`;

async function main() {
  console.log('\x1b[33m=== GTC-168: recordChange() write path ===\x1b[0m\n');

  const host = await prisma.person.create({
    data: { name: `Ledger Test Host ${SUFFIX}` },
  });
  const event = await prisma.event.create({
    data: {
      name: `Ledger Test Event ${SUFFIX}`,
      startDate: new Date('2026-12-25T09:00:00.000Z'),
      endDate: new Date('2026-12-25T20:00:00.000Z'),
      status: 'CONFIRMING',
      sentAt: new Date('2026-11-01T09:00:00.000Z'), // sent, so the rule is live
      hostId: host.id,
    },
  });

  const actor = { id: host.id, kind: 'HOST' as const };

  // ── Suite 1: sequence allocation ──────────────────────────────────────────
  console.log('\x1b[33mSuite 1: sequence — the version number\x1b[0m');

  const first = await prisma.$transaction((tx) =>
    recordChange(tx, {
      eventId: event.id,
      actor,
      changes: [{ action: 'CREATE_ITEM', targetType: 'Item', targetId: 'i1' }],
    })
  );
  assert('first entry gets sequence 1', first.sequences[0] === 1);

  const second = await prisma.$transaction((tx) =>
    recordChange(tx, {
      eventId: event.id,
      actor,
      changes: [
        { action: 'EDIT_ITEM', targetType: 'Item', targetId: 'i1', field: 'description' },
        { action: 'EDIT_ITEM', targetType: 'Item', targetId: 'i1', field: 'notes' },
      ],
    })
  );
  assert('a 2-change set gets consecutive sequences', JSON.stringify(second.sequences) === '[2,3]');

  const third = await prisma.$transaction((tx) =>
    recordChange(tx, {
      eventId: event.id,
      actor,
      changes: [{ action: 'CREATE_ITEM', targetType: 'Item', targetId: 'i2' }],
    })
  );
  assert('sequence continues across changeSets', third.sequences[0] === 4);

  const all = await prisma.auditEntry.findMany({
    where: { eventId: event.id },
    orderBy: { sequence: 'asc' },
  });
  assert(
    'sequences are strictly monotonic with no gaps',
    all.every((e, i) => e.sequence === i + 1)
  );

  // ── Regression: logAudit rows must not poison sequence allocation ─────────
  //
  // logAudit writes lifecycle rows with a NULL sequence into the same table. Postgres
  // orders NULLS FIRST on DESC, so a naive max-sequence lookup returns one of those
  // and hands out sequence 1 forever. Found by the GTC-196 security suite the moment
  // both writers landed on one event.
  console.log('\n\x1b[33mSuite 1b: logAudit rows do not poison sequence allocation\x1b[0m');
  await prisma.auditEntry.create({
    data: {
      eventId: event.id,
      actorId: host.id,
      actionType: 'ASSIGN_ITEM',
      targetType: 'Item',
      targetId: 'i1',
      details: 'a lifecycle row, written by logAudit — no sequence',
    },
  });
  const afterNullRow = await prisma.$transaction((tx) =>
    recordChange(tx, {
      eventId: event.id,
      actor,
      changes: [{ action: 'CREATE_ITEM', targetType: 'Item', targetId: 'i3' }],
    })
  );
  assert(
    'a NULL-sequence lifecycle row does not reset the counter',
    afterNullRow.sequences[0] === 5
  );

  // ── Suite 2: changeSet grouping ───────────────────────────────────────────
  console.log('\n\x1b[33mSuite 2: changeSetId — one request, one step\x1b[0m');
  assert('a 2-change set shares one changeSetId', second.entryIds.length === 2);
  const secondRows = await prisma.auditEntry.findMany({
    where: { changeSetId: second.changeSetId },
  });
  assert('both rows carry it', secondRows.length === 2);
  assert(
    'and it differs from other sets',
    first.changeSetId !== second.changeSetId && second.changeSetId !== third.changeSetId
  );

  const joined = await prisma.$transaction((tx) =>
    recordChange(tx, {
      eventId: event.id,
      actor,
      changeSetId: second.changeSetId,
      changes: [{ action: 'EDIT_ITEM', targetType: 'Item', targetId: 'i1', field: 'notes' }],
    })
  );
  assert(
    'an explicit changeSetId joins an existing set',
    joined.changeSetId === second.changeSetId
  );
  assert('the joined row still gets its own sequence', joined.sequences[0] === 6);

  // ── Suite 3: the why, and its honest absence ──────────────────────────────
  console.log('\n\x1b[33mSuite 3: reasonRequired — required never means rejected\x1b[0m');

  const withWhy = await prisma.$transaction((tx) =>
    recordChange(tx, {
      eventId: event.id,
      actor,
      reason: "Pete couldn't do it",
      changes: [
        {
          action: 'MOVE_ASSIGNMENT',
          targetType: 'Assignment',
          targetId: 'a1',
          context: { assignmentResponse: 'ACCEPTED' },
        },
      ],
    })
  );
  assert('a T1 reassignment reports reasonRequired', withWhy.reasonRequired === true);
  assert('and reports which trigger fired', withWhy.triggers[0] === 'T1');
  const whyRow = await prisma.auditEntry.findUnique({ where: { id: withWhy.entryIds[0] } });
  assert('the reason is stored', whyRow?.reason === "Pete couldn't do it");
  assert('and the row is flagged as owed one', whyRow?.reasonRequired === true);

  const withoutWhy = await prisma.$transaction((tx) =>
    recordChange(tx, {
      eventId: event.id,
      actor,
      // no reason supplied for a change that owes one
      changes: [
        {
          action: 'MOVE_ASSIGNMENT',
          targetType: 'Assignment',
          targetId: 'a2',
          context: { assignmentResponse: 'ACCEPTED' },
        },
      ],
    })
  );
  assert('a missing reason does NOT throw — the change lands', withoutWhy.entryIds.length === 1);
  const gapRow = await prisma.auditEntry.findUnique({ where: { id: withoutWhy.entryIds[0] } });
  assert(
    'the omission is recorded honestly: reasonRequired true, reason null',
    gapRow?.reasonRequired === true && gapRow?.reason === null
  );

  const noWhyOwed = await prisma.$transaction((tx) =>
    recordChange(tx, {
      eventId: event.id,
      actor,
      changes: [
        {
          action: 'TOGGLE_CRITICAL',
          targetType: 'Item',
          targetId: 'i1',
          context: { assignmentResponse: 'ACCEPTED' },
        },
      ],
    })
  );
  const criticalRow = await prisma.auditEntry.findUnique({ where: { id: noWhyOwed.entryIds[0] } });
  assert(
    'a criticality toggle is versioned but never interrogated',
    noWhyOwed.reasonRequired === false && criticalRow?.reasonRequired === false
  );

  console.log('\n\x1b[33mSuite 4: mixed changeSets flag per-row, not per-set\x1b[0m');
  const mixed = await prisma.$transaction((tx) =>
    recordChange(tx, {
      eventId: event.id,
      actor,
      reason: 'moved the beef and tidied a note',
      changes: [
        {
          action: 'MOVE_ASSIGNMENT',
          targetType: 'Assignment',
          targetId: 'a3',
          context: { assignmentResponse: 'ACCEPTED' },
        },
        { action: 'EDIT_ITEM', targetType: 'Item', targetId: 'i1', field: 'notes' },
      ],
    })
  );
  const mixedRows = await prisma.auditEntry.findMany({
    where: { changeSetId: mixed.changeSetId },
    orderBy: { sequence: 'asc' },
  });
  assert(
    'the triggering row is flagged, the non-triggering row is not',
    mixedRows[0].reasonRequired === true && mixedRows[1].reasonRequired === false
  );
  assert(
    'both carry the set-level reason (one answer, several rows)',
    mixedRows.every((r) => r.reason === 'moved the beef and tidied a note')
  );

  // ── Suite 5: actor identity ───────────────────────────────────────────────
  console.log('\n\x1b[33mSuite 5: actorName is frozen at write time\x1b[0m');
  assert(
    'actorName is looked up when not supplied',
    whyRow?.actorName === `Ledger Test Host ${SUFFIX}`
  );
  assert('actorKind is stored', whyRow?.actorKind === 'HOST');

  await prisma.person.update({ where: { id: host.id }, data: { name: 'Renamed Later' } });
  const afterRename = await prisma.auditEntry.findUnique({ where: { id: withWhy.entryIds[0] } });
  assert(
    'renaming the person does NOT rewrite history',
    afterRename?.actorName === `Ledger Test Host ${SUFFIX}`
  );

  const systemWrite = await prisma.$transaction((tx) =>
    recordChange(tx, {
      eventId: event.id,
      actor: { id: null, kind: 'SYSTEM', name: null },
      changes: [{ action: 'WRAP_UP_SENT', targetType: 'Event', targetId: event.id }],
    })
  );
  const systemRow = await prisma.auditEntry.findUnique({ where: { id: systemWrite.entryIds[0] } });
  assert(
    'a SYSTEM actor writes with a null actorId',
    systemRow?.actorId === null && systemRow?.actorKind === 'SYSTEM'
  );

  const coordWrite = await prisma.$transaction((tx) =>
    recordChange(tx, {
      eventId: event.id,
      actor: { id: host.id, kind: 'COORDINATOR', name: 'Rob Henderson' },
      changes: [
        {
          action: 'MOVE_ASSIGNMENT',
          targetType: 'Assignment',
          targetId: 'a4',
          context: { assignmentResponse: 'ACCEPTED' },
        },
      ],
    })
  );
  assert(
    'a coordinator owes the same why a host does (actor-agnostic rule)',
    coordWrite.reasonRequired === true
  );

  // ── Suite 6: before/after and empty sets ──────────────────────────────────
  console.log('\n\x1b[33mSuite 6: payload and edge cases\x1b[0m');
  const payload = await prisma.$transaction((tx) =>
    recordChange(tx, {
      eventId: event.id,
      actor,
      changes: [
        {
          action: 'EDIT_ITEM',
          targetType: 'Item',
          targetId: 'i1',
          field: 'quantity',
          before: { quantity: '2 kg' },
          after: { quantity: '3 kg' },
          context: { assignmentResponse: 'ACCEPTED' },
        } satisfies PendingChange,
      ],
    })
  );
  const payloadRow = await prisma.auditEntry.findUnique({ where: { id: payload.entryIds[0] } });
  assert('before is stored', JSON.stringify(payloadRow?.before) === '{"quantity":"2 kg"}');
  assert('after is stored', JSON.stringify(payloadRow?.after) === '{"quantity":"3 kg"}');
  assert('field is stored', payloadRow?.field === 'quantity');

  const empty = await prisma.$transaction((tx) =>
    recordChange(tx, { eventId: event.id, actor, changes: [] })
  );
  assert('an empty changeSet writes nothing', empty.entryIds.length === 0);

  // ── Suite 7: pre-send writes versions but never owes a why ────────────────
  console.log('\n\x1b[33mSuite 7: pre-send — versioned, never interrogated\x1b[0m');
  const unsent = await prisma.event.create({
    data: {
      name: `Ledger Unsent Event ${SUFFIX}`,
      startDate: new Date('2026-12-25T09:00:00.000Z'),
      endDate: new Date('2026-12-25T20:00:00.000Z'),
      status: 'CONFIRMING',
      sentAt: null,
      hostId: host.id,
    },
  });
  const preSend = await prisma.$transaction((tx) =>
    recordChange(tx, {
      eventId: unsent.id,
      actor,
      changes: [
        {
          action: 'MOVE_ASSIGNMENT',
          targetType: 'Assignment',
          targetId: 'a9',
          context: { assignmentResponse: 'ACCEPTED' },
        },
      ],
    })
  );
  assert('a pre-send reassignment is still versioned', preSend.sequences[0] === 1);
  assert('but owes no why', preSend.reasonRequired === false);

  await prisma.event.delete({ where: { id: unsent.id } });
}

main()
  .catch((e) => {
    console.error('\x1b[31mTest run threw:\x1b[0m', e);
    failed++;
  })
  .finally(async () => {
    // Cleanup, pass or fail. AuditEntry cascades from Event.
    await prisma.event.deleteMany({ where: { name: { contains: SUFFIX } } });
    await prisma.person.deleteMany({
      where: { name: { in: [`Ledger Test Host ${SUFFIX}`, 'Renamed Later'] } },
    });
    await prisma.$disconnect();
    console.log(
      `\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`
    );
    if (failed > 0) process.exit(1);
  });
