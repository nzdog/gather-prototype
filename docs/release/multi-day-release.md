# Multi-day: the release runbook

For the founder. Written for GTC-483 (26 Nov 2026). Plain English, one
step at a time. Claude never connects to staging or production and never
changes a Railway setting: every step here is yours.

Multi-day is built (GTC-477 to GTC-481, and GTC-485) and sits behind one
switch, `GATHER_SESSIONS`. While the switch is off, nothing a host or
guest sees, receives or is nudged about changes. This runbook turns it
on, staging first, and says how to turn it off again.

By your ruling of 26 Nov 2026, the release comes before GTC-482: hosts
get multi-day with today's drafting. The plan drafts as it does now and
the host moves dishes into sessions by hand.

## 1. What turning it on does

With the switch on and no sessions added, a host sees two things change,
and nothing else:

- **Moment 1's summary** shows a "Sessions" card on every event, empty,
  with a short line ("Lunch and dinner on the day? ..." on a one-day
  event, "Is this more than one meal? ..." on a longer one) and
  "+ Add a session".
- **The invitation's first line**, on an event over more than one date
  whose host has not saved a line of their own, names the whole range:
  "We're doing Christmas from Thursday, 24 December to Saturday, 26
  December, at Mum's." Today it says "on Thursday, 24 December". This
  also reaches anyone asked later on an event already sent (a guest
  added after the send, or a resend), as you ruled on 26 Nov.

Everything else waits until a host adds a session: the tabs on Moments
2 and 3, the Session list, the guest's "Can't make it" per session, the
board's tags, and each dish's decide-by counting from its own session.
The nudges, the opt-outs and the send itself are not touched.

One exception: an event that **already** holds sessions (made from a
saved template that had days) behaves at once as if its host had added
them. The count below says how many there are.

## 2. Before you turn it on

1. **A safety copy** of production's database, made the way you made the
   last one before a release. Turning the switch on writes nothing by
   itself, so this is a precaution, not a step the release needs.

   Its name and time: manual backup "2026-11-26 17:52", 1.46 GB, on
   Postgres-33NH's Backups tab.

2. **The read-only count.** Run this from the repo folder, on your own
   connection to production's database (one line):

   ```
   psql "<your production connection>" -f docs/release/multi-day-release-count.sql
   ```

   Production's database has no public address, so the line above
   cannot reach it. Run it in Railway's Console on Postgres-33NH
   instead: `psql`, then the query from
   `docs/release/multi-day-release-count.sql` pasted. That is how it
   was run on 26 Nov 2026.

   It opens a read-only transaction (the database refuses any write in
   it) and ends by rolling back. It prints one row of four numbers. On
   production, 26 Nov 2026, about 16:14:

   - `events_with_sessions`: 0. Events that already hold sessions.
     If not 0, ask Claude for the second read-only query that lists
     them (name, dates, sent or not) and look before you turn on.
   - `events_with_not_coming_marks`: 0. Should be 0. Nothing writes
     these while the switch is off. **If it is not 0, stop.**
   - `unsent_events_over_more_than_one_date`: 1. Their invitation
     will name the range when sent (unless the host saved a line).
   - `sent_multi_date_still_ahead_without_own_line`: 0. Sent events
     where a guest asked later gets the range line.

## 3. Turn it on: staging first

1. In Railway, open the **staging** service, then its Variables.
2. Add the variable `GATHER_SESSIONS` with the value `on`: two small
   letters, nothing else. Any other value (`ON`, `true`, `1`, a space)
   counts as off.
3. Railway then redeploys the service, or asks you to deploy the change.
   Claude cannot see Railway, so go by what it shows. The switch is on
   once that deployment is live.

   On 26 Nov 2026 Railway held the new variable in an "Apply 1 change"
   bar, and pressing Deploy there deployed it. "Redeploy" on the old
   deployment does not pick up the new variable.

Time turned on, staging: 26 Nov 2026, about 16:27.

## 4. Check staging by hand, on your phone

- An existing event's Moment 1 summary: the empty "Sessions" card.
- Its Moments 2 and 3: no tabs (there are no sessions yet).
- A multi-date event's pre-flight, step 4: the line reads "from ... to
  ..."; a one-day event's reads as before.
- A test event of your own: add sessions on the card ("Add one session
  for each date" is the quick way), move a dish into one with the
  Session list on Moment 2, then see the tabs on Moments 2 and 3.
- That event's guest link: "Can't make it" on one session; then its
  board: that dish red, and its session's tag in the guest's list.

Anything wrong: turn it off (section 6) and tell Claude what you saw.

## 5. Production

1. The same variable on the **production** service: `GATHER_SESSIONS`,
   value `on`. Deployed and live as at step 3.
2. On one of your own events: the first three checks of section 4.
3. The board of a sent event: as it was.

Time turned on, production: 26 Nov 2026, 17:55.

## 6. Turn it off again: one step

Delete the variable `GATHER_SESSIONS` from the service. As at step 3,
it is off once the deployment that follows is live.

## 7. What happens to sessions already made, while it is off

- They stay in the database, untouched. The screens hide them: Moments 2
  and 3 show every dish together, with no tabs.
- Each dish's decide-by counts from the event's end again, so the maybe
  follow-up may come later than its session.
- A guest sees a dish's session name beside it, without its date. The
  board shows no tags.
- Guests' "Can't make it" marks stay stored, but nothing shows or reads
  them. Dishes they turned No stay No.
- The invitation's first line goes back to "on ..." for anything not yet
  sent.
- **Two ways to lose them while it is off:** pressing "Invites only"
  deletes the event's sessions and their marks; bringing a put-away plan
  back makes its sessions again as new copies, without the marks.
- Turned on again, everything returns as it was, except on events where
  one of those two happened.

## 8. Merging GTC-483

Whether merging deploys depends on Railway's auto-deploy switch, which
the founder checks on both services at the moment of the merge.

GTC-483's own change (the dish words, "the bread rolls") shows only
while the sessions switch is on, so merging it changes nothing a host
or guest sees while the switch stays off.
