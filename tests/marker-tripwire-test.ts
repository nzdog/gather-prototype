/**
 * [[GTC-449]] S1.6 — THE TRIPWIRE. No file that sends, makes links, mints tokens or counts people may
 * name the "decide later" marker `PersonEvent.messagingUndecided`.
 *
 * WHY THIS TEST EXISTS, IN PLAIN WORDS.
 *   The marker is the host's own note to herself: "I have not decided whether Gather may message this
 *   child." It is saved so her screens can show the choice back to her. It is NOT a rule. A child on
 *   "decide later" is a CHILD in every sense that matters to a message, a link or a head count: the
 *   role `householdRole` is the sole gate (Moment 4 §10.6, absolute), and it stays CHILD. If any code
 *   that decides who is messaged, linked or counted ever read the marker, a child on "decide later"
 *   could be treated differently from other children, and a number the host never chose to use could
 *   leave the building. So the code that decides must never be able to see the marker.
 *
 * WHY STAGE 2's CODE MAY NAME THE MARKER AND THE GATE FILES MAY NOT.
 *   Stage 2's save routes, household form, household card and pre-flight page are the host's own
 *   screens. They WRITE the marker when she picks "Decide later", READ it back so the choice shows
 *   when she reopens the household, and print the read-only pre-flight line. None of that sends a
 *   message, makes a link, or counts a head: it only remembers and shows what she chose. The gate
 *   files are the opposite. They DECIDE who is messaged, who gets a link and who is counted. Naming
 *   the marker there would be the first step to using it as an input to a decision. Those two lists
 *   are kept apart below, and a test (P4) refuses a file on both.
 *
 *   P  the list is real: every listed file exists, every folder holds files, no file is listed twice,
 *      and no Stage 2 screen is on the gate list
 *   G  the gate files: none of them names the marker, in code or in a comment
 *   K  positive controls: the scan finds the marker where it should (the schema, the migration, and
 *      the spellings a careless edit might use) and finds nothing in ordinary child-rule text
 *   B  break proofs: for EVERY gate file, the same scan on an in-memory copy of that file with the
 *      marker injected (at the top, in the middle, at the end) goes RED. No real file is touched.
 *
 *   A green result on the day this was written proves little, which is why B and K exist: they show
 *   the scan can see the marker, in every file it guards, so a green G means something.
 *
 * LIMITS, stated plainly. The scan looks for the name. It cannot see a row spread (`...personEvent`) or
 * a field built from pieces of text. It does not need a database, a server or a network.
 *
 * Run: npx tsx tests/marker-tripwire-test.ts      (npm run test:marker-tripwire)
 * To prove the whole test can go red, point it at a scratch copy of the tree outside the repo:
 *   TRIPWIRE_ROOT=<folder holding src/ and prisma/> npx tsx tests/marker-tripwire-test.ts
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.env.TRIPWIRE_ROOT
  ? path.resolve(process.env.TRIPWIRE_ROOT)
  : path.join(__dirname, '..');
const MARKER = 'messagingUndecided';
const SCHEMA = 'prisma/schema.prisma';
const MIGRATION =
  'prisma/migrations/20261102205933_gtc449_person_event_messaging_undecided/migration.sql';

/** Every .ts/.tsx/.js/.mjs file under these folders is scanned, including any file added later. */
const GATE_DIRECTORIES = [
  'src/lib/eligibility',
  'src/lib/press',
  'src/lib/sms',
  'src/lib/glance',
  'src/lib/email-delivery',
  'src/app/api/cron',
] as const;

