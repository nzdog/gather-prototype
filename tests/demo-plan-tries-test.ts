/**
 * [[GTC-446]] — W5 WHEN THERE IS NO PLAN: A SAMPLE COPY'S REFUSAL CHOOSES ITS WORDS.
 *
 * Founder rulings, 1 Nov 2026 (GTC-392 parts C and D: Q8 (a), Q16) and at the build, 2 Nov 2026
 * (O1 to O5 (a)): takeDemoAiCall's refusal for the copy's own limit says W5 when the copy has at
 * least one item (any Item row, task rows included, on any of its teams) and W57 when it has none.
 * The item check is made inside the same transaction and lock, only after the copy's own allowance
 * has run out. The day's total (W6) is unchanged and comes first, with no item check. Failed calls
 * are still counted before the call is made (GTC-237's rule). The six AI routes and the setup page
 * are not edited.
 *
 *   P  preconditions: gather_demo, no copy at the start, no AI reachable from this process
 *   W  the words: W5, W6 and W57 as the plan wrote them
 *   A  the refusals: no item (W57), an item (W5), three failed calls, the day's total (W6), a real
 *      event, five at once, and what counts as an item
 *   S  the source: one item read, in the transaction, after the copy's take fails; the six routes
 *      as at 79d7d7e; the setup page as at 79d7d7e plus exactly GTC-449's five pieces
 *   Z  every probe row removed by id; the totals as at the start
 *
 * SAFETY. gather_demo on this Mac only (refused otherwise; the address is never printed). In
 * process only: no dev server, no route, no HTTP. The AI key is removed from this process before
 * any AI module loads, and every lookup or connection to a host outside this Mac is refused and
 * counted here (A3 shows the counts were 0). Nothing sends. Teardown deletes this run's rows by id.
 *
 * Every live condition lives in CHECKS (DEMO_PLAN_TRIES_DRY_RUN=1 imports CHECKS only). Expected
 * words are read from the plan, never taken from the code under test.
 *
 *   npx tsx tests/demo-plan-tries-test.ts
 */
import dns from 'dns';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { createHash, randomBytes } from 'crypto';
import { spawnSync } from 'child_process';

// Before any AI module loads: this process has no key, so the real AI function refuses at once.
delete process.env.ANTHROPIC_API_KEY;

const ROOT = path.join(__dirname, '..');
const RUN = randomBytes(4).toString('hex');
const TAG = `gtc446-${RUN}`;
/** This ticket's starting commit (a fixed commit). */
const PARENT = '79d7d7e';
/** The commit GTC-449 and main both grew from (their merge-base). */
const BASE = '128b3414b75ad6fe69a2c30231ee063a4c2ae699';
const AI_CAP = 'src/lib/demo/ai-cap.ts';
const PLAN = 'docs/tickets/GTC-392.md';
/** The six AI routes: nothing changes them, as at 79d7d7e. */
const KEPT = [
  'src/app/api/events/[id]/finalize-plan/route.ts',
  'src/app/api/events/[id]/regenerate-plan/route.ts',
  'src/app/api/events/[id]/generate/route.ts',
  'src/app/api/events/[id]/regenerate/route.ts',
  'src/app/api/events/[id]/regenerate/preview/route.ts',
  'src/app/api/events/[id]/conflicts/[conflictId]/suggest-resolution/route.ts',
];
// ── [[GTC-449]]: the setup page is 79d7d7e's (and the base's) plus exactly five pieces ──────
const SETUP = 'src/app/plan/[eventId]/setup/page.tsx';
/**
 * WHY THESE HASHES EXIST. GTC-449's pieces 1 to 4 are not pinned word for word anywhere else: our own
 * tests load each piece out of the page and RUN it, so a change that alters what it does goes red, but
 * a changed comment, a renamed local or a reworded line does not. (Piece 5, the invitationsSent prop,
 * is pinned word for word by decide-later-form-test P.1; it is hashed here too so the list is whole.)
 * The numstat below only counts lines, so it would miss a same-size change inside a piece.
 *
 * WHAT IS HASHED. One SHA-256 per piece, in page order, of the piece's ADDED lines only, exactly as
 * they stand in the page, each followed by a newline. Nothing else: no diff markers, no context
 * lines, no removed line, no line numbers. The lines come from `git diff -U0` (see pieceLines),
 * and an inserted block is first slid to its earliest position, so the two equal-looking places git
 * may put the same text (piece 1 has one) give the same lines under any git version.
 *
 * TO RECOMPUTE A HASH after a deliberate edit of a piece, from the repo root (prints 5 lines, piece
 * 1 first; paste them below):
 *   DEMO_PLAN_TRIES_DRY_RUN=1 npx tsx -e "console.log(require('./tests/demo-plan-tries-test.ts').setupPieceHashes().join('\n'))"
 *
 * Pieces: 1 keptEmailNames (S2.3), 2 the effect that clears W9, 3 the decideLater mapper line,
 * 4 the kept/W9 save, 5 the invitationsSent prop.
 */
