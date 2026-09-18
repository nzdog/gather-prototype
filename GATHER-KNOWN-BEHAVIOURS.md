# GATHER-KNOWN-BEHAVIOURS.md
# Confirmed platform quirks and diagnostic patterns for AI executors.
# Read this file when a ticket involves unexpected platform behaviour,
# stale UI state, auth anomalies, or DB irregularities.
# Last updated: 2026-09-18

---

## How to Use This File
Each entry documents a confirmed platform behaviour that is NOT a bug in
Gather but may be misdiagnosed as one. Before touching auth, session,
middleware, or DB code to fix an unexpected behaviour, check this file.

Entries follow this format:
- Symptom: what the executor observes
- Cause: why it happens
- Fix pattern: the correct resolution approach
- Do not: what not to do
- First seen: ticket reference

---

## Known Behaviours

### KB-001 — Next.js RSC prefetch causes stale auth-dependent UI
**Symptom:** Nav or other server-rendered UI shows stale auth state
(e.g. "Sign In" instead of user email) on routes accessed via Next.js
`<Link>` prefetch.
**Cause:** Next.js prefetches RSC payloads for routes linked via `<Link>`.
When the user navigates to a prefetched route, Next.js serves the cached
payload without re-running server components — so session-dependent
functions like `getUser()` do not fire and auth-dependent UI appears stale.
This is expected Next.js behaviour, not a Gather bug.
**Fix pattern:** Call `router.refresh()` after auth state changes to force
a fresh server render. Apply at the route level only.
**Do not:** Touch auth, session, middleware, or cookie logic to resolve this.
**First seen:** GTC-002

---

### KB-002 — DB schema drift (P3005) ✓ RESOLVED
**Symptom:** `npm run db:migrate` reports schema drift — DB schema is ahead
of migration history.
**Cause:** Pre-existing condition. Schema was modified outside the migration
system at some point. DB is functional and all security tests pass.
**Fix pattern:** Do not attempt to resolve during bug fix tickets unless
the ticket explicitly authorises a migration fix with rollback plan.
**Do not:** Run `prisma migrate reset` or alter migration files to resolve.
This is a chore-level issue requiring explicit authorisation.
**First seen:** GTC-002 preflight
**Resolved:** 2026-03-14. Production `npx prisma migrate status` returned clean —
all 15 migrations applied, no drift, no pending migrations. `prisma migrate dev`
is now safe to use.

---

### KB-003 — window.history.replaceState() does not update Next.js useSearchParams()
**Symptom:** A URL param that was removed via window.history.replaceState()
reappears in searchParams when a handler builds a new URL from the current
params, re-triggering effects that depend on that param.
**Cause:** window.history.replaceState() updates the browser URL but does
not sync Next.js useSearchParams() state. Handlers that build URLs by
copying current searchParams will carry stale params forward.
**Fix pattern:** When building a navigation URL from searchParams, always
explicitly call params.delete() on any param that should not persist before
calling router.push(). Do not rely on the browser URL as the source of
truth for searchParams state.
**Do not:** Use window.history.replaceState() to manage params that affect
Next.js effect hooks or URL-derived state.
**First seen:** GTC-003

---

### KB-004 — Default seed creates a CONFIRMING event, not a DRAFT event
**Symptom:** Reproduction steps requiring a DRAFT event fail when run
against the default seed — the seeded event is in CONFIRMING status.
**Cause:** prisma/seed.ts creates an event in CONFIRMING state by default.
DRAFT events from prior test sessions may exist in the DB but cannot be
relied upon.
**Fix pattern:** For tickets requiring a DRAFT event, either:
1. Create the event via UI steps (pay → complete setup modal), or
2. Direct DB insert to set status to DRAFT (include rollback note), or
3. Update seed.ts to include a DRAFT event (only if authorised by ticket).
**Do not:** Assume default seed produces a DRAFT event. Always verify
event status before beginning reproduction steps.
**First seen:** GTC-003