/** Every one of these must exist. A missing file fails the test, so a rename cannot quietly shrink the list. */
const GATE_FILES = [
  // src/lib/eligibility (12 files at the time of writing)
  'src/lib/eligibility/carried-answer.ts',
  'src/lib/eligibility/channel-chooser.ts',
  'src/lib/eligibility/chase-when-no-mobile.ts',
  'src/lib/eligibility/child-exclusion.ts',
  'src/lib/eligibility/email-block-words.ts',
  'src/lib/eligibility/email-block.ts',
  'src/lib/eligibility/email-opt-out.ts',
  'src/lib/eligibility/host-exclusion.ts',
  'src/lib/eligibility/nudge-mark.ts',
  'src/lib/eligibility/nudge-pace.ts',
  'src/lib/eligibility/shared-link-exposure.ts',
  'src/lib/eligibility/text-block.ts',
  // src/lib/press (5 files at the time of writing)
  'src/lib/press/dispatch.ts',
  'src/lib/press/press-words.ts',
  'src/lib/press/press.ts',
  'src/lib/press/resend-door.ts',
  'src/lib/press/resend.ts',
  // src/lib/sms (27 files at the time of writing)
  'src/lib/sms/decide-by-eligibility.ts',
  'src/lib/sms/decide-by-scheduler.ts',
  'src/lib/sms/decide-by-sender.ts',
  'src/lib/sms/manual-nudge-recipient.ts',
  'src/lib/sms/nudge-eligibility.ts',
  'src/lib/sms/nudge-scheduler.ts',
  'src/lib/sms/nudge-sender.ts',
  'src/lib/sms/nudge-templates.ts',
  'src/lib/sms/opt-out-keywords.ts',
  'src/lib/sms/opt-out-line.ts',
  'src/lib/sms/opt-out-service.ts',
  'src/lib/sms/quiet-hours.ts',
  'src/lib/sms/send-sms.ts',
  'src/lib/sms/text-failure-words.ts',
  'src/lib/sms/text-outcome.ts',
  'src/lib/sms/text-send-record.ts',
  'src/lib/sms/tnz-account-alert.ts',
  'src/lib/sms/tnz-client.ts',
  'src/lib/sms/tnz-delivery-contract.ts',
  'src/lib/sms/tnz-delivery-record.ts',
  'src/lib/sms/tnz-reply-contract.ts',
  'src/lib/sms/tnz-reply-record.ts',
  'src/lib/sms/tnz-status-contract.ts',
  'src/lib/sms/tnz-status-poll.ts',
  'src/lib/sms/tnz-webhook-envelope.ts',
  'src/lib/sms/twilio-client.ts',
  'src/lib/sms/wrap-up-templates.ts',
  // src/lib/glance (11 files at the time of writing)
  'src/lib/glance/actions.ts',
  'src/lib/glance/chase-fact.ts',
  'src/lib/glance/delivery-fact.ts',
  'src/lib/glance/email-note.ts',
  'src/lib/glance/live.ts',
  'src/lib/glance/read.ts',
  'src/lib/glance/replay-entry.ts',
  'src/lib/glance/replay.ts',
  'src/lib/glance/rewind.ts',
  'src/lib/glance/state.ts',
  'src/lib/glance/text-note.ts',
  // src/lib/email-delivery (3 files at the time of writing)
  'src/lib/email-delivery/delivery-poll.ts',
  'src/lib/email-delivery/resend-delivery-contract.ts',
  'src/lib/email-delivery/resend-error-contract.ts',
  // src/app/api/cron (7 files at the time of writing)
  'src/app/api/cron/cron-response.ts',
  'src/app/api/cron/cron-secret.ts',
  'src/app/api/cron/decide-by-followups/route.ts',
  'src/app/api/cron/nudges/route.ts',
  'src/app/api/cron/outbound-dispatch/route.ts',
  'src/app/api/cron/tnz-status-poll/route.ts',
  'src/app/api/cron/wrap-up-dispatch/route.ts',
  // sends or composes what is sent
  'src/lib/wrap-up.ts',
  'src/lib/messages/ask-register.ts',
  'src/lib/chase-hand-back.ts',
  'src/lib/send-health.ts',
  'src/lib/preflight/ask-preview.ts',
  'src/lib/preflight/ask-preview-compose.ts',
  'src/lib/preflight/chase-choice.ts',
  'src/lib/preflight/test-email.ts',
  'src/lib/preflight/test-email-send.ts',
  'src/app/api/events/[id]/send/route.ts',
  'src/app/api/h/[token]/send/route.ts',
  'src/app/api/events/[id]/people/[personId]/nudge/route.ts',
  'src/app/api/events/[id]/people/[personId]/resend/route.ts',
  'src/app/api/events/[id]/wrap-up/route.ts',
  'src/app/api/events/[id]/pre-flight/message/route.ts',
  // makes links, mints tokens, or exposes a family to a stranger
  'src/lib/tokens.ts',
  'src/app/api/events/[id]/tokens/route.ts',
  'src/app/api/events/[id]/invite-status/route.ts',
  'src/app/api/gather/[eventId]/directory/route.ts',
  'src/app/api/join/[token]/claim/route.ts',
  // decides a contact, a channel or a carrier
  'src/lib/contact/contact-fix.ts',
  'src/lib/households/channel.ts',
  // counts people
  'src/lib/ai/plan-input.ts',
  'src/lib/moment3/people.ts',
  'src/components/glance/strip.ts',
] as const;