const OUR_PIECES = [
  '4dbcdb4cf9e82adc52d27d8d85e35102cccd2ed7b8cc6a38f06d39b4f3fab558',
  'b131cf6b3c1c0f3c390023b5bc22bc9907647bdbc95b46eafaa475b6073ed746',
  '932428d34591fc5d30fea2d21213fa01421dd42491b76868e1dea49535696e6b',
  '52ed58fb01badadbfddbfccb34c43b39729faf19dad37dcdb11df0cdad0a18d3',
  '27e57dbf2c4cce5829fe31d4b90ba5bd5049c4d0a5bd192a3f510c9f8f515190',
];
/** The page's lines added and removed since 79d7d7e: exactly +57 and -1. */
const OUR_NUMSTAT = `57\t1\t${SETUP}\n`;
const TOTALS = [
  'event',
  'eventSetup',
  'person',
  'user',
  'session',
  'accessToken',
  'inviteEvent',
  'outboundMessage',
  'planRevision',
  'team',
  'item',
  'household',
  'personEvent',
  'auditEntry',
  'magicLink',
  'eventRole',
  'assignment',
  'wrapUpLink',
] as const;

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

// ── Sources ──────────────────────────────────────────────────────────────────
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const indexes = (s: string, needle: string) => {
  const out: number[] = [];
  for (let i = s.indexOf(needle); i >= 0; i = s.indexOf(needle, i + 1)) out.push(i);
  return out;
};

