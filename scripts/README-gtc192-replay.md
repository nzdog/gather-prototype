# GTC-192 — the two arrival-replay demo boards

Two seeded events for **looking at** the arrival replay (phase 6). Not test fixtures, not
measurements — boards to watch, and to change for a demo.

Both are owned by `nigel@mckorbett.co.nz`, who holds a HOST `EventRole` on each. The ids are
fixed, so **re-seeding never changes these URLs.**

| Board | URL |
|---|---|
| **arrival** — three sparks, a quiet red, a reversal that lands last | `http://localhost:3000/plan/gtc192-replay-arrival/glance` |
| **all green** — ten sparks, nothing else | `http://localhost:3000/plan/gtc192-replay-allgreen/glance` |

Add **`?replay=manual`** to either for the dev preview: a Play button, one second between
steps, and **no stamp** — press it as many times as you like. Without the param you get the
real thing: it plays automatically at the ruled ~3s pace and stamps itself once.

## Rebuild both

```bash
cd ~/Nigel/gather-prototype
npx tsx scripts/seed-gtc192-replay.ts      # rebuilds both boards, same ids, same URLs, re-armed
npx tsx scripts/check-gtc192-replay.ts gtc192-replay-allgreen   # read-only: prints board + steps
```

The seed wipes and recreates by event id and by its own `+tag@example.com` people, so it is
idempotent — run it twice and the canonical dump is identical. It touches nothing else in
`gather_dev`.

## Rewind, to watch the automatic replay again

The stamp means a second visit shows nothing. This puts the mark back:

```bash
psql gather_dev -c "update \"EventRole\" set \"glanceSeenAt\" = (select \"createdAt\" - interval '48 hours' from \"Event\" where id='gtc192-replay-arrival') where \"eventId\"='gtc192-replay-arrival';"
```

Swap the id for `gtc192-replay-allgreen`. It derives the anchor from `Event.createdAt`, so it
stays correct after any re-seed. **The preview (`?replay=manual`) never needs this.**

## Changing the boards for a demo

Everything lives in `scripts/seed-gtc192-replay.ts`. Edit a `cast` array and re-run. Four
things will bite you if you don't know them:

1. **You set `taps`, not `response`.** A row's response is whatever its last tap says, and every
   tap writes the `AuditEntry` the real ack route writes. This is the ticket's standing rule —
   *every glance fixture writes the rows the real route writes* — and it is not optional: the
   rewind reads that ledger, so a response set without one **does not replay at all** (Ruling 28,
   positive evidence only). It is also how the fixture avoids encoding the bug it is meant to show.

2. **The window is the anchor to now.** `glanceSeenAt` = `Event.createdAt − 48h`. Taps at **−40h
   or newer** are inside the window and play; taps at **−5d or older** are the state she last saw.
   Keep that gap — a tap that drifts across the anchor changes what plays, silently.

3. **The order is chronology, and it is not shuffled in code.** `deriveReplay` sorts by when each
   change happened. To scatter the sparks across the board, scatter the **hours** in the cast —
   the current boards are spread so no two consecutive steps land in the same household column.
   Do not add a shuffle to the derivation: it would make the replay lie about the sequence.

4. **What actually plays** (Ruling 26b): a step survives only if it lands on GREEN, lands on RED,
   or is a reversal (into OUT). GREEN → AMBER does **not** play. A spark is AMBER → GREEN and
   nothing else; every other step is a quiet 0.7s tint change. The reversal always sorts last.

The preview control itself is `src/components/glance/GlanceReplayPreview.tsx`, driven by
`src/components/glance/GlanceReplay.tsx`. **Open question, not yet ruled:** `test:glance-replay`
asserts on the island's source that it contains no control (Ruling 6, "'seen' means the replay
played"); the preview sits one file to the left of that fence. It never stamps and is unreachable
without the query param, but whether to fence it explicitly is Nigel's call — see the file header.