/**
 * The host's own screens, which Stage 2 is allowed to let name the marker. Listed so the two lists
 * stay apart: none of these may also be a gate file (P4).
 */
const STAGE2_SCREENS = [
  'src/lib/households/reconcileMembers.ts',
  'src/lib/households/hostHousehold.ts',
  'src/lib/households/form-draft.ts',
  'src/app/api/events/[id]/households/route.ts',
  'src/app/api/events/[id]/households/[householdId]/route.ts',
  'src/app/api/events/[id]/host-household/route.ts',
  'src/app/api/events/[id]/pre-flight/route.ts',
  'src/app/plan/[eventId]/setup/page.tsx',
  'src/app/plan/[eventId]/pre-flight/page.tsx',
  'src/components/plan/Moment1InputForm.tsx',
  'src/components/plan/HouseholdCardList.tsx',
  'src/components/plan/household-channel-choices.ts',
  'src/components/preflight/PreflightStep.tsx',
  'src/components/preflight/kids-note.ts',
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

// ── CHECKS: every condition, pure, so each can be tried on a passing and a failing input ─────
const CHECKS = {
  /** True when the text names the marker: any case, with or without an underscore. */
  names(text: string): boolean {
    return /messaging_?undecided/i.test(text);
  },
  /** The text with the marker put in, three ways: at the top, in the middle, at the end. */
  injected(text: string): { where: string; text: string }[] {
    const lines = text.split('\n');
    const mid = Math.floor(lines.length / 2);
    return [
      { where: 'top', text: `// ${MARKER}\n${text}` },
      {
        where: 'middle',
        text: [...lines.slice(0, mid), `void row.${MARKER};`, ...lines.slice(mid)].join('\n'),
      },
      { where: 'end', text: `${text}\nconst tripwireProbe = row.${MARKER};\n` },
    ];
  },
  /** model PersonEvent's body, from `model PersonEvent {` to the first line that is `}`. */
  personEventModel(schema: string): string {
    const lines = schema.split('\n');
    const at = lines.indexOf('model PersonEvent {');
    if (at < 0) return '';
    const end = lines.indexOf('}', at);
    return end < 0 ? '' : lines.slice(at, end + 1).join('\n');
  },
  /** The listed paths for which `exists` says no. */
  missing(files: readonly string[], exists: (rel: string) => boolean): string[] {
    return files.filter((f) => !exists(f));
  },
  /** Paths that appear more than once. */
  duplicates(files: readonly string[]): string[] {
    return files.filter((f, i) => files.indexOf(f) !== i);
  },
  /** Paths on both lists. */
  overlap(a: readonly string[], b: readonly string[]): string[] {
    return a.filter((f) => b.includes(f));
  },
};

// ── The files ────────────────────────────────────────────────────────────────
const abs = (rel: string) => path.join(ROOT, rel);
const exists = (rel: string) => {
  try {
    return fs.statSync(abs(rel)).isFile();
  } catch {
    return false;
  }
};
const read = (rel: string) => {
  try {
    return fs.readFileSync(abs(rel), 'utf8');
  } catch {
    return '';
  }
};
/** Source files under a folder, recursive: .ts, .tsx, .js, .mjs. */
function sourceFilesUnder(rel: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const next = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(next);
      else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) out.push(next);
    }
  };
  walk(rel);
  return out.sort();
}

// Everything that is scanned: the listed files, and whatever else now sits in the gate folders.
const fromFolders = GATE_DIRECTORIES.flatMap((d) => sourceFilesUnder(d));
const SCANNED = Array.from(new Set<string>([...GATE_FILES, ...fromFolders])).sort();

// ── P — the list is real ─────────────────────────────────────────────────────
function layerP() {
  section('P — the list is real');
  const gone = CHECKS.missing(GATE_FILES, exists);
  assert(
    'P',
    `P1 all ${GATE_FILES.length} listed gate files exist`,
    gone.length === 0,
    `missing: ${gone.join(', ')}`
  );
  const empty = GATE_DIRECTORIES.filter((d) => sourceFilesUnder(d).length === 0);
  assert(
    'P',
    `P2 all ${GATE_DIRECTORIES.length} gate folders exist and hold source files`,
    empty.length === 0,
    `empty or missing: ${empty.join(', ')}`
  );
  const dup = CHECKS.duplicates(GATE_FILES);
  assert('P', 'P3 no file is listed twice', dup.length === 0, `twice: ${dup.join(', ')}`);
  const both = CHECKS.overlap(GATE_FILES, STAGE2_SCREENS);
  assert(
    'P',
    'P4 no Stage 2 screen is also a gate file (the two lists stay apart)',
    both.length === 0,
    `on both lists: ${both.join(', ')}`
  );
  assert(
    'P',
    `P5 the scan covers ${SCANNED.length} files in all (the list plus whatever else is in the gate folders)`,
    SCANNED.length >= GATE_FILES.length
  );
}