---

### KB-005 — `.next` has ONE OWNER at a time: sharing it with `npm run build` gives a FALSE FAILURE, either direction
**The rule, stated generally:** `npm run dev` (Turbopack) and `npm run build`
both own `.next`, and neither tolerates the other writing it. Whichever runs
second wins the directory and the first is left reading files that are gone.
**Both directions produce a failure that reads exactly like a defect in the
code just written**, and neither names `.next` in its error.

**⚠ Direction 2 was found on 2026-09-12 (GTC-264 Phase 1) and is the more
dangerous of the two, because the build reports success before it fails.**

---

**DIRECTION 1 — the build breaks the running dev server.**

**Symptom:** After `npm run build` is run while `npm run dev` is up, every
route 500s with `ENOENT` on `.next/server/.../app-build-manifest.json`, and
any HTTP-driven suite reports failures that look exactly like a defect in the
code just written. Measured 2026-09-09: `test:glance-actions` reported
**42 passed, 20 failed** immediately after a green build, with nothing in the
working tree changed between the two runs. Probing the guarded glance route
directly gave **500** before a restart and **401** (the correct unauthenticated
answer) after it; the suite then returned to **62 passed, 0 failed**.

**Cause:** The production build REWRITES `.next` underneath the live Turbopack
dev server, which is still holding the previous build's manifests. The dev
server does not notice and does not recover on its own. A regenerated Prisma
client has the same shape of problem for the same reason: a dev server started
before `npx prisma generate` keeps the old client in memory.

---

**DIRECTION 2 — the running dev server breaks the build.** Found 2026-09-12,
GTC-264 Phase 1.

**Symptom:** `npm run build` with a Turbopack dev server up fails **after
reporting success**:

```
✓ Compiled successfully in 4.8s
   Checking validity of types ...
   Collecting page data ...
unhandledRejection Error: Cannot find module '../chunks/ssr/[turbopack]_runtime.js'
Require stack:
- .next/server/pages/_document.js
  code: 'MODULE_NOT_FOUND'
```

**Why this one is worse.** *Compiled successfully* arrives first, so the
failure looks like a real problem discovered downstream of a good compile —
a bad import, a missing dependency, a broken generated client.
`MODULE_NOT_FOUND` on a path inside `.next` invites deleting `node_modules`
or re-running
`prisma generate`, neither of which is the cause. **Nothing in the message says
`.next` is contended.**

**Cause:** the dev server's Turbopack artefacts are in `.next`, and the
production build's page-data collection loads `.next/server/pages/_document.js`
— which is the dev server's, and which requires a Turbopack runtime chunk the
build did not write.

**Proof it is environmental and not the change:** with the dev server stopped
and `.next` removed, the identical tree builds and exits 0. GTC-264 Phase 1
recorded this against an otherwise green typecheck, `test:security` 157/157 and
`test:security:routes` 118/118.

---

**Fix pattern — the safe sequence, in this order:**

1. **Build with no dev server running**, and remove `.next` first if a dev
   server has been up since the last build.
2. **Restart the dev server** — after ANY of `npm run build`,
   `npx prisma generate`, `npx prisma migrate deploy`.
3. **Probe** before trusting a suite. Ask a guarded route for its auth refusal
   rather than asking whether the server answers at all:

```
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/events/none/glance
# 401 = healthy.  500 = stale build.  000 = not running.
```

4. **Then** run the HTTP-driven suites.

`tests/glance-actions-test.ts` already probes for exactly this and calls it a
health check; the probe is the pattern, not the exception.

**Do not:** Debug the code first, in either direction. A suite that was green
minutes ago and is red after a build is direction 1 — check the probe before
reading the failures. A build that compiles and then dies on
`MODULE_NOT_FOUND` inside `.next` is direction 2 — stop the dev server, remove
`.next`, and build again before touching `node_modules`, the imports, or the
Prisma client. And do not run `npm run build` mid-session with a dev server up
unless you intend to restart it.

