/**
 * GTC-302 — fix 1 (a job added by hand is stored as a job), the article strip at capture, and the
 * seed fix.
 *
 * Built on the founder's scoping answers, "Founder answers — scoping" in docs/tickets/GTC-302.md:
 *
 *   Unknown 2  "A toggle on the add-item form, worded as plainly as the thing itself: something is
 *              either brought or done. Propose the two words and show me; do not settle them."
 *              And: "A coordinator MAY add a job."
 *   Unknown 8  "ONE NAME, NOUN FORM. No second field." — and "'Do the ___' as the label, so the
 *              sentence they are completing is visible while they type."
 *   Unknown 7  "YES, FIX THE SEED STRINGS."
 *   Unknown 5  "LEAVE THE 961." — so nothing here rewrites a stored name nobody submitted.
 *
 * NOT HERE, by the same answers: the prompt changes, the display helper, the qualifier move.
 *
 * Labels: [RULED …] cites the answer. [CORRECTION 1] pins what scoping found the assign gate doing.
 * [DEFECT GTC-303] and [DEFECT GTC-304] pin two defects the founder filed from the build's choices
 * rather than fixed here; each is expected to change with its own ticket.
 *
 * Layers
 *   N  the name as stored — `itemNameForStorage`, pure
 *   K  the kind as submitted — `readSubmittedKind`, `kindFields` and the words, pure
 *   G  the gate a typed job meets — `mayHoldRow`, unchanged
 *   W  every write site in src/ that stores a name tidies it — structural, discovered not listed
 *   H  the host routes — structural: they read a session cookie and cannot be driven in-process
 *   C  the coordinator routes — driven in-process against gather_dev, on real rows
 *   U  the three add forms — structural: the toggle, the "Do the" lead, the kind sent
 *   S  the seed scripts — no item name begins with an article
 *
 * Run: npx tsx tests/item-kind-capture-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { itemNameForStorage } from '../src/lib/items/name';
import {
  JOB_NAME_LEAD,
  KIND_ERROR,
  ROW_KIND_WORDS,
  kindFields,
  readSubmittedKind,
} from '../src/lib/items/row-kind';
import { mayHoldRow } from '../src/lib/assignment/same-team';
import { POST as coordinatorPOST } from '../src/app/api/c/[token]/items/route';
import { PATCH as coordinatorPATCH } from '../src/app/api/c/[token]/items/[itemId]/route';

const prisma = new PrismaClient();
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(layer: string, label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${layer}] ${label}`);
    failed++;
  }
}
function section(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/** A probe that throws is a failure, not a crash: the RED stubs throw. */
function holds(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** Comments removed, so a prose mention can never satisfy a structural check. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function code(rel: string): string {
  return stripComments(read(rel));
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const WRITE_CALL = /\.item\.(?:create|createMany|update|updateMany|upsert)\(/;

/** Every `.item.create(…)`-shaped call, with its balanced argument text. */
function writeCalls(src: string): string[] {
  const out: string[] = [];
  const re = new RegExp(WRITE_CALL.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
    }
    out.push(src.slice(m.index, i));
  }
  return out;
}

/** A name written straight from what arrived, untidied. */
const RAW_NAME_IN_CALL = /\bname\s*:\s*(?:body|item|itemData|data|task|newItem|input)\.name\b/;
const RAW_NAME_ASSIGNED = /\bupdateData\.name\s*=\s*body\.name\b/;

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const createdEventIds: string[] = [];
  const createdPersonIds: string[] = [];

  try {
    // ─────────────────────────────────────────────────────────────────────────
    section('Layer N: the name as stored');
    // ─────────────────────────────────────────────────────────────────────────

    const cases: Array<[unknown, string | null, string]> = [
      ['The pavlova', 'pavlova', 'a leading "The" is stripped — "the The pavlova" was the defect'],
      ['the glazed ham', 'glazed ham', 'a lower-case "the" too'],
      ['A dozen eggs', 'dozen eggs', 'a leading "A"'],
      ['an esky', 'esky', 'a leading "an"'],
      ['  The   pavlova  ', 'pavlova', 'trimmed and spaces collapsed before the article is read'],
      ['Berry Trifle', 'Berry Trifle', 'case is NOT changed — proper nouns cannot be told apart'],
      ["Whittaker's chocolate", "Whittaker's chocolate", 'a possessive brand is left alone'],
      ['L&P', 'L&P', 'a brand in capitals is left alone'],
      ['Theatre props', 'Theatre props', '"The" inside a word is not an article'],
      ['Anzac biscuits', 'Anzac biscuits', '"An" inside a word is not an article'],
      ['A&W root beer', 'A&W root beer', '"A" with no space after it is not an article'],
      ['fish and the chips', 'fish and the chips', 'an article mid-name is left alone'],
      ['The', 'The', 'a name that is only an article is kept, never emptied'],
      [
        'Wash the dishes',
        'Wash the dishes',
        '[RULED Unknown 8] no verb is rewritten — the "Do the" label is the fix, not code',
      ],
      ['   ', null, 'a blank name is no name'],
      ['', null, 'an empty name is no name'],
      [null, null, 'null is no name'],
      [undefined, null, 'undefined is no name'],
      [42, null, 'a number is no name'],
    ];
    for (const [raw, expected, label] of cases) {
      assert(
        'N',
        `${JSON.stringify(raw)} → ${JSON.stringify(expected)}: ${label}`,
        holds(() => itemNameForStorage(raw) === expected)
      );
    }
    assert(
      'N',
      'idempotent: tidying a tidied name changes nothing',
      holds(() =>
        ['The pavlova', 'A dozen eggs', 'The', 'Berry Trifle', '  the  ham '].every((n) => {
          const once = itemNameForStorage(n);
          return once !== null && itemNameForStorage(once) === once;
        })
      )
    );

    // ─────────────────────────────────────────────────────────────────────────
    section('Layer K: the kind as submitted, and the words');
    // ─────────────────────────────────────────────────────────────────────────

    assert(
      'K',
      'an absent kind is no kind — the caller supplies the default',
      holds(() => {
        const r = readSubmittedKind(undefined);
        return r.ok && r.kind === undefined;
      })
    );
    assert(
      'K',
      "'TASK' reads as a job",
      holds(() => {
        const r = readSubmittedKind('TASK');
        return r.ok && r.kind === 'TASK';
      })
    );
    assert(
      'K',
      "'ITEM' reads as a dish",
      holds(() => {
        const r = readSubmittedKind('ITEM');
        return r.ok && r.kind === 'ITEM';
      })
    );
    assert(
      'K',
      "anything else is refused, not defaulted — null, 'task', 'CHORE', '', 1, {}",
      holds(() => [null, 'task', 'CHORE', '', 1, {}].every((raw) => !readSubmittedKind(raw).ok))
    );
    assert(
      'K',
      'a job carries no quantity — the shape generation gives a job (GTC-171: quantityState NA)',
      holds(() => {
        const f = kindFields('TASK');
        return f.kind === 'TASK' && f.quantityState === 'NA' && Object.keys(f).length === 2;
      })
    );
    assert(
      'K',
      'a dish keeps whatever quantity it was given — kindFields adds nothing but the kind',
      holds(() => {
        const f = kindFields('ITEM');
        return f.kind === 'ITEM' && Object.keys(f).length === 1;
      })
    );
    assert(
      'K',
      '[RULED Unknown 8] the job name field leads with "Do the"',
      JOB_NAME_LEAD === 'Do the'
    );
    assert(
      'K',
      '[RULED] "Bring" for a dish, "Do" for a job — the guest\'s own verbs',
      ROW_KIND_WORDS.ITEM === 'Bring' && ROW_KIND_WORDS.TASK === 'Do'
    );
    assert(
      'K',
      'nothing about the words is provisional any more — no GTC-302 anchor remains in src/',
      walk('src').every((f) => !read(f).includes('ANCHOR(GTC-302)'))
    );
    assert(
      'K',
      'both modules are client-safe — the add forms import them (no Prisma, no next/server)',
      ['src/lib/items/row-kind.ts', 'src/lib/items/name.ts'].every(
        (f) => !/from\s+['"](?:@prisma\/client|@\/lib\/prisma|next\/server)['"]/.test(code(f))
      )
    );
    assert(
      'K',
      'the refusal is worded once',
      typeof KIND_ERROR === 'string' && KIND_ERROR.length > 0
    );

    // ─────────────────────────────────────────────────────────────────────────
    section('Layer G: the gate a typed job meets — unchanged');
    // ─────────────────────────────────────────────────────────────────────────

    const guestOnMains = { personId: 'g', role: 'PARTICIPANT', teamId: 'team-mains' };
    assert(
      'G',
      '[RULED Unknown 2] a job typed onto a food team is a job to the gate: a guest on another team ' +
        'may hold it, exactly as a generated job',
      mayHoldRow(guestOnMains, { kind: 'TASK', teamId: 'team-desserts' }, 'HOST', 'host') === true
    );
    assert(
      'G',
      '[CORRECTION 1] what a job stored as a dish met under a job team: the same-team rule, refusing',
      mayHoldRow(guestOnMains, { kind: 'ITEM', teamId: 'team-setup' }, 'HOST', 'host') === false
    );
    assert(
      'G',
      'same-team.ts is not touched — the gate was right; the kind was missing',
      !read('src/lib/assignment/same-team.ts').includes('GTC-302')
    );

    // ─────────────────────────────────────────────────────────────────────────
    section('Layer W: every write site that stores a name tidies it');
    // ─────────────────────────────────────────────────────────────────────────

    const NAME_WRITERS = [
      'src/app/api/events/[id]/teams/[teamId]/items/route.ts',
      'src/app/api/c/[token]/items/route.ts',
      'src/app/api/events/[id]/items/[itemId]/route.ts',
      'src/app/api/c/[token]/items/[itemId]/route.ts',
      'src/lib/ai/plan-write.ts',
      'src/app/api/events/[id]/generate/route.ts',
      'src/app/api/events/[id]/regenerate/route.ts',
      'src/app/api/templates/[id]/clone/route.ts',
      'src/app/api/events/[id]/conflicts/[conflictId]/execute-resolution/route.ts',
    ];
    /** Writes a name tidied upstream: the task rows, named by `selectTaskRows`. */
    const TIDIED_UPSTREAM: Record<string, string> = {
      'src/app/api/events/[id]/finalize-plan/route.ts': 'src/lib/ai/tasks.ts',
    };
    /** Puts back what was stored. A restore is not a capture, and must not tidy. */
    const RESTORES = ['src/lib/workflow.ts'];
    const NO_NAME = [
      'src/app/api/events/[id]/people/[personId]/route.ts',
      'src/app/api/c/[token]/items/[itemId]/assign/route.ts',
      'src/app/api/events/[id]/review-items/route.ts',
      'src/app/api/events/[id]/items/mark-for-review/route.ts',
    ];

    const writers = walk('src').filter((f) => WRITE_CALL.test(code(f)));
    const classified = [...NAME_WRITERS, ...Object.keys(TIDIED_UPSTREAM), ...RESTORES, ...NO_NAME];
    const unclassified = writers.filter((f) => !classified.includes(f));
    const stale = classified.filter((f) => !writers.includes(f));
    assert(
      'W',
      `every file in src/ that writes an Item row is classified` +
        (unclassified.length ? ` — unclassified: ${unclassified.join(', ')}` : ''),
      unclassified.length === 0
    );
    assert(
      'W',
      'and every classified file still writes one — a stale list checks nothing' +
        (stale.length ? ` — stale: ${stale.join(', ')}` : ''),
      stale.length === 0
    );
    assert(
      'W',
      '[CONTROL] the raw-name matcher catches a planted write, and comments cannot hide one',
      writeCalls('prisma.item.create({ data: { name: body.name } })').some((c) =>
        RAW_NAME_IN_CALL.test(c)
      ) && !RAW_NAME_IN_CALL.test(stripComments('// name: body.name'))
    );

    for (const f of NAME_WRITERS) {
      const src = code(f);
      const raw = writeCalls(src).filter((c) => RAW_NAME_IN_CALL.test(c));
      assert(
        'W',
        `${f} tidies the name it writes` + (raw.length ? ` — raw: ${raw.length} call(s)` : ''),
        /from\s+['"]@\/lib\/items\/name['"]/.test(src) &&
          /itemNameForStorage\(/.test(src) &&
          raw.length === 0 &&
          !RAW_NAME_ASSIGNED.test(src)
      );
    }
    for (const [writer, upstream] of Object.entries(TIDIED_UPSTREAM)) {
      assert(
        'W',
        `${writer} writes task names already tidied by ${upstream}`,
        /itemNameForStorage\(/.test(code(upstream)) && /selectTaskRows\(/.test(code(writer))
      );
    }
    for (const f of RESTORES) {
      assert(
        'W',
        `${f} restores names as they were stored — a restore does not tidy`,
        !/itemNameForStorage\(/.test(code(f))
      );
    }
    for (const f of NO_NAME) {
      assert(
        'W',
        `${f} writes no name`,
        writeCalls(code(f)).every((c) => !/\bname\s*:\s*(?!true\b)/.test(c))
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    section('Layer H: the host routes');
    // ─────────────────────────────────────────────────────────────────────────

    const addRoute = code('src/app/api/events/[id]/teams/[teamId]/items/route.ts');
    assert(
      'H',
      'add: reads the submitted kind',
      /readSubmittedKind\(\s*body\.kind\s*\)/.test(addRoute)
    );
    assert(
      'H',
      'add: refuses a kind it cannot read, in the shared words',
      /\bKIND_ERROR\b/.test(addRoute)
    );
    assert(
      'H',
      'add: tidies the submitted name',
      /itemNameForStorage\(\s*body\.name\s*\)/.test(addRoute)
    );
    assert('H', "add: writes the kind's fields", /kindFields\(/.test(addRoute));
    assert(
      'H',
      "add: a job's quantity is not written — only a dish's",
      /if\s*\(\s*kind\s*===\s*'ITEM'/.test(addRoute)
    );
    assert(
      'H',
      "add: the ledger's CREATE_ITEM records the kind",
      /after:\s*\{[^}]*\bkind\b/.test(addRoute)
    );

    const patchRoute = code('src/app/api/events/[id]/items/[itemId]/route.ts');
    const tracked = patchRoute.match(/const TRACKED_ITEM_FIELDS = \[([\s\S]*?)\]/)?.[1] ?? '';
    const substantive =
      patchRoute.match(/const substantiveFieldsBeingEdited =([\s\S]*?);/)?.[1] ?? '';
    assert(
      'H',
      'PATCH: reads the submitted kind',
      /readSubmittedKind\(\s*body\.kind\s*\)/.test(patchRoute)
    );
    assert('H', 'PATCH: refuses a kind it cannot read', /\bKIND_ERROR\b/.test(patchRoute));
    assert(
      'H',
      'PATCH: a kind change is versioned — kind is a tracked field',
      /'kind'/.test(tracked)
    );
    assert(
      'H',
      'PATCH: a kind change is a host edit — GENERATED becomes HOST_EDITED, so the next regenerate ' +
        'cannot delete a re-kinded row under the kind it no longer has',
      /body\.kind\s*!==\s*undefined/.test(substantive)
    );
    assert(
      'H',
      'PATCH: a job carries no quantity once it becomes one',
      /kindFields\(/.test(patchRoute)
    );
    assert(
      'H',
      'PATCH: tidies a submitted name',
      /itemNameForStorage\(\s*body\.name\s*\)/.test(patchRoute)
    );
    assert(
      'H',
      '[DEFECT GTC-304] kind is tracked but NOT an ask field — a kind change on an answered row ' +
        'changes the verb of the ask and asks for no why. Expected to change with GTC-304',
      !/'kind'/.test(
        code('src/lib/ledger.ts').match(/export const ASK_FIELDS = \[([\s\S]*?)\]/)?.[1] ?? "'kind'"
      )
    );
    assert(
      'H',
      '[DEFECT GTC-303] the PATCH does not ask the same-team rule when the kind changes — a job ' +
        'made a dish keeps a holder mayHoldRow refuses. Expected to change with GTC-303',
      !/mayHoldRow\(/.test(patchRoute)
    );
    assert(
      'H',
      "[SCOPE] the coordinator's PATCH reads no kind — the founder named the host PATCH",
      !/readSubmittedKind\(/.test(code('src/app/api/c/[token]/items/[itemId]/route.ts'))
    );

    // ─────────────────────────────────────────────────────────────────────────
    section('Layer C: the coordinator routes, on real rows');
    // ─────────────────────────────────────────────────────────────────────────

    const stamp = `${Date.now()}-${randomBytes(3).toString('hex')}`;
    const host = await prisma.person.create({ data: { name: 'GTC-302 host' } });
    const coord = await prisma.person.create({ data: { name: 'GTC-302 coordinator' } });
    createdPersonIds.push(host.id, coord.id);
    const start = new Date(Date.now() + 14 * DAY);
    const event = await prisma.event.create({
      data: {
        name: `GTC-302 item-kind capture ${stamp}`,
        startDate: start,
        endDate: start,
        hostId: host.id,
      },
    });
    createdEventIds.push(event.id);
    const team = await prisma.team.create({
      data: { eventId: event.id, name: 'Mains', coordinatorId: coord.id },
    });
    const token = `gtc302-${stamp}`;
    await prisma.accessToken.create({
      data: { token, scope: 'COORDINATOR', eventId: event.id, personId: coord.id, teamId: team.id },
    });

    const post = async (body: unknown) => {
      try {
        const res = await coordinatorPOST({ json: async () => body } as any, {
          params: Promise.resolve({ token }),
        });
        return { status: res.status, json: await res.json() };
      } catch (e) {
        return { status: -1, json: { error: String(e) } };
      }
    };
    const patch = async (itemId: string, body: unknown) => {
      try {
        const res = await coordinatorPATCH({ json: async () => body } as any, {
          params: Promise.resolve({ token, itemId }),
        });
        return { status: res.status, json: await res.json() };
      } catch (e) {
        return { status: -1, json: { error: String(e) } };
      }
    };
    const rowsNamed = (name: string) => prisma.item.findMany({ where: { teamId: team.id, name } });

    const dish = await post({ name: '  The   pavlova ', quantity: '2 bowls' });
    const dishRow = dish.json?.item?.id
      ? await prisma.item.findUnique({ where: { id: dish.json.item.id } })
      : null;
    assert(
      'C',
      'a dish added with no kind is stored as a dish, its name tidied — "The pavlova" → "pavlova"',
      dish.status === 200 && dishRow?.kind === 'ITEM' && dishRow?.name === 'pavlova'
    );
    assert('C', 'and keeps the quantity it was given', dishRow?.quantity === '2 bowls');

    const job = await post({ name: 'dishes', kind: 'TASK', quantity: '3' });
    const jobRow = job.json?.item?.id
      ? await prisma.item.findUnique({ where: { id: job.json.item.id } })
      : null;
    assert(
      'C',
      '[RULED Unknown 2] a coordinator MAY add a job — stored as TASK',
      job.status === 200 && jobRow?.kind === 'TASK'
    );
    assert(
      'C',
      'a job carries no quantity — quantityState NA, quantity not written',
      jobRow?.quantityState === 'NA' && jobRow?.quantity === null
    );

    const badKind = await post({ name: 'bins', kind: 'CHORE' });
    assert(
      'C',
      'a kind it cannot read is refused with 400, and nothing is written',
      badKind.status === 400 && (await rowsNamed('bins')).length === 0
    );

    const blank = await post({ name: '   ' });
    assert(
      'C',
      'a blank name is refused with 400, and nothing is written',
      blank.status === 400 && (await rowsNamed('   ')).length === 0
    );

    const stored = await prisma.item.create({ data: { teamId: team.id, name: 'The ham' } });
    const notesOnly = await patch(stored.id, { notes: 'on the bone' });
    const afterNotes = await prisma.item.findUnique({ where: { id: stored.id } });
    assert(
      'C',
      '[RULED Unknown 5] an edit that sends no name leaves the stored one exactly as it was',
      notesOnly.status === 200 &&
        afterNotes?.name === 'The ham' &&
        afterNotes?.notes === 'on the bone'
    );

    const renamed = await patch(stored.id, { name: 'The trifle' });
    const afterRename = await prisma.item.findUnique({ where: { id: stored.id } });
    assert(
      'C',
      'a name that IS sent is tidied — "The trifle" → "trifle"',
      renamed.status === 200 && afterRename?.name === 'trifle'
    );

    const blanked = await patch(stored.id, { name: '  ' });
    const afterBlank = await prisma.item.findUnique({ where: { id: stored.id } });
    assert(
      'C',
      'a blank name sent to the PATCH is refused with 400, and the name is unchanged',
      blanked.status === 400 && afterBlank?.name === 'trifle'
    );

    // ─────────────────────────────────────────────────────────────────────────
    section('Layer U: the three add forms');
    // ─────────────────────────────────────────────────────────────────────────

    const toggleFile = 'src/components/plan/RowKindToggle.tsx';
    const toggle = fs.existsSync(path.join(ROOT, toggleFile)) ? code(toggleFile) : '';
    assert(
      'U',
      'one toggle, worded from the shared words',
      /ROW_KIND_WORDS/.test(toggle) && /from\s+['"]@\/lib\/items\/row-kind['"]/.test(toggle)
    );

    const FORMS: Array<[string, string]> = [
      ['the plan page modal', 'src/components/plan/AddItemModal.tsx'],
      ['the setup page row', 'src/components/plan/Moment2PlanView.tsx'],
      ["the coordinator's modal", 'src/app/c/[token]/page.tsx'],
    ];
    for (const [label, file] of FORMS) {
      const src = code(file);
      assert('U', `${label}: carries the toggle`, /<RowKindToggle\b/.test(src));
      assert(
        'U',
        `${label}: a job's name field leads with JOB_NAME_LEAD`,
        /\{JOB_NAME_LEAD\}/.test(src)
      );
      assert(
        'U',
        `${label}: words neither the toggle nor the lead itself`,
        !/Do the|>\s*Bring\s*<|>\s*Do\s*</.test(src)
      );
    }
    assert(
      'U',
      'the plan page modal sends the kind',
      /kind\??:\s*RowKindValue/.test(code('src/components/plan/AddItemModal.tsx')) &&
        /const itemData: ItemFormData = \{[^}]*\bkind\b/.test(
          code('src/components/plan/AddItemModal.tsx')
        )
    );
    assert(
      'U',
      'the setup page row sends the kind, and the setup page passes it on',
      /kind\??:\s*RowKindValue/.test(code('src/components/plan/Moment2PlanView.tsx')) &&
        /kind:\s*newItem\.kind/.test(code('src/app/plan/[eventId]/setup/page.tsx'))
    );
    assert(
      'U',
      "the coordinator's modal sends the kind",
      /kind:\s*newItem\.kind/.test(code('src/app/c/[token]/page.tsx'))
    );

    // ─────────────────────────────────────────────────────────────────────────
    section('Layer S: the seed scripts');
    // ─────────────────────────────────────────────────────────────────────────

    const SEEDS = [
      'scripts/seed-gtc192-replay.ts',
      'scripts/seed-gtc192-phase7.ts',
      'scripts/seed-gtc192-glance.ts',
    ];
    const ARTICLE_LITERAL = /(['"])(?:the|a|an) [^'"\n]*\1/gi;
    for (const f of SEEDS) {
      const offenders = code(f)
        .split('\n')
        .filter((line) => !/\bnote\s*:/.test(line))
        .flatMap((line) => line.match(ARTICLE_LITERAL) ?? []);
      assert(
        'S',
        `[RULED Unknown 7] ${f}: no item name begins with an article` +
          (offenders.length ? ` — ${offenders.length}: ${offenders.slice(0, 4).join(' ')}` : ''),
        offenders.length === 0
      );
    }
  } finally {
    for (const id of createdEventIds) {
      await prisma.event.deleteMany({ where: { id } });
    }
    await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    await prisma.$disconnect();
  }

  console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
