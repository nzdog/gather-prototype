

Quick verdict
	•	Audit report: mostly accurate, but it misses the two real failure modes: idempotency/duplicate tokens and returning/displaying existing tokens (your planned generator currently fails this).
	•	Planned prompt: will likely “work” in the happy path, but it contains a correctness bug, a security footgun, and an architecture smell that will become debt.

Below is the blunt review.

⸻

1) Review of the audit report

What’s solid
	•	Correctly identifies the main gap: tokens are only in seed; nothing generates them on Plan→Confirming.
	•	Correctly maps existing route scope flows and resolveToken() behavior.
	•	Correctly notes cleanup on person removal is already handled (good catch).

What the audit misses (important)

A) Idempotency + duplicates
Your system currently relies on “findFirst then create” logic. That is not safe under concurrency (two transitions, retried requests, parallel calls, multiple server instances). You can easily end up with duplicate tokens per person/event/scope. Tests will not catch it reliably.

Smallest control: enforce DB uniqueness for tokens per scope:
	•	Add a composite unique constraint (recommended) like:
	•	(eventId, personId, scope, teamId) (teamId null treated carefully)
	•	or simplify model: one token per (eventId, personId, scope) and coordinators include teamId in token claims differently.

Without a DB constraint, your code truth layer is fake here.

B) “Coordinator is also a participant”
The audit flags role→scope ambiguity but doesn’t push it to a decision. You must decide:
	•	Does a coordinator also need a participant token?
If yes: they’ll have two URLs, two views.
	•	Or do you let coordinator view include “my assignments”, making participant token redundant? (It already does “personal assignments.”)

Senior recommendation: coordinators do not need participant tokens. Coordinator view already shows their assignments. Fewer tokens, less confusion, less leakage.

C) Token lifecycle when team coordinator changes
If a coordinator is reassigned:
	•	existing coordinator token remains valid unless revoked/deleted.
	•	resolveToken() validates teamId matches PersonEvent.teamId (good), but if coordinator is no longer on that team, the token should become invalid immediately, not just “won’t match”.

Smallest control: on coordinator change, delete/revoke coordinator tokens for that team+event.

⸻

2) Review of the planned prompt (this is where it breaks)

Critical bug: hostToken will often be null

In your generateEventTokens():

const existingHostToken = await prisma.accessToken.findFirst(...);
if (!existingHostToken) {
  result.hostToken = await createAccessToken(...)
}

If the token already exists, result.hostToken stays null.

Then your UI will show no host link (and your audit entry says “exists” but you can’t copy it). This will be a recurring “it works sometimes” bug depending on data.

Fix: if existing token exists, return it:

result.hostToken = existingHostToken?.token ?? await createAccessToken(...)

Same issue exists for coordinator + participant: you only return newly created tokens, not existing ones, meaning your “Invite Links” list will be incomplete on rerun / retransition / partial state.

Senior rule: generators should return the complete truth, not “only what I created.”

⸻

Architectural smell: mixing “generate” and “list”

You’re using generateEventTokens() both to:
	•	create missing tokens
	•	act as the source of truth for which tokens exist

That’s conflating two concerns.

Better split (minimal):
	•	ensureEventTokens(eventId): Promise<void> → create missing tokens (idempotent)
	•	listEventTokens(eventId): Promise<InviteLinkDTO[]> → query and return all invite links

This makes retries safe and UI consistent.

⸻

Data access smell: N+1 queries in loops

You’re doing findFirst inside loops for each team/person. That’s fine for 20 people, but it’s still sloppy and avoidable.

Smallest improvement without overengineering:
	•	fetch existing tokens for event once:
	•	const existing = await prisma.accessToken.findMany({ where: { eventId } })
	•	build a lookup map in memory
	•	create missing tokens only

This also makes behavior deterministic and easier to test.

⸻

Transactionality: transition + tokens should be atomic

You’re proposing:
	1.	update event status to CONFIRMING
	2.	then generate tokens
	3.	then log audit entry

If token generation fails mid-way, you can end up in CONFIRMING with missing tokens.

Smallest control: wrap transition + token ensure + audit entry in one prisma.$transaction().

⸻

Security footgun: /api/events/[id]/tokens exposure

This endpoint returns all tokens. If it’s callable by anyone who can access Plan page routes (or if auth is wrong), that’s catastrophic: it becomes a “steal every invite link” endpoint.

You wrote: “Host only.” Good, but you need to define what “Host only” means in your app.

If the Plan page uses session auth (not tokens), enforce:
	•	session user must be host/cohost for that event

If the Plan page is itself token-based, enforce:
	•	token scope must be HOST for that event

Smallest control: require resolveToken() host scope OR session host permission. Do not rely on client-side gating.

⸻

Next.js runtime gotcha: crypto + route handlers

Using crypto.randomBytes requires Node runtime. If any route is Edge, it will explode.

Smallest control: in any route handler that uses token generation, add:

export const runtime = 'nodejs';

(Only where needed.)

⸻

What I would change in your prompt (minimal but correct)

Replace “generateEventTokens returns partial created tokens” with:
	1.	ensureEventTokens(eventId) (idempotent)
	2.	getInviteLinks(eventId) returns all links

Add: database uniqueness for idempotency

If you don’t want schema changes now, at least instruct Claude Code to:
	•	use upsert on a unique key
But you can’t upsert cleanly without a unique constraint besides token. So the correct move is: add the constraint.

⸻


This is still lightweight, but it removes the “works until it doesn’t” traps.

⸻

One section where I’d be even stricter (optional but smart)

Add revokedAt now? Not required. But you will want it later. For now, hard delete on removal is fine.

⸻

The single biggest correction

Your current prompt is building an implementation that will silently fail to show invite links whenever tokens already exist.

Fixing “return existing tokens” and “separate ensure vs list” is the difference between:
	•	a system that works once
	•	and a system you can operate safely

If you paste the planned prompt into Claude Code as-is, expect:
	•	inconsistent Invite Links
	•	token duplication risk
	•	non-atomic transition failures
	•	an endpoint that could become a security incident if auth is slightly wrong