/** The W-lines of one plan section, each joined onto one line: { W5: '...', ... }. */
function wLines(plan: string, from: string, to: string): Record<string, string> {
  const a = plan.indexOf(from);
  const b = a < 0 ? -1 : plan.indexOf(to, a);
  const out: Record<string, string> = {};
  if (a < 0 || b < 0) return out;
  for (const item of plan
    .slice(a, b)
    .split(/\n- (?=W\d+ )/)
    .slice(1)) {
    const one = item
      .split('\n')
      .map((l) => l.trim())
      .join(' ')
      .trim();
    const m = /^(W\d+) \([^)]*\): "(.*)"$/.exec(one);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
/** W5 and W6 from part A's W-lines; W57 from parts C and D's (approved as written, Q16). */
export function planWords(plan: string): { W5?: string; W6?: string; W57?: string } {
  const a = wLines(plan, '### W-lines', '### Questions for Nigel');
  const cd = wLines(
    plan,
    '## W-lines (every sentence a visitor reads, from W42)',
    '## Questions for the founder'
  );
  return { W5: a.W5, W6: a.W6, W57: cd.W57 };
}

/**
 * The ADDED lines of each hunk of a `git diff -U0` text, in order, normalised: a hunk that only
 * inserts is slid up to its earliest position (while the line above it equals its last line), using
 * the page's own lines. Only the '+' lines count; headers, markers and the removed line do not.
 */
export function pieceLines(diff: string, page: string): string[][] {
  const pageLines = page.split('\n');
  const out: string[][] = [];
  let cur: { insertOnly: boolean; start: number; added: string[] } | null = null;
  const close = () => {
    if (!cur) return;
    let lines = cur.added;
    if (
      cur.insertOnly &&
      pageLines.slice(cur.start, cur.start + lines.length).join('\n') === lines.join('\n')
    ) {
      let s = cur.start;
      while (s > 0 && pageLines[s - 1] === pageLines[s + lines.length - 1]) s--;
      lines = pageLines.slice(s, s + lines.length);
    }
    out.push(lines);
  };
  for (const line of diff.split('\n')) {
    const h = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (h) {
      close();
      cur = { insertOnly: h[1] === '0', start: Number(h[2]) - 1, added: [] };
    } else if (cur && line.startsWith('+')) cur.added.push(line.slice(1));
  }
  close();
  return out;
}
const sha = (lines: string[]) =>
  createHash('sha256')
    .update(lines.join('\n') + '\n')
    .digest('hex');
/** The five hashes now, from the working tree against 79d7d7e (also what the recompute command prints). */
export function setupPieceHashes(): string[] {
  const diff = spawnSync(
    'git',
    [
      'diff',
      '-U0',
      '--diff-algorithm=myers',
      '--indent-heuristic',
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',
      PARENT,
      '--',
      SETUP,
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }
  ).stdout;
  let page = '';
  try {
    page = fs.readFileSync(path.join(ROOT, SETUP), 'utf8');
  } catch {
    // a missing page gives no pieces, so S2 is red
  }
  return pieceLines(String(diff), page).map(sha);
}

// ── CHECKS-START: every live condition, pure, dry-run before RED ─────────────
type Take = { ok?: boolean; counted?: boolean; words?: string; threw?: string } | null;
export const CHECKS = {
  /** P1 */
  localDemoDb(url: string | undefined) {
    try {
      const u = new URL(url ?? '');
      return u.pathname === '/gather_demo' && ['localhost', '127.0.0.1'].includes(u.hostname);
    } catch {
      return false;
    }
  },
  /** P3: no key here, and a made-up outside host refused by lookup, connection and fetch. */
  noAiReach(c: { key: unknown; lookup: string; connect: string; fetch: string }) {
    return (
      c.key === undefined &&
      [c.lookup, c.connect, c.fetch].every((e) =>
        /refused|ENOTFOUND|EAI_AGAIN|ECONNREFUSED/.test(e)
      )
    );
  },
  /** W1 */
  words(
    plan: { W5?: string; W6?: string; W57?: string },
    cap: Record<string, unknown> | undefined
  ) {
    return (
      !!plan.W5 &&
      !!plan.W6 &&
      !!plan.W57 &&
      cap?.COPY_USED_UP === plan.W5 &&
      cap?.DAY_USED_UP === plan.W6 &&
      cap?.NO_PLAN === plan.W57
    );
  },
  /** A1, A2, A8 to A10: tries taken and counted, then refused in the given words. */
  triesThenRefused(r: Take[], taken: number, words: string | undefined, used: number | undefined) {
    return (
      !!words &&
      r.length === taken + 1 &&
      r.slice(0, taken).every((x) => x?.ok === true && x?.counted === true) &&
      r[taken]?.ok === false &&
      r[taken]?.words === words &&
      used === 3
    );
  },
  /** A3: each try taken, each AI call failed before any request left, nothing written. */
  failedCallsCounted(c: {
    takes: Take[];
    errors: string[];
    outside: number;
    fetches: number;
    items: number;
    teams: number;
    used: number | undefined;
    fourth: Take;
    w57: string | undefined;
  }) {
    return (
      !!c.w57 &&
      c.takes.length === 3 &&
      c.takes.every((x) => x?.ok === true && x?.counted === true) &&
      c.errors.length === 3 &&
      c.errors.every((e) => e === 'ANTHROPIC_API_KEY is not configured in environment variables') &&
      c.outside === 0 &&
      c.fetches === 0 &&
      c.items === 0 &&
      c.teams === 0 &&
      c.used === 3 &&
      c.fourth?.ok === false &&
      c.fourth?.words === c.w57
    );
  },
  /** P2 */
  noCopies(n: number) {
    return n === 0;
  },
  /** A4: the day's number is today's sum (some used); W6 for each, none counted. */
  dayTotal(
    today: number,
    rows: Array<{ take: Take; before: number; after: number }>,
    w6: string | undefined
  ) {
    return (
      today > 0 &&
      !!w6 &&
      rows.length === 3 &&
      rows.every((x) => x.take?.ok === false && x.take?.words === w6 && x.after === x.before)
    );
  },
  /** A5 */
  realEvent(take: Take, used: number | undefined) {
    return take?.ok === true && take?.counted === false && take?.words === undefined && used === 0;
  },
  /** A9: eight sections, then as A1. */
  emptySections(teams: number, r: Take[], w57: string | undefined, used: number | undefined) {
    return teams === 8 && CHECKS.triesThenRefused(r, 3, w57, used);
  },
  /** A6, A7: five at once with two left. */
  fiveAtOnce(r: Take[], words: string | undefined, used: number | undefined) {
    return (
      !!words &&
      r.length === 5 &&
      r.filter((x) => x?.ok === true && x?.counted === true).length === 2 &&
      r.filter((x) => x?.ok === false).length === 3 &&
      r.filter((x) => x?.ok === false).every((x) => x?.words === words) &&
      used === 3
    );
  },
  /**
   * S1: ai-cap.ts reads items once, through the transaction's client, inside the block of the
   * copy's failed take, after the day's total and before the taken path's return.
   */
  itemReadPlace(src: string) {
    const code = codeOnly(src);
    const reads = indexes(code, '.item.');
    if (reads.length !== 1) return false;
    const at = reads[0];
    const tx = code.indexOf('$transaction(async (tx)');
    const day = code.indexOf('DEMO_AI_WORDS.DAY_USED_UP', tx);
    const block = code.indexOf('if (taken.count === 0) {', tx);
    const allowed = code.indexOf('return { ok: true, counted: true }', tx);
    return (
      tx >= 0 &&
      day > tx &&
      block > day &&
      at > block &&
      allowed > at &&
      code.slice(at - 2, at) === 'tx' &&
      // nothing returns between the block's opening and the read
      !code.slice(block, at).includes('return')
    );
  },
  /**
   * S2 — the six routes are 79d7d7e's; the setup page is the same at 79d7d7e and at the base
   * (GTC-446 itself did not touch it), shows exactly +57 -1 against 79d7d7e, and those changes are
   * exactly GTC-449's five pieces (one fingerprint each, in page order).
   */
  kept(
    exist: boolean[],
    routesStatus: number | null,
    setupNumstat: string,
    baseStatus: number | null,
    pieces: string[]
  ) {
    return (
      exist.length === KEPT.length + 1 &&
      exist.every(Boolean) &&
      routesStatus === 0 &&
      setupNumstat === OUR_NUMSTAT &&
      baseStatus === 0 &&
      pieces.length === OUR_PIECES.length &&
      OUR_PIECES.every((p, i) => pieces[i] === p)
    );
  },
  /** S2's message: which of GTC-449's five setup-page pieces (1 to 5) no longer matches its hash. */
  pieceReport(pieces: string[]) {
    const names = [
      'keptEmailNames',
      'the W9 effect',
      'the decideLater line',
      'the W9 save',
      'the invitationsSent prop',
    ];
    if (pieces.length !== OUR_PIECES.length) {
      return `found ${pieces.length} pieces on the page, want ${OUR_PIECES.length}`;
    }
    const bad = OUR_PIECES.map((p, i) =>
      pieces[i] === p ? '' : `piece ${i + 1} (${names[i]}) changed`
    ).filter(Boolean);
    return bad.length ? bad.join('; ') : 'all 5 pieces match';
  },
  /** Z1 */
  totalsBack(before: Record<string, number>, after: Record<string, number>, left: number) {
    return (
      left === 0 &&
      Object.keys(before).length === TOTALS.length &&
      TOTALS.every((t) => before[t] === after[t])
    );
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

// ── Outside reach, counted and refused in this process ───────────────────────
const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '::']);
const isLocal = (host: unknown) => {
  if (host === undefined || host === null || host === '') return true;
  const h = String(host)
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
  return LOCAL.has(h) || /^127\./.test(h) || /^::ffff:127\./.test(h) || h.endsWith('.localhost');
};
const reach = { outside: 0, fetches: 0 };
function refuseOutside() {
  const refused = (host: unknown) => {
    reach.outside++;
    const e: any = new Error(`[gtc446] refused outside host ${String(host)}`);
    e.code = 'ECONNREFUSED';
    return e;
  };
  const realLookup = dns.lookup;
  (dns as any).lookup = function (host: any, options: any, callback: any) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (!isLocal(host)) {
      const e = refused(host);
      process.nextTick(() => callback(e));
      return {};
    }
    return (realLookup as any).call(dns, host, options, callback);
  };
  const realConnect = net.Socket.prototype.connect;
  (net.Socket.prototype as any).connect = function (this: net.Socket, ...args: any[]) {
    let first = args[0];
    if (Array.isArray(first)) first = first[0];
    let host: unknown;
    let pipe = false;
    if (first && typeof first === 'object') {
      if (first.path) pipe = true;
      host = first.host;
    } else if (typeof first === 'string' && isNaN(Number(first))) {
      pipe = true;
    } else {
      host = typeof args[1] === 'string' ? args[1] : undefined;
    }
    if (!pipe && !isLocal(host)) {
      const e = refused(host);
      process.nextTick(() => this.destroy(e));
      return this;
    }
    return (realConnect as any).apply(this, args);
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    reach.fetches++;
    let host = '';
    try {
      host = new URL(typeof input === 'string' ? input : (input?.url ?? String(input))).hostname;
    } catch {
      host = '';
    }
    if (!isLocal(host)) throw refused(host);
    return realFetch(input, init);
  }) as typeof fetch;
}

