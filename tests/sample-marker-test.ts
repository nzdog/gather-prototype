/**
 * [[GTC-426]] — THE SAMPLE MARKER (T1 of the sample clean-up): the column `Person.sampleEventId`
 * and its index, and nothing else.
 *
 * Founder rulings, 30 Oct 2026 (in Claude Code):
 *   - the marker is Person.sampleEventId: nullable text, NO foreign key (on purpose), with an
 *     index. Null means a real person;
 *   - this ticket adds the column only. Nothing reads or writes it yet: the identity rule change
 *     (Q2) and the writing of the marker are T2;
 *   - the migration is kept exactly as `prisma migrate dev --create-only` generated it: one
 *     ADD COLUMN and one plain CREATE INDEX, no hand edits (zone 5).
 *
 *   S  the schema, read as text: the field in model Person (String?, no @relation, no @default)
 *      and its @@index
 *   M  the migration: one new folder, sorted after GTC-374's, holding exactly the generated SQL
 *   D  the database: the column (text, nullable, no default), the index, no foreign key, every
 *      existing row null, and a raw insert that leaves it out reads null (rolled back)
 *   C  the generated client knows the field: in the scalar list, optional String in the model
 *      map, and a create that leaves it out returns null (rolled back)
 *   N  nothing in src/ or scripts/ names the field yet (T2 adds the first reader and writer)
 *   R  the rolled-back probes left no row behind
 *
 * RED before the migration is applied and the client regenerated: D and C red, the rest green.
 *
 * SAFETY. Runs against the local database named `gather_demo` only (refused otherwise; the
 * address is never printed). Every write is a probe inside a transaction that is rolled back.
 * No dev server, no browser, no provider, no network.
 *
 * Run with the local database's address in DATABASE_URL (never printed):
 *   npx tsx tests/sample-marker-test.ts
 */
import fs from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'crypto';

const ROOT = path.join(__dirname, '..');
const SCHEMA = 'prisma/schema.prisma';
const MIGRATIONS = 'prisma/migrations';
const MIGRATION = '20261029195430_gtc426_person_sample_event_id';
/** The migration before this one (GTC-374). The new folder must sort straight after it. */
const PREVIOUS = '20261009013857_gtc374_invites_only';
/** The SQL exactly as `prisma migrate dev --create-only` wrote it (STOP 1, approved 30 Oct). */
const SQL = [
  '-- AlterTable',
  'ALTER TABLE "Person" ADD COLUMN     "sampleEventId" TEXT;',
  '',
  '-- CreateIndex',
  'CREATE INDEX "Person_sampleEventId_idx" ON "Person"("sampleEventId");',
  '',
].join('\n');
const SQL_SHA256 = 'd367202c694a5683ad6bfb7fdae3334a7704a0b753fa2bab95532dbdd4434f96';
const FIELD = 'sampleEventId';
const INDEX = 'Person_sampleEventId_idx';
const RUN = randomBytes(4).toString('hex');
const PROBE_NAME = `gtc426-probe-${RUN}`;

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const reds: string[] = [];
function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
  } else {
    failed++;
    reds.push(`[${layer}] ${label}`);
    console.log(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? `\n    ${detail}` : ''}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};

// ── CHECKS: every condition, pure, so each can be tried on a passing and a failing input ─────
export const CHECKS = {
  /** model Person's body, from `model Person {` to the first line that is `}`. '' if absent. */
  personModel(schema: string): string {
    const lines = schema.split('\n');
    const at = lines.indexOf('model Person {');
    if (at < 0) return '';
    const end = lines.indexOf('}', at);
    return end < 0 ? '' : lines.slice(at, end + 1).join('\n');
  },
  /** The one field line `  sampleEventId <type...>` in a model body ('' unless exactly one). */
  fieldLine(model: string, field: string): string {
    const hits = model.split('\n').filter((l) => new RegExp(`^\\s+${field}\\s`).test(l));
    return hits.length === 1 ? hits[0] : '';
  },
  /** A plain optional text field: `String?` and nothing after it (no relation, no default). */
  plainOptionalString(line: string): boolean {
    return /^\s+\w+\s+String\?\s*$/.test(line);
  },
  /** The model holds `@@index([field])` exactly once. */
  hasIndex(model: string, field: string): boolean {
    return model.split('\n').filter((l) => l.trim() === `@@index([${field}])`).length === 1;
  },
  /** The schema names the field only inside model Person (so nothing relates to it). */
  onlyInPerson(schema: string, model: string, field: string): boolean {
    const count = (s: string) => s.split(field).length - 1;
    return count(model) > 0 && count(schema) === count(model);
  },
  sha256(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
  },
  /** `name` comes straight after `previous` in the sorted list of migration folders. */
  sortsRightAfter(folders: string[], previous: string, name: string): boolean {
    const sorted = [...folders].sort();
    const i = sorted.indexOf(previous);
    return i >= 0 && sorted[i + 1] === name && i + 2 === sorted.length;
  },
  /** The source files under a folder whose text names `word` (recursive; .ts, .tsx, .js, .mjs). */
  filesNaming(dir: string, word: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
      for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        const p = path.join(abs, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes(word))
          out.push(path.relative(ROOT, p));
      }
    };
    if (fs.existsSync(dir)) walk(dir);
    return out;
  },
};