// ── G — no gate file names the marker ────────────────────────────────────────
function layerG() {
  section('G — no gate file names the marker');
  const offenders = SCANNED.filter((f) => CHECKS.names(read(f)));
  assert(
    'G',
    `G1 none of the ${SCANNED.length} scanned files names ${MARKER}`,
    offenders.length === 0,
    `names it: ${offenders.join(', ')}`
  );
  const noText = SCANNED.filter((f) => exists(f) && read(f).length === 0);
  assert(
    'G',
    'G2 every scanned file was read (none was empty or unreadable, so G1 saw its text)',
    noText.length === 0,
    `empty: ${noText.join(', ')}`
  );
}

// ── K — positive controls ────────────────────────────────────────────────────
function layerK() {
  section('K — positive controls: the scan can see the marker');
  const schema = read(SCHEMA);
  assert('K', 'K1 the schema file names the marker', CHECKS.names(schema));
  const model = CHECKS.personEventModel(schema);
  assert(
    'K',
    'K2 it is inside model PersonEvent, as a Boolean with a default',
    new RegExp(`^\\s+${MARKER}\\s+Boolean\\s+@default\\(false\\)\\s*$`, 'm').test(model)
  );
  assert('K', 'K3 the migration SQL names the marker', CHECKS.names(read(MIGRATION)));
  assert(
    'K',
    'K4 the scan sees the other spellings a careless edit might use',
    [
      'row.messagingUndecided',
      'messaging_undecided',
      'MESSAGING_UNDECIDED',
      'messagingundecided',
      "pe['messagingUndecided']",
      '// messagingUndecided',
      '"messagingUndecided" boolean',
    ].every((s) => CHECKS.names(s))
  );
  assert(
    'K',
    'K5 the scan stays quiet on ordinary child-rule text (no false alarm)',
    [
      "householdRole === 'CHILD'",
      'isYoungPerson',
      'a child who is undecided',
      'messaging a child',
      'decide later',
      'isChildMembership(pe)',
    ].every((s) => !CHECKS.names(s))
  );
  assert(
    'K',
    'K6 the list check can go red: a listed path that is not a file is reported',
    // a stand-in for "does the file exist", so this proves the checker and not the real tree
    CHECKS.missing(['src/a.ts', 'src/b.ts'], (rel) => rel === 'src/a.ts').join() === 'src/b.ts'
  );
  assert(
    'K',
    'K7 the overlap check can go red: a file on both lists is reported',
    CHECKS.overlap([...GATE_FILES, STAGE2_SCREENS[0]], STAGE2_SCREENS).join() === STAGE2_SCREENS[0]
  );
}

// ── B — break proofs, one per gate file, on in-memory copies ─────────────────
function layerB() {
  section('B — break proofs: the marker put into an in-memory copy of each gate file goes red');
  for (const f of SCANNED) {
    const text = read(f);
    const copies = CHECKS.injected(text);
    const allRed = copies.every((c) => c.text !== text && CHECKS.names(c.text));
    const cleanStaysGreen = !CHECKS.names(text);
    assert(
      'B',
      `B ${f}: top, middle and end injections all go red`,
      text.length > 0 && allRed,
      text.length === 0
        ? 'the file is missing or empty, so there is nothing to inject the marker into (see P1)'
        : `a copy with the marker in it was not caught (${copies
            .filter((c) => !CHECKS.names(c.text))
            .map((c) => c.where)
            .join(', ')})`
    );
    if (!cleanStaysGreen) {
      // keeps the proof honest: a file that already names it is reported by G1, not hidden here
      console.log(`    (note: ${f} already names the marker; see G1)`);
    }
  }
}

layerP();
layerG();
layerK();
layerB();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\n\x1b[31mRED — ${failed} check(s) failed:\x1b[0m`);
  for (const r of reds) console.log(`  ✗ ${r}`);
  process.exit(1);
}
console.log(
  `\x1b[32mGREEN — no gate file names ${MARKER}; the scan was shown to catch it in each of the ${SCANNED.length} files.\x1b[0m`
);