**First seen:** Direction 1 — GTC-192 phase 3 (flagged, not filed), hit again
in phase 4 (flagged again), and a third time in phase 6 slice 6a, where it cost
a misread suite result before being recognised. Filed on the third occurrence.
Direction 2 — GTC-264 Phase 1, 2026-09-12, found on the first build after a
migration was applied; recognised immediately because direction 1 was already
filed here, which is the whole value of the entry.

---

### KB-006 — A source file git calls binary: a literal control byte written where an escape was meant
**Symptom:** A `.ts` file runs, passes every assertion, and reads normally in
an editor, but `git diff --stat` shows `Bin` for it (`Bin 0 -> 58454 bytes`)
and every diff of it is unreadable. `file <path>` says `data` instead of text.
Nothing fails, so nothing warns you — the file is pushed that way.
**Cause:** git treats a file with a NUL byte in it as binary. Here the NUL
was an escape for NUL (a string separator) written into the file as the
literal byte rather than as the escape's characters. The byte is invisible in
the editor, in tool output and in review.
**Find it:**

```
LC_ALL=C grep -n -a -P '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' <file>
file <file>    # "data" means a control byte is in it
```

**Fix pattern:** remove the byte and do not reintroduce the escape — compare
lists with `JSON.stringify(sorted)`, or join on a printable character that
cannot occur in the data. Confirm with `file <path>` and with
`git grep -I -c . HEAD -- <path>`, which skips binary files and so prints a
count only for text.
**Do not:** Look for the cause in `.gitattributes`, line endings or encoding —
the file is valid UTF-8 apart from the one byte. And do not trust a green suite
as evidence the file is fine; the byte changed no behaviour.
**First seen:** GTC-189 slice 3, 2026-09-13 — `tests/ask-preview-test.ts`,
committed in `87741d7`, fixed in `5adfc28`.

---

### KB-007 — A search filtered by the NEW name discards the one line carrying BOTH, which is where a legacy read hides
**Symptom:** A `grep` written to enumerate every remaining use of an old
name returns a short, clean list, and the list is wrong. The migration or
deprecation proceeds on it, and the sites it missed are found later by a
compiler error, a failing test, or not at all. Nothing in the output looks
incomplete — a short list is the result you were hoping for.
**Cause:** The search was narrowed by SUBTRACTING the new name to cut noise:

```
grep -rn 'person\.phone' src/ | grep -v phoneNumber      # WRONG
```

`person.phoneNumber` and `person.phone` share a prefix, so the first grep
matches both and the `-v` was added to drop the new-name hits. But a
transitional site reads **both on one line** — `person.phoneNumber || person.phone`
— and that line contains the new name, so `-v` deletes it. **The exact
shape you are hunting is the exact shape the filter removes.**
**Find it:** narrow with a regex instead of subtracting lines, so a line
holding both is still matched on the half that matters:

```
grep -rnE 'person\.phone\b' src/          # \b already excludes phoneNumber
grep -rnP 'person\.phone\b(?!Number)' src/ # explicit, when the prefix is ambiguous
```

**Fix pattern:** for a rename or column unification, do not trust any
hand-written search as the site list. Write a structural test that WALKS the
tree and asserts the absence, and let it discover the sites. In GTC-312 the
walk found three reads that both the ticket's filed list and the executor's
grep had missed, one of them a channel choice rather than a display, and
`tsc --noEmit` then found a fourth that no grep would have caught.
**Do not:** treat a short result as a small job. And do not add `-v <newname>`
to any search whose purpose is to find the old name — the transitional line is
the finding.
**First seen:** GTC-312, 2026-09-18 — `Person.phone` vs `Person.phoneNumber`,
fixed in `473deba`. Same family as KB-005 and the two findings at GTC-189
ruling AH and its slice 5 shape proposal: a check whose output is evidence
about the check as much as about the code.

---