// ── The database: gather_demo only ───────────────────────────────────────────
function databaseName(url: string | undefined): string {
  try {
    return new URL(url ?? '').pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}
function databaseHostIsLocal(url: string | undefined): boolean {
  try {
    return ['localhost', '127.0.0.1'].includes(new URL(url ?? '').hostname);
  } catch {
    return false;
  }
}
const DB_OK =
  databaseName(process.env.DATABASE_URL) === 'gather_demo' &&
  databaseHostIsLocal(process.env.DATABASE_URL);
// Loaded only once the address is known to name the local gather_demo.
let prisma: import('@prisma/client').PrismaClient | null = null;
let PrismaNs: typeof import('@prisma/client').Prisma | null = null;

/** Thrown to roll a probe's transaction back; anything else is a real failure. */
class Rollback extends Error {}

/** Run `probe` in a transaction that is always rolled back; returns what it saw, or the error. */
async function rolledBack<T>(
  probe: (tx: any) => Promise<T>
): Promise<{ seen?: T; error?: string }> {
  let seen: T | undefined;
  try {
    await prisma!.$transaction(async (tx) => {
      seen = await probe(tx);
      throw new Rollback();
    });
    return { error: 'the transaction committed' };
  } catch (e) {
    if (e instanceof Rollback) return { seen };
    return { error: e instanceof Error ? e.message.split('\n').slice(-1)[0] : String(e) };
  }
}

function layerS() {
  section('S — the schema, read as text');
  const schema = read(SCHEMA);
  const model = CHECKS.personModel(schema);
  const line = CHECKS.fieldLine(model, FIELD);
  assert('S', 'S1 model Person holds one sampleEventId field', line !== '');
  assert(
    'S',
    'S2 it is String? and nothing more (no @relation, so no foreign key; no @default)',
    CHECKS.plainOptionalString(line),
    `line: ${JSON.stringify(line)}`
  );
  assert('S', 'S3 model Person holds @@index([sampleEventId]) once', CHECKS.hasIndex(model, FIELD));
  assert(
    'S',
    'S4 the schema names sampleEventId only inside model Person',
    CHECKS.onlyInPerson(schema, model, FIELD)
  );
}

function layerM() {
  section('M — the migration');
  const folders = fs
    .readdirSync(path.join(ROOT, MIGRATIONS), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  assert(
    'M',
    `M1 ${MIGRATION} sorts straight after ${PREVIOUS}, and is the last`,
    CHECKS.sortsRightAfter(folders, PREVIOUS, MIGRATION)
  );
  const files = fs.existsSync(path.join(ROOT, MIGRATIONS, MIGRATION))
    ? fs.readdirSync(path.join(ROOT, MIGRATIONS, MIGRATION))
    : [];
  assert(
    'M',
    'M2 the folder holds migration.sql alone',
    files.length === 1 && files[0] === 'migration.sql'
  );
  const sql = read(`${MIGRATIONS}/${MIGRATION}/migration.sql`);
  assert(
    'M',
    'M3 the SQL is exactly as generated: one ADD COLUMN (text, nullable) and one CREATE INDEX',
    sql === SQL && CHECKS.sha256(sql) === SQL_SHA256
  );
}

async function layerD() {
  section('D — the database (gather_demo)');
  const cols = await prisma!.$queryRaw<
    { data_type: string; is_nullable: string; column_default: string | null }[]
  >`SELECT data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Person' AND column_name = ${FIELD}`;
  assert('D', 'D1 the column "Person"."sampleEventId" exists', cols.length === 1);
  assert(
    'D',
    'D2 it is text, nullable, with no default',
    cols.length === 1 &&
      cols[0].data_type === 'text' &&
      cols[0].is_nullable === 'YES' &&
      cols[0].column_default === null,
    `found: ${JSON.stringify(cols)}`
  );
  const idx = await prisma!.$queryRaw<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Person'
    AND indexname = ${INDEX}`;
  assert(
    'D',
    `D3 the index ${INDEX} exists, a plain btree on the column alone`,
    idx.length === 1 &&
      /^CREATE INDEX "Person_sampleEventId_idx" ON public\."Person" USING btree \("sampleEventId"\)$/.test(
        idx[0].indexdef
      ),
    `found: ${JSON.stringify(idx)}`
  );
  const fks = await prisma!.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = '"Person"'::regclass AND c.contype = 'f' AND a.attname = ${FIELD}`;
  assert('D', 'D4 no foreign key on the column (on purpose)', cols.length === 1 && fks[0]?.n === 0);
  let nonNull = -1;
  try {
    const rows = await prisma!.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "Person" WHERE "${FIELD}" IS NOT NULL`
    );
    nonNull = rows[0]?.n ?? -1;
  } catch {
    nonNull = -1;
  }
  assert('D', 'D5 every existing Person row holds null (no one is marked yet)', nonNull === 0);
  const raw = await rolledBack(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO "Person" (id, name) VALUES ($1, $2)`,
      PROBE_NAME,
      PROBE_NAME
    );
    const r = await tx.$queryRawUnsafe(
      `SELECT "${FIELD}" AS v FROM "Person" WHERE id = $1`,
      PROBE_NAME
    );
    return r as { v: string | null }[];
  });
  assert(
    'D',
    'D6 a raw insert that leaves the column out reads null (rolled back)',
    raw.error === undefined && raw.seen?.length === 1 && raw.seen[0].v === null,
    raw.error ? `error: ${raw.error}` : `seen: ${JSON.stringify(raw.seen)}`
  );
}