async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
  } catch (e) {
    console.log(`    (could not load ${rel}: ${String((e as Error).message).split('\n')[0]})`);
    return null;
  }
}

async function main() {
  if (!CHECKS.localDemoDb(process.env.DATABASE_URL)) {
    console.error('demo-plan-tries: DATABASE_URL does not name gather_demo on this Mac; refused');
    process.exit(2);
  }
  refuseOutside();
  const { prisma } = await import('../src/lib/prisma');
  const COPY = await load('../src/lib/demo/copy');
  const CAP = await load('../src/lib/demo/ai-cap');
  const fx = {
    events: new Set<string>(),
    persons: new Set<string>(),
    users: new Set<string>(),
    teams: new Set<string>(),
    items: new Set<string>(),
  };
  const totals = async () => {
    const out: Record<string, number> = {};
    for (const t of TOTALS) out[t] = await (prisma as any)[t].count();
    return out;
  };
  const before = await totals();

  const take = async (eventId: string, opts?: any): Promise<Take> =>
    CAP?.takeDemoAiCall
      ? await CAP.takeDemoAiCall(prisma, eventId, opts).catch((e: unknown) => ({
          threw: String(e),
        }))
      : null;
  const used = async (eventId: string) =>
    (await prisma.event.findUnique({ where: { id: eventId } }))?.aiCallsUsed;
  /** A copy started in process, as the start route makes one; its rows are noted for teardown. */
  const newCopy = async () => {
    const c = await COPY.startDemoCopy(prisma, { now: new Date() });
    const ev = await prisma.event.findUniqueOrThrow({ where: { id: c.eventId } });
    fx.events.add(ev.id);
    fx.persons.add(ev.hostId);
    fx.users.add(c.userId);
    return ev.id;
  };
  const addTeam = async (eventId: string, name: string) => {
    const t = await prisma.team.create({ data: { name: `${TAG} ${name}`, eventId } });
    fx.teams.add(t.id);
    return t.id;
  };
  const addRow = async (teamId: string, kind: 'ITEM' | 'TASK') => {
    const i = await prisma.item.create({ data: { name: `${TAG} ${kind}`, teamId, kind } });
    fx.items.add(i.id);
    return i.id;
  };
  const taken = async (eventId: string, n: number) => {
    const r: Take[] = [];
    for (let i = 0; i < n; i++) r.push(await take(eventId));
    return r;
  };

  try {
    // ══ P — preconditions ══════════════════════════════════════════════════════
    section('P — preconditions');
    assert(
      'P',
      'P1 DATABASE_URL names the local database gather_demo (address not printed)',
      CHECKS.localDemoDb(process.env.DATABASE_URL)
    );
    const copiesAtStart = await prisma.event.count({
      where: { isDemo: true, host: { user: { email: { endsWith: '@demo-copy.invalid' } } } },
    });
    assert(
      'P',
      'P2 no sample copy at the start',
      CHECKS.noCopies(copiesAtStart),
      `${copiesAtStart} copies`
    );
    const made = `${TAG}-made-up.invalid`;
    const lookup = await new Promise<string>((res) =>
      dns.lookup(made, (e) => res(e ? String(e.message) : 'resolved'))
    );
    const connect = await new Promise<string>((res) => {
      const s = net.connect({ host: made, port: 443 });
      s.on('error', (e) => res(String(e.message)));
      s.on('connect', () => {
        s.destroy();
        res('connected');
      });
    });
    const fetched = await fetch(`https://${made}/`).then(
      () => 'answered',
      (e: Error) => String(e.message)
    );
    reach.outside = 0;
    reach.fetches = 0;
    assert(
      'P',
      'P3 this process cannot reach the AI: no key; a made-up outside host is refused by lookup, connection and fetch',
      CHECKS.noAiReach({ key: process.env.ANTHROPIC_API_KEY, lookup, connect, fetch: fetched }),
      JSON.stringify({ lookup, connect, fetched })
    );

    // ══ W — the words ══════════════════════════════════════════════════════════
    section('W — the words, as the plan wrote them');
    const PW = planWords(read(PLAN));
    assert(
      'W',
      'W1 W5, W6 and W57 in ai-cap.ts word for word as the GTC-392 plan wrote them',
      CHECKS.words(PW, CAP?.DEMO_AI_WORDS),
      JSON.stringify({ plan: PW, cap: CAP?.DEMO_AI_WORDS })
    );

    // ══ A — the refusals ═══════════════════════════════════════════════════════
    section('A — the refusals');
    const a1 = await newCopy();
    const a1r = await taken(a1, 4);
    const a1u = await used(a1);
    assert(
      'A',
      'A1 a copy with no item: three tries taken and counted, the fourth refused in W57’s words, the count 3',
      CHECKS.triesThenRefused(a1r, 3, PW.W57, a1u),
      JSON.stringify({ r: a1r, used: a1u })
    );

    const a2 = await newCopy();
    await addRow(await addTeam(a2, 'Mains'), 'ITEM');
    const a2r = await taken(a2, 4);
    const a2u = await used(a2);
    assert(
      'A',
      'A2 CONTROL a copy with an item: three tries taken, the fourth refused in W5’s words, the count 3',
      CHECKS.triesThenRefused(a2r, 3, PW.W5, a2u),
      JSON.stringify({ r: a2r, used: a2u })
    );

    // Three failed calls: each try taken first, then the real AI function, which fails here before
    // any request leaves (no key in this process; outside hosts refused and counted).
    const a3 = await newCopy();
    const AI = await load('../src/lib/ai/claude');
    const a3takes: Take[] = [];
    const a3errors: string[] = [];
    reach.outside = 0;
    reach.fetches = 0;
    for (let i = 0; i < 3; i++) {
      const t = await take(a3);
      a3takes.push(t);
      if (!t?.ok || !AI?.callClaudeForJSON) continue;
      await AI.callClaudeForJSON('gtc446 probe', 'gtc446 probe', {
        maxTokens: 16,
        callSiteLabel: 'gtc446:probe',
      }).then(
        () => a3errors.push('the call answered'),
        (e: Error) => a3errors.push(String(e?.message))
      );
    }
    const a3reach = { ...reach };
    const [a3items, a3teams] = await Promise.all([
      prisma.item.count({ where: { team: { eventId: a3 } } }),
      prisma.team.count({ where: { eventId: a3 } }),
    ]);
    const a3u = await used(a3);
    const a3fourth = await take(a3);
    assert(
      'A',
      'A3 three FAILED calls on a copy with no item are counted (GTC-237): each failed before any request left (0 outside lookups or connections, 0 fetches), nothing written, the fourth refused in W57’s words',
      CHECKS.failedCallsCounted({
        takes: a3takes,
        errors: a3errors,
        outside: a3reach.outside,
        fetches: a3reach.fetches,
        items: a3items,
        teams: a3teams,
        used: a3u,
        fourth: a3fourth,
        w57: PW.W57,
      }),
      JSON.stringify({
        takes: a3takes,
        errors: a3errors,
        reach: a3reach,
        items: a3items,
        teams: a3teams,
        used: a3u,
        fourth: a3fourth,
      })
    );

    // The day's total, reached by hand: today's sum, read now, is the day's number.
    const a4fresh = await newCopy();
    const today = CAP?.demoAiUsedToday ? await CAP.demoAiUsedToday(prisma) : -1;
    const dayLimits = { limits: { perCopy: 3, perDay: today } };
    const a4rows = [];
    for (const id of [a4fresh, a1, a2]) {
      const b = (await used(id)) ?? -1;
      const t = await take(id, dayLimits);
      a4rows.push({ take: t, before: b, after: (await used(id)) ?? -2 });
    }
    assert(
      'A',
      'A4 the day’s total reached: W6 for a copy with no item and tries left, one with no item and none left, and one with an item; none counted',
      CHECKS.dayTotal(today, a4rows, PW.W6),
      JSON.stringify({ today, rows: a4rows })
    );

    const host = await prisma.person.create({
      data: { name: `${TAG} host`, email: `host-${RUN}@gtc446.invalid` },
    });
    fx.persons.add(host.id);
    const day = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    const real = await prisma.event.create({
      data: { name: `${TAG} real`, startDate: day, endDate: day, hostId: host.id },
    });
    fx.events.add(real.id);
    const a5 = await take(real.id);
    const a5u = await used(real.id);
    assert(
      'A',
      'A5 CONTROL a real event: allowed, not counted, no words, its own count untouched',
      CHECKS.realEvent(a5, a5u),
      JSON.stringify({ take: a5, used: a5u })
    );

    const a6 = await newCopy();
    await prisma.event.update({ where: { id: a6 }, data: { aiCallsUsed: 1 } });
    const a6r = await Promise.all([0, 1, 2, 3, 4].map(() => take(a6)));
    const a6u = await used(a6);
    assert(
      'A',
      'A6 five presses at once on a copy with no item and one used: two taken, three refused, all in W57’s words, the count 3',
      CHECKS.fiveAtOnce(a6r, PW.W57, a6u),
      JSON.stringify({ r: a6r, used: a6u })
    );

    const a7 = await newCopy();
    await addRow(await addTeam(a7, 'Sides'), 'ITEM');
    await prisma.event.update({ where: { id: a7 }, data: { aiCallsUsed: 1 } });
    const a7r = await Promise.all([0, 1, 2, 3, 4].map(() => take(a7)));
    const a7u = await used(a7);
    assert(
      'A',
      'A7 CONTROL the same on a copy with an item: two taken, three refused, all in W5’s words, the count 3',
      CHECKS.fiveAtOnce(a7r, PW.W5, a7u),
      JSON.stringify({ r: a7r, used: a7u })
    );

    const a8 = await newCopy();
    await addRow(await addTeam(a8, 'Jobs'), 'TASK');
    const a8r = await taken(a8, 4);
    const a8u = await used(a8);
    assert(
      'A',
      'A8 a copy whose only row is a task row has a plan (O1): the fourth refused in W5’s words',
      CHECKS.triesThenRefused(a8r, 3, PW.W5, a8u),
      JSON.stringify({ r: a8r, used: a8u })
    );

    const a9 = await newCopy();
    for (let i = 1; i <= 8; i++) await addTeam(a9, `Section ${i}`);
    const a9r = await taken(a9, 4);
    const a9u = await used(a9);
    const a9teams = await prisma.team.count({ where: { eventId: a9 } });
    assert(
      'A',
      'A9 a copy with eight empty sections and no item has no plan (O1): the fourth refused in W57’s words',
      CHECKS.emptySections(a9teams, a9r, PW.W57, a9u),
      JSON.stringify({ r: a9r, used: a9u, teams: a9teams })
    );

    const a10 = await newCopy();
    const gone = await addRow(await addTeam(a10, 'Desserts'), 'ITEM');
    await prisma.item.delete({ where: { id: gone } });
    fx.items.delete(gone);
    const a10r = await taken(a10, 4);
    const a10u = await used(a10);
    assert(
      'A',
      'A10 a copy whose one item was removed has no plan (O1): the fourth refused in W57’s words',
      CHECKS.triesThenRefused(a10r, 3, PW.W57, a10u),
      JSON.stringify({ r: a10r, used: a10u })
    );

    // ══ S — the source ═════════════════════════════════════════════════════════
    section('S — the source');
    assert(
      'S',
      'S1 ai-cap.ts reads items once, through the transaction, only after the copy’s own take fails (after the day’s total; none on the taken path) (O2, O3)',
      CHECKS.itemReadPlace(read(AI_CAP))
    );
    const git = (...a: string[]) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
    const routes = git('diff', '--quiet', PARENT, '--', ...KEPT);
    const numstat = git('diff', '--numstat', PARENT, '--', SETUP);
    const sameAtBase = git('diff', '--quiet', PARENT, BASE, '--', SETUP);
    const pieces = setupPieceHashes();
    assert(
      'S',
      'S2 the six AI routes are byte for byte as at 79d7d7e; the setup page is as at 79d7d7e (and at the base 128b341) plus exactly GTC-449’s five pieces (+57 -1)',
      CHECKS.kept(
        [...KEPT, SETUP].map((f) => fs.existsSync(path.join(ROOT, f))),
        routes.status,
        String(numstat.stdout),
        sameAtBase.status,
        pieces
      ),
      `routes ${routes.status}, numstat ${JSON.stringify(String(numstat.stdout).trim())}, base ${sameAtBase.status}, ${CHECKS.pieceReport(pieces)}`
    );
  } catch (e) {
    assert('X', 'the suite ran to its end', false, String((e as Error).message).slice(0, 300));
  } finally {
    // ══ Z — teardown ═══════════════════════════════════════════════════════════
    section('Z — teardown');
    await prisma.item.deleteMany({ where: { id: { in: [...fx.items] } } });
    await prisma.team.deleteMany({ where: { id: { in: [...fx.teams] } } });
    await prisma.event.deleteMany({ where: { id: { in: [...fx.events] } } });
    await prisma.person.deleteMany({ where: { id: { in: [...fx.persons] } } });
    await prisma.session.deleteMany({ where: { userId: { in: [...fx.users] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...fx.users] } } });
    const left =
      (await prisma.event.count({ where: { id: { in: [...fx.events] } } })) +
      (await prisma.person.count({ where: { id: { in: [...fx.persons] } } })) +
      (await prisma.user.count({ where: { id: { in: [...fx.users] } } }));
    const after = await totals();
    assert(
      'Z',
      'Z1 every probe row removed by id; the totals as at the start',
      CHECKS.totalsBack(before, after, left),
      JSON.stringify({ left, before, after })
    );
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('\nRed:');
    for (const r of reds) console.log(`  ${r}`);
  }
  process.exit(failed ? 1 : 0);
}

if (!process.env.DEMO_PLAN_TRIES_DRY_RUN) void main();
