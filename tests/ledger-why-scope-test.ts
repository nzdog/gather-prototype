/**
 * GTC-168 (A2) — Why-scope rule tests, including the 20-mutation fixture that plan
 * §10.2 names as a measured acceptance metric for Epic A.
 *
 * The rule under test (`docs/04_roadmap/send-lock-reconciliation-plan.md` §5, from
 * Hinge §2): the why is required ONLY for changes that touch someone — reassignment,
 * removal, a quantity someone claimed against, date/venue. "A typo fix gets a version
 * and no interrogation."
 *
 * Pure functions, no database.
 */

import {
  whyTrigger,
  touchesSomeone,
  fieldChanges,
  ASK_FIELDS,
  MATERIAL_EVENT_FIELDS,
  type PendingChange,
  type WhyTrigger,
} from '../src/lib/ledger';
import type { LifecycleEvent } from '../src/lib/lifecycle';

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

const SENT: LifecycleEvent = {
  status: 'CONFIRMING',
  sentAt: new Date('2026-07-01T09:00:00.000Z'),
  endDate: new Date('2026-12-25T12:00:00.000Z'),
};
const UNSENT: LifecycleEvent = { ...SENT, sentAt: null };

console.log('\x1b[33m=== GTC-168: Why-scope rule (T1–T5) ===\x1b[0m\n');

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: pre-send, nothing touches anyone
// ─────────────────────────────────────────────────────────────────────────────
console.log('\x1b[33mSuite 1: pre-send — "the audit trail starts at the send"\x1b[0m');
const everyTriggerShape: PendingChange[] = [
  { action: 'MOVE_ASSIGNMENT', targetType: 'Assignment', targetId: 'a1' },
  {
    action: 'REMOVE_PERSON',
    targetType: 'PersonEvent',
    targetId: 'pe1',
    context: { heldAssignmentCount: 3 },
  },
  {
    action: 'DELETE_ITEM',
    targetType: 'Item',
    targetId: 'i1',
    context: { assignmentResponse: 'ACCEPTED' },
  },
  {
    action: 'EDIT_ITEM',
    targetType: 'Item',
    targetId: 'i1',
    field: 'quantity',
    context: { assignmentResponse: 'ACCEPTED' },
  },
  { action: 'EDIT_EVENT', targetType: 'Event', targetId: 'e1', field: 'startDate' },
];
assert(
  'every T1–T5 shape returns null before the press',
  everyTriggerShape.every((c) => whyTrigger(c, UNSENT) === null)
);
assert(
  'the same shapes all fire after the press',
  everyTriggerShape.every((c) => whyTrigger(c, SENT) !== null)
);

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: T1 — the ask itself, at EVERY response state
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\x1b[33mSuite 2: T1 — assignment created / moved / deleted\x1b[0m');
for (const action of ['CREATE_ASSIGNMENT', 'MOVE_ASSIGNMENT', 'DELETE_ASSIGNMENT'] as const) {
  for (const response of ['PENDING', 'ACCEPTED', 'DECLINED'] as const) {
    assert(
      `${action} at ${response} → T1`,
      whyTrigger(
        {
          action,
          targetType: 'Assignment',
          targetId: 'a1',
          context: { assignmentResponse: response },
        },
        SENT
      ) === 'T1'
    );
  }
}
assert(
  'T1 fires even at PENDING — they received the ask; it is being withdrawn or moved',
  whyTrigger(
    {
      action: 'MOVE_ASSIGNMENT',
      targetType: 'Assignment',
      targetId: 'a1',
      context: { assignmentResponse: 'PENDING' },
    },
    SENT
  ) === 'T1'
);

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: T2 / T3 — removal and deletion, gated on actually holding something
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\x1b[33mSuite 3: T2 removal, T3 item deletion\x1b[0m');
const removePerson = (n: number): PendingChange => ({
  action: 'REMOVE_PERSON',
  targetType: 'PersonEvent',
  targetId: 'pe1',
  context: { heldAssignmentCount: n },
});
assert('removing a person holding 1 assignment → T2', whyTrigger(removePerson(1), SENT) === 'T2');
assert('removing a person holding 5 assignments → T2', whyTrigger(removePerson(5), SENT) === 'T2');
assert(
  'removing a person holding nothing → no trigger',
  whyTrigger(removePerson(0), SENT) === null
);
assert(
  'removing a person with no count supplied → no trigger (absent means nothing held)',
  whyTrigger({ action: 'REMOVE_PERSON', targetType: 'PersonEvent', targetId: 'pe1' }, SENT) === null
);

const deleteItem = (r: 'PENDING' | 'ACCEPTED' | 'DECLINED' | null): PendingChange => ({
  action: 'DELETE_ITEM',
  targetType: 'Item',
  targetId: 'i1',
  context: { assignmentResponse: r },
});
assert('deleting an ACCEPTED item → T3', whyTrigger(deleteItem('ACCEPTED'), SENT) === 'T3');
assert(
  'deleting a PENDING item → T3 (the ask disappears)',
  whyTrigger(deleteItem('PENDING'), SENT) === 'T3'
);
assert('deleting a DECLINED item → T3', whyTrigger(deleteItem('DECLINED'), SENT) === 'T3');
assert('deleting an unassigned item → no trigger', whyTrigger(deleteItem(null), SENT) === null);

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: T4 — THE TYPO RULE, both directions
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\x1b[33mSuite 4: T4 — the PENDING/answered distinction (the typo rule)\x1b[0m');
const editItem = (
  field: string,
  response: 'PENDING' | 'ACCEPTED' | 'DECLINED' | null
): PendingChange => ({
  action: 'EDIT_ITEM',
  targetType: 'Item',
  targetId: 'i1',
  field,
  context: { assignmentResponse: response },
});

// Direction 1: ANSWERED → the ask they answered about moved → interrogate.
assert(
  'quantity change on an ACCEPTED item → T4',
  whyTrigger(editItem('quantity', 'ACCEPTED'), SENT) === 'T4'
);
assert(
  'name change on an ACCEPTED item → T4',
  whyTrigger(editItem('name', 'ACCEPTED'), SENT) === 'T4'
);
assert(
  'dropOffAt change on an ACCEPTED item → T4',
  whyTrigger(editItem('dropOffAt', 'ACCEPTED'), SENT) === 'T4'
);
assert(
  'DECLINED counts as answered — they engaged, and the ask moved',
  whyTrigger(editItem('quantity', 'DECLINED'), SENT) === 'T4'
);

// Direction 2: NOT YET ANSWERED → nothing claimed against → never interrogate.
assert(
  'THE TYPO CASE: name change on a PENDING item → NO trigger',
  whyTrigger(editItem('name', 'PENDING'), SENT) === null
);
assert(
  'quantity change on a PENDING item → NO trigger',
  whyTrigger(editItem('quantity', 'PENDING'), SENT) === null
);
assert(
  'dropOffLocation change on a PENDING item → NO trigger',
  whyTrigger(editItem('dropOffLocation', 'PENDING'), SENT) === null
);
assert(
  'ASK_FIELD change on an unassigned item → NO trigger (nobody was asked)',
  whyTrigger(editItem('name', null), SENT) === null
);

// Direction 3: non-ask fields never trigger, however answered.
console.log('\n\x1b[33mSuite 5: T4 is scoped to the guest-visible ask, nothing wider\x1b[0m');
for (const field of ASK_FIELDS) {
  assert(
    `ASK_FIELD "${field}" on an ACCEPTED item → T4`,
    whyTrigger(editItem(field, 'ACCEPTED'), SENT) === 'T4'
  );
}
for (const field of [
  'description',
  'notes',
  'critical',
  'displayOrder',
  'dayId',
  'prepStartTime',
  'dietaryTags',
]) {
  assert(
    `host-side field "${field}" on an ACCEPTED item → no trigger`,
    whyTrigger(editItem(field, 'ACCEPTED'), SENT) === null
  );
}
assert(
  'EDIT_ITEM with no field named → no trigger',
  whyTrigger(
    {
      action: 'EDIT_ITEM',
      targetType: 'Item',
      targetId: 'i1',
      context: { assignmentResponse: 'ACCEPTED' },
    },
    SENT
  ) === null
);

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6: T5 — material event fields
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\x1b[33mSuite 6: T5 — date/venue\x1b[0m');
const editEvent = (field: string): PendingChange => ({
  action: 'EDIT_EVENT',
  targetType: 'Event',
  targetId: 'e1',
  field,
});
for (const field of MATERIAL_EVENT_FIELDS) {
  assert(`material field "${field}" → T5`, whyTrigger(editEvent(field), SENT) === 'T5');
}
for (const field of ['name', 'occasionType', 'occasionDescription', 'guestCount', 'archived']) {
  assert(`non-material field "${field}" → no trigger`, whyTrigger(editEvent(field), SENT) === null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7: criticality is host-facing only (reverses today's frozen-edit behaviour)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\x1b[33mSuite 7: the explicit non-triggers\x1b[0m');
assert(
  'TOGGLE_CRITICAL on an ACCEPTED item → NO trigger (Moment 4 §8.3)',
  whyTrigger(
    {
      action: 'TOGGLE_CRITICAL',
      targetType: 'Item',
      targetId: 'i1',
      context: { assignmentResponse: 'ACCEPTED' },
    },
    SENT
  ) === null
);
for (const action of [
  'CREATE_ITEM',
  'ADD_PERSON',
  'CREATE_TEAM',
  'EDIT_TEAM',
  'DELETE_TEAM',
  'GENERATE_PLAN',
  'REGENERATE_PLAN',
  'SEND_PRESSED',
  'WRAP_UP_SENT',
] as const) {
  assert(
    `${action} → no trigger`,
    whyTrigger({ action, targetType: 'Item', targetId: 'x' }, SENT) === null
  );
}
assert(
  'touchesSomeone agrees with whyTrigger on a trigger',
  touchesSomeone(editItem('quantity', 'ACCEPTED'), SENT) === true
);
assert(
  'touchesSomeone agrees with whyTrigger on a non-trigger',
  touchesSomeone(editItem('quantity', 'PENDING'), SENT) === false
);

// ─────────────────────────────────────────────────────────────────────────────
// Suite 8: THE 20-MUTATION FIXTURE (plan §10.2, "why-scope precision")
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\x1b[33mSuite 8: the 20-mutation fixture — exactly the T-subset\x1b[0m');

interface FixtureCase {
  label: string;
  change: PendingChange;
  event: LifecycleEvent;
  expect: WhyTrigger | null;
}

const FIXTURE: FixtureCase[] = [
  // ── 9 that MUST prompt for a why ──
  {
    label: '01 assign the pavlova to Jake',
    change: {
      action: 'CREATE_ASSIGNMENT',
      targetType: 'Assignment',
      targetId: 'a01',
      context: { assignmentResponse: 'PENDING' },
    },
    event: SENT,
    expect: 'T1',
  },
  {
    label: '02 reassign the beef from Pete to Sarah',
    change: {
      action: 'MOVE_ASSIGNMENT',
      targetType: 'Assignment',
      targetId: 'a02',
      context: { assignmentResponse: 'ACCEPTED' },
    },
    event: SENT,
    expect: 'T1',
  },
  {
    label: '03 unassign the ice',
    change: {
      action: 'DELETE_ASSIGNMENT',
      targetType: 'Assignment',
      targetId: 'a03',
      context: { assignmentResponse: 'DECLINED' },
    },
    event: SENT,
    expect: 'T1',
  },
  {
    label: '04 remove Mike, who holds 2 items',
    change: removePerson(2),
    event: SENT,
    expect: 'T2',
  },
  {
    label: '05 delete the trifle Sarah accepted',
    change: deleteItem('ACCEPTED'),
    event: SENT,
    expect: 'T3',
  },
  {
    label: '06 lamb 2kg → 3kg, already accepted',
    change: editItem('quantityAmount', 'ACCEPTED'),
    event: SENT,
    expect: 'T4',
  },
  {
    label: '07 rename an accepted item',
    change: editItem('name', 'ACCEPTED'),
    event: SENT,
    expect: 'T4',
  },
  {
    label: '08 move the event to the 27th',
    change: editEvent('startDate'),
    event: SENT,
    expect: 'T5',
  },
  { label: '09 change the venue', change: editEvent('venueName'), event: SENT, expect: 'T5' },

  // ── 11 that MUST NOT ──
  {
    label: '10 THE TYPO: "Pavolva" → "Pavlova", nobody has answered',
    change: editItem('name', 'PENDING'),
    event: SENT,
    expect: null,
  },
  {
    label: '11 quantity fix on an unanswered ask',
    change: editItem('quantity', 'PENDING'),
    event: SENT,
    expect: null,
  },
  {
    label: '12 quantity on an item nobody holds',
    change: editItem('quantity', null),
    event: SENT,
    expect: null,
  },
  {
    label: '13 tidy the description of an accepted item',
    change: editItem('description', 'ACCEPTED'),
    event: SENT,
    expect: null,
  },
  {
    label: '14 mark the lamb critical',
    change: {
      action: 'TOGGLE_CRITICAL',
      targetType: 'Item',
      targetId: 'i14',
      context: { assignmentResponse: 'ACCEPTED' },
    },
    event: SENT,
    expect: null,
  },
  { label: '15 delete an item nobody holds', change: deleteItem(null), event: SENT, expect: null },
  {
    label: '16 remove a guest holding nothing',
    change: removePerson(0),
    event: SENT,
    expect: null,
  },
  {
    label: '17 add a new item',
    change: { action: 'CREATE_ITEM', targetType: 'Item', targetId: 'i17' },
    event: SENT,
    expect: null,
  },
  {
    label: '18 add a person with no assignment',
    change: { action: 'ADD_PERSON', targetType: 'PersonEvent', targetId: 'pe18' },
    event: SENT,
    expect: null,
  },
  {
    label: '19 rename a team',
    change: { action: 'EDIT_TEAM', targetType: 'Team', targetId: 't19', field: 'name' },
    event: SENT,
    expect: null,
  },
  {
    label: '20 reassign the beef BEFORE the press',
    change: {
      action: 'MOVE_ASSIGNMENT',
      targetType: 'Assignment',
      targetId: 'a20',
      context: { assignmentResponse: 'ACCEPTED' },
    },
    event: UNSENT,
    expect: null,
  },
];

assert(`fixture holds exactly 20 mutations (found ${FIXTURE.length})`, FIXTURE.length === 20);

let prompted = 0;
for (const c of FIXTURE) {
  const actual = whyTrigger(c.change, c.event);
  if (actual !== null) prompted++;
  assert(
    `${c.label} → ${c.expect ?? 'no why'}${actual === c.expect ? '' : ` (GOT ${actual ?? 'no why'})`}`,
    actual === c.expect
  );
}

const expectedPrompts = FIXTURE.filter((c) => c.expect !== null).length;
assert(
  `reason prompted on exactly ${expectedPrompts} of 20 — the T-subset, no more, no less (got ${prompted})`,
  prompted === expectedPrompts
);
const coveredTriggers = new Set(FIXTURE.map((c) => c.expect).filter(Boolean));
assert(
  'fixture exercises all five triggers T1–T5',
  ['T1', 'T2', 'T3', 'T4', 'T5'].every((t) => coveredTriggers.has(t as WhyTrigger))
);

// ─────────────────────────────────────────────────────────────────────────────
// Suite 9: fieldChanges — one entry per CHANGED field, not per submitted field
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\x1b[33mSuite 9: fieldChanges\x1b[0m');
const base = { action: 'EDIT_ITEM', targetType: 'Item', targetId: 'i1' } as const;
const changed = fieldChanges(
  base,
  { name: 'Pavolva', quantity: '1', description: 'nice' },
  { name: 'Pavlova', quantity: '1', description: 'nice' },
  ['name', 'quantity', 'description']
);
assert('only the changed field produces an entry', changed.length === 1);
assert('and it is the right one', changed[0].field === 'name');
assert(
  'before/after are carried',
  changed[0].before === 'Pavolva' && changed[0].after === 'Pavlova'
);
assert(
  'a field absent from `after` is not treated as cleared',
  fieldChanges(base, { name: 'a', quantity: '1' }, { name: 'a' }, ['name', 'quantity']).length === 0
);
assert(
  'Dates compare by instant, not identity',
  fieldChanges(
    base,
    { dropOffAt: new Date('2026-12-25T08:00:00Z') },
    { dropOffAt: new Date('2026-12-25T08:00:00Z') },
    ['dropOffAt']
  ).length === 0
);
assert(
  'a genuinely different Date does produce an entry',
  fieldChanges(
    base,
    { dropOffAt: new Date('2026-12-25T08:00:00Z') },
    { dropOffAt: new Date('2026-12-25T09:00:00Z') },
    ['dropOffAt']
  ).length === 1
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(
  `\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`
);
if (failed > 0) process.exit(1);