async function layerC() {
  section('C — the generated client');
  const scalars = Object.keys(
    (PrismaNs as unknown as Record<string, Record<string, string>>).PersonScalarFieldEnum ?? {}
  );
  assert('C', 'C1 Prisma.PersonScalarFieldEnum lists sampleEventId', scalars.includes(FIELD));
  const model = PrismaNs!.dmmf.datamodel.models.find((m) => m.name === 'Person');
  const field = model?.fields.find((f) => f.name === FIELD);
  assert(
    'C',
    'C2 the client model map: optional String scalar, no relation, no default',
    !!field &&
      field.kind === 'scalar' &&
      field.type === 'String' &&
      field.isRequired === false &&
      field.isList === false &&
      field.hasDefaultValue === false &&
      !field.relationName,
    `found: ${JSON.stringify(field ?? null)}`
  );
  const made = await rolledBack(async (tx) => {
    const p = await tx.person.create({ data: { name: PROBE_NAME } });
    return { has: Object.prototype.hasOwnProperty.call(p, FIELD), value: (p as any)[FIELD] };
  });
  assert(
    'C',
    'C3 person.create without sampleEventId returns it as null (rolled back)',
    made.error === undefined && made.seen?.has === true && made.seen.value === null,
    made.error ? `error: ${made.error}` : `seen: ${JSON.stringify(made.seen)}`
  );
}

function layerN() {
  section('N — nothing reads or writes the field yet (T2 adds the first)');
  const named = [
    ...CHECKS.filesNaming(path.join(ROOT, 'src'), FIELD),
    ...CHECKS.filesNaming(path.join(ROOT, 'scripts'), FIELD),
  ];
  assert(
    'N',
    'N1 no file under src/ or scripts/ names sampleEventId',
    named.length === 0,
    `named in: ${named.join(', ')}`
  );
}

async function layerR() {
  section('R — the probes left nothing behind');
  const left = await prisma!.person.count({ where: { name: PROBE_NAME } });
  const leftRaw = await prisma!.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "Person" WHERE id = $1 OR name = $1`,
    PROBE_NAME
  );
  assert('R', 'R1 no probe Person row remains', left === 0 && leftRaw[0]?.n === 0);
}

async function main() {
  section('P — preconditions');
  assert('P', 'P1 DATABASE_URL names the local database gather_demo (address not printed)', DB_OK);
  layerS();
  layerM();
  layerN();
  if (DB_OK) {
    const client = await import('@prisma/client');
    prisma = new client.PrismaClient();
    PrismaNs = client.Prisma;
    try {
      await layerD();
      await layerC();
      await layerR();
    } finally {
      await prisma.$disconnect();
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
}

// A dry run imports CHECKS only (SAMPLE_MARKER_DRY_RUN=1); the suite runs otherwise.
if (process.env.SAMPLE_MARKER_DRY_RUN !== '1') {
  main()
    .catch((e) => {
      console.error(e instanceof Error ? e.message.split('\n').slice(-1)[0] : e);
      failed++;
    })
    .finally(() => process.exit(failed > 0 ? 1 : 0));
}
