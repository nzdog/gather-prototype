# GATHER-KNOWN-BEHAVIOURS.md
# Confirmed platform quirks and diagnostic patterns for AI executors.
# Read this file when a ticket involves unexpected platform behaviour,
# stale UI state, auth anomalies, or DB irregularities.
# Last updated: 2026-09-09

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
