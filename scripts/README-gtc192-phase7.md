# GTC-192 phase 7 — the seeded board, and what phase 7 ruled

ONE seeded board carrying every state at once. It was built so phase 7's presentations could be
**looked at** side by side; they were, and **phase 7 is ruled** (Rulings 33–36, 2026-09-11).
The board is kept because it is still the board to look at the shipped screen on.

Owned by `nigel@mckorbett.co.nz`, who holds a HOST `EventRole` on it. The id is fixed, so
**re-seeding never changes these URLs.**

Open it with **no parameters at all**:

```
http://localhost:3000/plan/gtc192-phase7-variants/glance
```

⚠ **THERE IS NO `?variant=` SWITCH ANY MORE.** Phase 7 put six presentations behind one, so
they could be looked at on one board with one set of data. Four were ruled against on
2026-09-11 and are deleted from the tree; the two that survived ship as the default.
**Ruling 36:** *"a switch left in the tree is a variant nobody ruled on."* A `?variant=`
parameter on this URL now does nothing at all — it is not read.

What ships:

- **Ruling 32 / 36** — a green or amber strip opens a READ-ONLY panel: name, status word,
  the nudge day if they are amber, and what they are bringing. No controls. Read and close.
- **Ruling 33** — no clock-line on any strip. The nudge day lives in the panel instead.
- **Ruling 34** — that nudge day, on amber people only, as a weekday and never a count.
- **Ruling 35** — border, chevron, pointer cursor and hover dim on every strip that opens
  something. OUT and NOT_CHASED wear nothing, because they open nothing.
- Red still opens the acting `PersonSurface`, unchanged.

## The board

Eleven people in five households. Every state at once, and four ambers rather than one, because
variant A is about ambers and one amber is a sample of one.

| | |
|---|---|
| **Amelia Turner** | AMBER, next nudge two days out — and holding a **critical** |
| **Chloe Nguyen** | AMBER, a **live maybe** — the only person carrying BOTH clocks |
| **Sarah Dalton** | AMBER, next nudge **tomorrow** |
| **Minh Nguyen** | AMBER with a **spent cadence** — no clock-line at all, standing two strips from Chloe, who has one |
| **Grace Nguyen** | **RED**, handed a critical back — the door, the why-line, and §3's assistant message |
| **Ray Dalton** | the **settled reversal** — OUT, faded, text included; his critical falls loose into the alert strip |
| **Aoife O'Brien** | NOT_CHASED — Ruling 14's grey, border kept. Opens nothing, at every variant |
| Nigel, Rob, Charlotte, Connor | GREEN — Ruling 5's wall of names |

Above the grid: `1 needs you. Gather is on 4. 4 settled.`, an alert strip naming two ownerless
criticals, a quiet "and 2 more unassigned", and the assistant's one line.

## Rebuild

```bash
cd ~/Nigel/gather-prototype
npx tsx scripts/seed-gtc192-phase7.ts            # rebuilds the board, same id, same URLs
npx tsx scripts/seed-gtc192-phase7.ts --dump     # canonical, relative-time dump for diffing
```

**Run it twice and diff the dumps before trusting a single thing on the board.** The dump prints
a census line first and REFUSES to print at all if any kind of record is missing — because the
first cut of it crashed, and two runs of the same stack trace diff clean while measuring nothing.

⚠ **One line legitimately moves after a page view:** `role HOST glanceSeenAt`. The board has
nothing to replay, so the page stamps the mark on arrival — which is correct, and is the only
thing a visit writes. A re-seed resets it.

## Nothing replays, on purpose

`glanceSeenAt` is stamped at seed time, so `replay.steps` is empty and **every load of every
variant paints the same board**. An armed board would make whichever variant was looked at first
the only one that saw a replay.

To put the replay back — the only way to watch phase 6's two inherited findings live:

```bash
psql gather_dev -c "update \"EventRole\" set \"glanceSeenAt\" = (select \"createdAt\" - interval '48 hours' from \"Event\" where id='gtc192-phase7-variants') where \"eventId\"='gtc192-phase7-variants';"
```

Ray's decline is at −30h and Grace's at −26h, both inside a −48h window, so the replay carries
Grace's red and Ray's reversal, and the reversal plays last. Add **`?replay=manual`** for a Play
button that never stamps, so it can be replayed under each variant in turn. Without that
parameter the automatic replay stamps itself once and the board returns to stable.

## Changing the cast

Everything is in `scripts/seed-gtc192-phase7.ts`. The four rules from the replay boards apply
unchanged — see `scripts/README-gtc192-replay.md` — plus one that is this board's own:

5. **`sentAt` on a PersonEvent is what variant A renders.** `nextNudgeAt` counts [4, 7] days
   from it (STANDARD, the event default), so that one field decides whether an amber has a
   clock-line and what it says. `−2d` → two days out; `−3d` → tomorrow; `−11d` → spent, no line.
   Move it and the variant changes; leave every amber on the same value and the variant tells
   the founder nothing.
