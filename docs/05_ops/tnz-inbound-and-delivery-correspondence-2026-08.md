# TNZ correspondence — inbound (MO), delivery results, shared shortcode

**Status:** Reference record. Not a ticket. Cite it; do not execute it.
**Filed:** 2026-09-12, at `d1577b7` on `feat/moment-one-redesign`.

This is the greppable transcription of two PDFs held beside it in
`docs/05_ops/`:

- `Re Inbound SMS MO replies  capability and webhook contract.pdf`
  — the 2026-08-18 reply, quoting Nigel's 2026-08-15 questions.
- `Re Inbound SMS MO replies  capability and webhook contract2.pdf`
  — the 2026-08-31 reply, quoting Nigel's 2026-08-29 follow-ups, and
  quoting the whole earlier thread beneath it.

The PDFs remain the primary source. This file exists because a PDF cannot
be grepped and three tickets need to cite the substance:
[[GTC-229]], [[GTC-258]], [[GTC-264]].

**Counterparty:** James Dennerly, TNZ Support, `support@tnz.co.nz`.
**Our side:** Nigel Corbett, `nzdog1@gmail.com`.
**API version under discussion:** v2.04 `send/sms`.

---

## Transcription note — read before quoting

Text was extracted from the PDF content streams directly. Two encoding
artefacts were reconstructed, and both are recorded here so a future
reader can check rather than trust:

- The font used for the quoted-original blocks carries a broken
  `ToUnicode` entry mapping the `fi` ligature to `Þ`. So the raw
  extraction reads `conÞrm`, `Þeld`, `Þnd`, `SpeciÞcally`. These are
  rendered here as confirm, field, find, specifically.
- Curly punctuation extracts as MacRoman: `Ñ` is an em-dash and `Õ` is
  an apostrophe. Rendered here as the characters they are.

Every technically load-bearing string — `Status=Failed`,
`Result=Destination is blacklisted`, `X-Timestamp`, `X-Sender`,
`Authorization`, `Sender`, `APIKey`, `MessageID` — is plain ASCII and
came through the extraction untouched. None of it was reconstructed.

Quotes below marked with `>` are verbatim. Everything else is summary.

---

## Thread 1 — capability and contract

### Nigel to TNZ, 2026-08-15 16:36

Context given: v2.04 `send/sms` for NZ and AU mobiles, confirming the
inbound side before go-live, unable to find it in the docs. Stated
reason:

> Our outbound messages include "Reply STOP to opt out", so we need to
> reliably receive and process those replies.

Five questions were put:

1. Does the account support inbound (mobile-originated) replies? What
   number do recipients reply to, and is it reply-capable? No
   sender/From field is passed on send, so what does the account
   default to?
2. What is the webhook payload contract for mobile-originated
   messages — specifically the Content-Type and field names? The
   delivery-receipt callback format is already known (`Status`,
   `Result`, `MessageID`, `Destination`, etc.); this asks about the MO
   contract, assumed different.
3. How are inbound callbacks to our endpoint authenticated — signature
   header, shared secret, IP allowlist, or none?
4. Are STOP / opt-out keywords suppressed at TNZ's layer, or is that
   entirely our responsibility downstream? If suppressed, what keyword
   set is matched, and is the message still forwarded?
5. Does inbound work for Australian (+61) recipients as well as New
   Zealand, or is it NZ-only?

The mail closed by asking what would be required to enable inbound if
it was not available, and any cost or lead time involved.

Note for the record: question 2's parenthetical is where the
delivery-receipt field names enter this thread. They are Nigel's
statement of existing knowledge from TNZ's documentation, not TNZ's
confirmation. TNZ never contradicted them, and their 2026-08-31 answer
independently corroborates `Status` and `Result`.

### TNZ to Nigel, 2026-08-18 14:30

**A1 — inbound is supported; the sending number is auto-allocated.**

> Yes - the system automatically allocates a sending number depending
> on the type of message you send. It'll be a short code number when
> sending to NZ Mobiles, or a Australian mobile number if sending to
> Aus Mobiles.

> We can set up a dedicated short code if that's useful.

**A2 — the MO payload contract was answered with a link, not a spec.**

> The SMS Received webhook for v2.04 is here:
> https://www.tnz.co.nz/Docs/RESTAPI/?version=2.04#receive-webhook

This is the whole of the answer to question 2. No field names, no
Content-Type, no payload example. See *What was asked and not
answered* below — this gap is load-bearing.

**A3 — authentication is a shared secret, in headers and body both.**

> The HTTP Headers include:
> X-Timestamp="2024-05-01T03:51:42.000Z"
> X-Sender="application@domain.com"
> Authorization="ta8wr7ymd"

> And the callback JSON body includes:
> "Sender": "application@domain.com",
> "APIKey": "ta8wr7ymd",

> These values are configured in the TNZ Dashboard under Users -> Your
> API User -> API -> Reporting

Two things follow from the example values, and the distinction between
them matters:

- Stated: the body is JSON, and it repeats the credential.
- Demonstrated but not stated: `X-Sender` and body `Sender` carry the
  same value, and `Authorization` and body `APIKey` carry the same
  value. On the example, this is one identity plus one secret, echoed
  in two places — not two separate credentials. Treat as a strong
  inference from the example, not as prose TNZ wrote. It bears directly
  on [[GTC-229]] F2, which asks this exact question.

**A4 — TNZ detect opt-out keywords themselves, and still forward.**

> By default, the platform automatically detects opt-out keywords and
> adds these mobiles to your Dashboard's Opt-Out list.

> The full message is still passed to you via the webhook.

> Future attempts to send to the number fail with "Destination is
> blacklisted"

> More info:
> https://www.tnz.co.nz/Help/unsubscribe-option-for-sms-messages

Note the possessive: *your* Dashboard's Opt-Out list. The blacklist is
scoped to the TNZ account the message is attributed to. See *Hazards*
below — this wording is the basis of an open question with compliance
weight.

The keyword set was asked for and not given.

**A5 — inbound covers Australia.**

> Inbound works for Australia too.

---

## Thread 2 — send-side semantics and the shared shortcode

### Nigel to TNZ, 2026-08-29 16:47

Three follow-ups, all about the send side:

1. When sending to a number on the account's opt-out list, what does
   the API return — HTTP status code and response body? We currently
   treat any 2xx as a successful send, and want to be sure a blacklist
   rejection is not arriving as a 2xx we would record as delivered.
2. When `Destinations` contains several numbers and only some are
   blacklisted, what comes back — a per-destination result, or a single
   status for the batch?
3. On the shared shortcode: if two of our customers both message the
   same person and that person replies, is there anything in the
   inbound payload that identifies which customer the reply relates to?
   Or is a dedicated shortcode the only way?

### TNZ to Nigel, 2026-08-31 17:18

**B1 — a blacklisted send returns 200; the failure arrives later.**

> The API will respond 200 to confirm the message has been accepted.

> The status reporting (the status GET endpoint and/or the status
> webhook) will return a delivery failure with Status=Failed and
> Result=Destination is blacklisted.

> Note - you should be working from delivery results and not assuming
> the API accepting a message means is a successful delivery.

That last sentence is quoted verbatim, grammatical slip and all. Both
[[GTC-258]] and [[GTC-264]] quote it tidied, as "...means successful
delivery". The meaning is unaffected; the exact wording is preserved
here because this file is the record.

The response *body* was asked for and not given. Only the status code.

**B2 — results are per destination.**

> Webhooks are distributed per destination.

That is the complete answer. It was given to a question explicitly
about status results for a partially-blacklisted batch, so it is a
statement about status reporting. TNZ did not qualify the noun, so
whether it also describes MO webhooks is not settled by this sentence.

**B3 — attribution is last-message-wins, and a dedicated shortcode is
a partial fix only.**

> The reply is attributed to the last sent message, which is logical if
> you consider what the person is seeing on their phone.

> A dedicated short code could help I suppose, but you'd need to be
> sending from different short codes for the two customers.

Read the second sentence carefully. Nigel's question was about two
*Gather hosts* messaging one guest. TNZ's answer says disambiguating
them needs a shortcode *each*. A single dedicated shortcode for Gather
does not resolve that case. See *Hazards*.

---

## What the correspondence establishes

Verified against the PDFs, in TNZ's words:

- Inbound (MO) replies are supported, for New Zealand and Australia.
- The sending number is auto-allocated: a shortcode for NZ mobiles, an
  Australian mobile number for AU mobiles. A dedicated shortcode is
  purchasable.
- The MO callback body is JSON and repeats the credential.
- MO callbacks are authenticated by a shared secret presented as
  headers `X-Timestamp`, `X-Sender`, `Authorization`, and repeated in
  the body as `Sender` and `APIKey`. Configured in the TNZ Dashboard
  under Users, then the API User, then API, then Reporting.
- TNZ detect opt-out keywords at their own layer, add the number to
  that account's Opt-Out list, and still forward the full message.
- Subsequent sends to a blacklisted number fail with the result
  `Destination is blacklisted`.
- A send to a blacklisted number returns HTTP 200 on the API. The
  message is accepted. The failure surfaces later through status
  reporting as `Status=Failed`, `Result=Destination is blacklisted`.
- TNZ said outright to work from delivery results and not to treat API
  acceptance as delivery.
- Status webhooks are distributed per destination, so a batch produces
  one result per recipient and there is no batch ambiguity.
- On the shared shortcode, a reply is attributed to the last message
  sent to that number.
- A dedicated shortcode helps only if different senders use different
  shortcodes.

**Shared, not stated as such.** TNZ never used the word "shared" of the
NZ shortcode. It is a sound reading, and the evidence is TNZ's own: they
offered a *dedicated* shortcode as an upgrade (A1), and they answered
the two-customers question by saying you would need different
shortcodes for the two customers (B3). Both only make sense if the
default shortcode is shared.

---

## What was asked and not answered

Four gaps at the time of filing. Their state as of 2026-09-12:

1. **The MO payload contract.** Question 2 asked for the Content-Type
   and field names. The answer was a documentation URL.
   **RESOLVED 2026-09-12** by reading that page — see *The MO
   documentation* below. It needed no subscription.
2. **TNZ's opt-out keyword set.** Asked in question 4, not answered.
   Where their list and Gather's `OPT_OUT_KEYWORDS` diverge, TNZ's
   decision governs delivery and Gather's local state is wrong.
   **Re-asked 2026-09-12.**
3. **The blacklisted-send response body.** Follow-up 1 asked for status
   code and body. Only the status code was given. Still open, and now
   lower stakes — the documentation gives the status-report shape,
   which is the channel that actually matters.
4. **Cost and lead time for a dedicated shortcode.** The original mail
   asked about cost for enabling inbound, which turned out to be moot.
   The dedicated shortcode was offered twice and never priced.
   **Re-asked 2026-09-12.**

---

## The MO documentation, read 2026-09-12

Fetched from
`https://www.tnz.co.nz/Docs/RESTAPI/?version=2.04#receive-webhook`
— the URL TNZ gave as their whole answer to question 2. The page is
static HTML, not a JavaScript app. **It resolves gap 1 substantially,
and it is not thin.**

**Verdict: it resolves [[GTC-229]] Unknown 1.** Method, Content-Type,
the full field list, the authentication headers and the retry contract
are all documented. What it does not give is the expected response
status code, and it says nothing about clock skew on `X-Timestamp`.

The contract, as documented:

- Method `POST`. Content-Type is `application/json` or `text/xml`.
- Authentication headers are exactly what TNZ mailed on 2026-08-18:
  `X-Timestamp`, `X-Sender`, `Authorization`, with the same example
  values. The correspondence and the documentation agree.
- Retry behaviour is documented: webhook failures are retried every
  five minutes for a maximum of 24 hours, on a non-2xx response.
- The expected success status code is **not** stated.

Payload fields, with the documented example values:

- `Version` — "2.04"
- `Sender` — "application@domain.com"
- `APIKey` — "ta8wr7ymd"
- `Type` — "SMSReply"
- `Destination` — "+6421000001", E.164
- `ContactID` — UUID
- `ReceivedID` — UUID
- `MessageID` — UUID
- `SubAccount`, `Department`, `JobNumber`
- `SentTimeLocal`, `SentTimeUTC-ISO8601`, `SentTimeUTC-RFC3339`
- `Status` — "RECEIVED"
- `Result` — "RECEIVED"
- `Message` — "This is a reply."
- `Price`, `Detail`, `URL`

Two things to notice. `Destination` carries the **guest's** number in
E.164, not ours — so the field named for a destination on the way out
is the sender on the way in. And `Status` / `Result` are reused from
the delivery-receipt vocabulary with the value `RECEIVED`, which means
the two contracts share field *names* while remaining different
contracts, exactly as TNZ warned.

### The finding that changes things — `MessageID` is a join key

The MO payload's `MessageID` is documented as:

> MessageID parameter supplied when sending your original API call. If
> you did not supply one, the API generated one for you.

And on the send side, under MessageData advanced parameters:

> A Message Identifier helps you keep track of each message (maximum 40
> characters, alphanumeric). Use a unique MessageID for each request.
> If you leave this field blank, the API will generate a 36-character
> UUID (v4) for you and include it in the response body.

It is echoed back in **both** the delivery-status webhook and the SMS
reply webhook.

**Gather is already in the right position for this by accident.**
`sendViaTnz` in `src/lib/sms/tnz-client.ts` supplies no `MessageID`,
so TNZ generate one; `sendViaTnz` reads it back off the send response
under a comment naming its purpose, and `sendSms` in
`src/lib/sms/send-sms.ts` writes it to `InviteEvent.metadata` as
`messageId`. That value has never been read. It is the documented join
key, captured on every send since the TNZ transport went in.

**What this means for attribution.** An inbound reply does not have to
be resolved by guessing. TNZ state which outbound message the reply
belongs to, in the payload. Gather does not need to re-derive
last-message-wins with its own query — it can read TNZ's answer.

This does not touch H1: if the reply is attributed to another TNZ
customer, no webhook reaches us and there is no `MessageID` to read.
It substantially closes H2, and it decouples inbound attribution from
the false-stamp corruption described in [[GTC-258]] — see
*Consequences for the tickets* below.

**Residual gaps in the join, which are real:**

- `sendViaTnz` treats a 2xx with an unparseable body as a success with
  `messageId` left `undefined`. Those sends store no join key, and a
  reply to one cannot be resolved by `MessageID`.
- Whether TNZ attribute a reply to the last *accepted* message or the
  last *delivered* one is not stated. It matters only for a second or
  later inbound message from an already-blacklisted number; the first
  STOP arrives before any blacklisting, so its join is clean.

---

## Outstanding with TNZ — asked 2026-09-12

Nigel sent a further mail on 2026-09-12. Four questions, none yet
answered. They are recorded here so the tickets can point at what is
outstanding and why it matters:

1. **The opt-out list scope under the shared shortcode.** When a
   guest's STOP is attributed to a different TNZ customer, does the
   number reach *our* account's opt-out list, or only theirs? This is
   H3 below, and it decides whether the shared shortcode is a
   reporting gap or a compliance exposure.
2. **Whether a positive delivery receipt exists, or only failures.**
   If only failures are ever reported, then "delivered" is never an
   affirmative state and the absence of a failure is the only positive
   signal there will ever be.
3. **The opt-out keyword set** — gap 2 above, re-asked.
4. **The dedicated shortcode price and lead time** — gap 4 above,
   re-asked.

Questions 1 and 2 are the two that change what gets built rather than
merely what is known. Both are flagged where they bear: question 1 in
[[GTC-229]] and [[GTC-288]], question 2 in [[GTC-264]].

**⚠ Question 2 was ANSWERED by the documentation on 2026-09-12, before
TNZ replied.** A positive delivery receipt exists: `Status: SUCCESS` with
`Result: delivered` or `SentOK`. See
`docs/05_ops/tnz-delivery-status-contract-2026-09-12.md`. The mail can
stand, but the answer is no longer awaited — and the sharper form of the
question is now whether `delivered-to-network` (a documented `Success`
that the mobile never acknowledged) should count as delivered, which is
a product question rather than one for TNZ.

---

## Drafted for TNZ 2026-09-12 — NOT YET SENT

Three further questions, drafted at the close of [[GTC-264]] Phase 0 and
recorded here before sending so the tickets can point at them. **They are
drafted, not asked.** Update this heading when they go.

1. **Can the status webhook and the SMS-received webhook be sent to two
   different URLs?** The documentation shows one webhook URL per Sender
   and one per-message override, and says that being set up for Status
   webhooks means also receiving SMS Received webhooks. **Gates
   [[GTC-264]] Phase 3** — it decides whether the delivery endpoint is
   its own route or shares [[GTC-229]]'s.
2. **What is our Sender's default `WebhookCallbackFormat`, JSON or
   XML?** The format defaults at Sender level and our send code sets
   neither `WebhookCallbackFormat` nor `WebhookCallbackURL`. **Gates
   [[GTC-264]] Phase 3, and it is the sharper of the two** — if the
   default is XML, a JSON-only endpoint fails every report, and with the
   documented retry contract it fails each one 288 times.
3. **What HTTP status code do you expect from our endpoint on a
   successful webhook delivery?** The documentation states that webhook
   failures are retried every five minutes for a maximum of 24 hours and
   never defines what constitutes a failure. Not blocking; it decides
   whether a `202` is safe.

The four questions asked on 2026-09-12 remain outstanding, less question
2 as noted above.

---

## Hazards the correspondence creates or sharpens

### H1 — cross-customer interception on the shared shortcode

Another TNZ customer messages one of our guests after we do. Their
message is now the last sent to that number. The guest replies STOP.
By B3, the reply attributes to that other customer. **Our MO webhook
never fires.** This is not a mis-attribution we could detect and
handle; it is an absence we cannot distinguish from a guest who simply
did not reply.

A dedicated shortcode closes H1: if no other sender uses our shortcode,
the last message sent on it to that guest is always ours.

### H2 — cross-host ambiguity inside Gather

Two Gather hosts both message the same guest. The guest replies STOP.
By B3, and by Gather's own newest-`NUDGE_SENT_AUTO`-wins query, the
reply attributes to whichever host messaged most recently. It may be
the wrong one.

**A dedicated shortcode does not close H2.** By B3, that would need a
shortcode per host. H2 is structural and is not purchasable away at any
realistic price.

### H3 — an open question with compliance weight, not yet asked

A4 says TNZ add the number to *your* Dashboard's Opt-Out list. That is
per-account. If a guest's STOP attributes to a different TNZ customer
(H1), does the number reach *our* account's opt-out list, or only
theirs?

**Asked 2026-09-12; not yet answered.** It was not asked in either of
the threads above. It matters more than anything else open here:

- If the blacklist is platform-wide, or if TNZ apply it to every
  account that has messaged the number, then H1 is a state-sync problem
  only. TNZ still stop our sends; we merely do not know why.
- If the blacklist lands only on the attributed account, then after H1
  our sends to that guest keep going out **and keep being delivered**.
  A guest who texted STOP goes on receiving Gather's messages. That is
  a compliance exposure, not a reporting gap.

[[GTC-229]]'s *Purpose* section states that "the legal promise is kept
by TNZ" and that the guest stops receiving messages whether or not
Gather processes the reply. That is true when the STOP attributes to
Gather's account. Under H1 it may not be. The ticket's central framing
is sound but carries an unstated precondition.

Asking this costs one email and no subscription. It was asked on
2026-09-12 and is outstanding.

---

## Consequences for the tickets

Recorded here because these follow from the documentation read on
2026-09-12, not from the correspondence, and the tickets were written
before it.

**Inbound attribution no longer needs the newest-wins heuristic.**
[[GTC-229]] F1 says of TNZ's MO payload: *"a message reference tying
the reply to a specific outbound send would change the answer
completely. If it does, that is a new ticket, not a widening of this
one."* It does. `MessageID` is that reference, it is documented, and
Gather already stores it on every send.

**The corruption link between [[GTC-258]] and inbound attribution is
weakened, not merely mitigated.** [[GTC-229]] F1 and [[GTC-258]]
*What follows* 1 both rest on the same mechanism: a blacklisted send
is logged `NUDGE_SENT_AUTO` as though delivered, becomes Gather's
"last sent", and corrupts the index an inbound reply resolves against.
A handler that joins on `MessageID` never consults that index, so the
false stamps cannot misdirect it.

The sequence is what makes this safe for the case that matters. A
guest is not blacklisted until they STOP. So the first STOP is a reply
to a message that really was delivered, carrying a real `MessageID`,
resolved before any false stamp exists. The false stamps accumulate
afterwards, where inbound attribution no longer looks.

**This does not make [[GTC-258]] less of a defect.** Its other two
consequences are untouched — a consumed nudge cadence stamp, a spent
decide-by follow-up, and the wrap-up email fallback suppressed. Only
its bearing on inbound attribution changes. What it changes is the
*ordering argument*: [[GTC-258]] was a correctness prerequisite for
inbound attribution, and on this finding it is no longer one.

---

## A finding from the rescoping that is not about TNZ

Recorded here rather than only in the two tickets it corrects, because the
rule it yields is general and the near-miss is the instructive part.

### What happened

[[GTC-229]] F2 and [[GTC-264]]'s auth section both needed a fail-closed
secret check, and both described the three cron routes as fail-open with
the fix owned by [[GTC-220]]. Checking that against the tree found it
stale twice over: [[GTC-270]] had already closed the fail-open, and
[[GTC-220]] was never that ticket — it is a transport change moving
`CRON_SECRET` from a query param to a header.

Reading [[GTC-270]] to confirm turned up a doc comment in
`src/app/api/cron/cron-secret.ts` explaining why the decision lives in a
pure predicate while the refusing `if` stays in each route file. Its
stated reason: [[GTC-268]]'s route scanner *"follows local helpers within
a file and does NOT follow imports"*, naming `collectSharedSecret` in
`tests/security-route-scan.ts`.

Both halves of that were wrong at `d1577b7`:

- **The symbol does not exist.** `collectSharedSecret` is nowhere in the
  scanner.
- **The limitation is superseded.** [[GTC-273]] added cross-file
  resolution — `MAX_MODULE_DEPTH = 1`, relative imports only, one level
  deep.

**The dates are the point.** [[GTC-270]] landed at `bf06cc1` on
**2026-09-11**. [[GTC-273]] landed at `b50dffc` on **2026-09-12** and is
the commit that introduced `MAX_MODULE_DEPTH`. **The comment was accurate
for one day.**

And it was written in the worst possible place to be wrong. Whoever wrote
it had just finished establishing, by measurement, that a helper
swallowing the whole check made the scanner report all six cron handlers
as *"no credential of any kind"*. It is a careful comment, written by
someone with that exact failure mode fresh in mind, and it went stale
overnight anyway.

**The near-miss:** that comment was about to be cited as current fact in
two freshly written tickets. Nothing about it looked stale. It was
specific, it named a symbol, it gave a measured consequence, and it was a
day old.

### The durable rule

**A comment is a claim about the tree at the moment it was written. A
citation of a symbol is checkable in a way a claim about behaviour is
not.**

`collectSharedSecret` was falsifiable in one `grep` and it failed. *"Does
not follow imports"* required reading the scanner to test, so it survived
longer and travelled further — and it is the half that would have shaped a
design decision, since it governs where [[GTC-264]]'s shared credential
verification can live.

What follows:

- **Verify a cited symbol before repeating it**, including one you found
  in a comment written by someone who knew more about that file than you
  do. GTC-222's rule already says this for tickets. It applies to comments
  as sources, not only as things tickets produce.
- **Treat a claim about behaviour as dated, and re-derive it.** It carries
  no handle to check, so it cannot fail loudly. Where the claim governs a
  design decision, read the code that implements it.
- **Recency is not freshness.** A one-day-old comment about a file under
  active work is more likely to be stale than an old comment about a
  settled one.

### The concrete finding it produced, which is worth more than the correction

`SHARED_SECRETS` in `tests/security-route-scan.ts` is exactly
`new Set(['CRON_SECRET'])`. **It is the only environment variable the
scanner treats as a shared secret.** A TNZ callback secret is invisible to
it as a credential no matter how the check is shaped — so both
[[GTC-229]] and [[GTC-264]], which each update
`route-classifications.json`, would have recorded a guarded route the
scanner reports as unguarded.

⚠ `tests/security-route-scan.ts` is Do-Not-Touch Zone 6. Adding the new
secret strengthens the contract rather than weakening it, which is what
Zone 6 forbids — but it is still a Zone 6 edit. Both tickets say raise it
and get it ruled rather than do it in passing.

---

## A second finding about provenance — the one that cost the most

Recorded as its own finding on a founder ruling, 2026-09-12, because the
durable lesson is worth more than the correction it produced.

### What happened

Three tickets carried a binding instruction: **the delivery-receipt
contract is not the MO contract, do not assume one shape covers both, do
not build one parser for both.** [[GTC-264]] carried it in *The auth
shape*; [[GTC-288]] carried it as TRAP 3, calling a shared parser *"the
failure mode, not the tidy-up"*; both attributed it to [[GTC-229]]
answer 3.

[[GTC-264]] Phase 0 read the documentation on 2026-09-12. **There is one
envelope.** Nineteen fields, the same names in the same order, the same
three authentication headers, and one subscription — TNZ's own words:
*"If you are set up to receive Status webhooks, you will also be
receiving SMS Received webhooks."* The two callbacks are told apart by
`Type`: `SMS` for a delivery report, `SMSReply` for a reply,
`SMSInbound` for an unsolicited inbound.

### Where the claim actually came from

It was never TNZ's. The trail is entirely inside this file.

**Nigel's question 2, 2026-08-15**, asked for the MO payload contract and
framed it like this: *"The delivery-receipt callback format is already
known (`Status`, `Result`, `MessageID`, `Destination`, etc.); this asks
about the MO contract, assumed different."*

**TNZ's answer 2, 2026-08-18**, was a bare URL. No field names, no
Content-Type, no payload example.

So an assertion in the question — *already known*, *assumed different* —
was the only source. TNZ neither confirmed nor contradicted it.

**And this file flagged exactly that, at the time it was written.** The
note under question 2 reads: *"question 2's parenthetical is where the
delivery-receipt field names enter this thread. They are Nigel's
statement of existing knowledge from TNZ's documentation, not TNZ's
confirmation."*

**The flag was correct, and it was inherited past anyway.** The
assumption was recorded as *answer 3* in [[GTC-229]], and from there two
more tickets took it as a binding instruction — one of them elevating it
into a named trap with a stated failure mode.

### The durable rule

**A caution recorded beside a fact does not travel with the fact.** The
fact is quotable, compact and useful, so it gets copied. The caution is
a paragraph about provenance, so it stays behind.

This is the same shape as the `collectSharedSecret` near-miss above and
the opposite failure. There, a checkable citation failed in one `grep`
while an unfalsifiable claim about behaviour survived and travelled. Here
the claim was *marked as unverified at its source* and travelled anyway,
gaining authority at each hop: a parenthetical became an answer, an
answer became an instruction, an instruction became a trap with a
failure mode.

What follows:

- **When a ticket cites a fact, cite where the fact came from, not the
  ticket that repeated it.** [[GTC-264]] and [[GTC-288]] both instruct
  their executors to *"cite the record, not this ticket's summary of
  it"*. That rule is what caught this. It works only if the record is
  actually opened.
- **An assertion inside a question is not an answer.** When a question
  states a premise and the reply does not address it, the premise is
  still unverified — and a reply that answers *around* a premise is the
  easiest case to misread as confirming it.
- **Write the caution into the claim, not next to it.** "The MO contract
  is assumed different" should have been recorded as "**UNVERIFIED:** the
  MO contract may differ from the delivery-receipt contract; TNZ did not
  say." Then the hedge cannot be copied away, because it is inside the
  sentence.
- **The cheapest check was always available.** TNZ's answer was a URL to
  a static HTML page, fetchable with no subscription and no account. It
  went unread through three ticket filings and two rescopings. When the
  answer to a question is a link, the link is the answer — open it.

### What survived, and what was rewritten

The **semantic** half was right and remains binding: the two payloads
mean different things and must never be conflated. `Status` and `Result`
are shared field names carrying different contracts, and on a reply both
carry `RECEIVED` — **a `RECEIVED` is a reply, never a delivery outcome.**

The **structural** half was wrong and is rewritten in both tickets: one
documented envelope parser, then a `Type` switch, then two interpreters
that know nothing of each other. Two hand-written envelope parsers
against one documented envelope is the duplication, not the separation.

### And one thing it left open

Nothing documents a way to send the two callbacks to two different URLs.
What is documented is one webhook URL per Sender, overridable per
outbound message by `WebhookCallbackURL` — per message, not per callback
type. If they cannot be separated, [[GTC-264]]'s endpoint and
[[GTC-229]]'s are the same route. **Drafted for TNZ 2026-09-12; it gates
[[GTC-264]] Phase 3.**

---

## Where this bears

- [[GTC-229]] — MO webhook authentication. Sources A3, plus the
  documentation's retry contract.
- [[GTC-288]] — MO payload parsing and opt-out sync. Sources A1, A2,
  A4, A5, B3, and the documented payload above. Its predecessor's
  blocking Unknown 1 is closed by the documentation read.
- [[GTC-258]] — accept-is-not-delivery defect. Sources B1 and B2.
- [[GTC-264]] — ingest delivery results. Sources B1 and B2, plus the
  delivery-receipt field names recorded in Nigel's question 2, and the
  `MessageID` join key confirmed by the documentation.
- [[GTC-289]] — the email side of the same absence.

### Dating correction

[[GTC-229]] heads its factual basis "TNZ's answers — the factual basis
(2026-08-29)" and says it was filed on those answers. The answers to
the five capability questions are dated **18 August 2026**. 2026-08-29
is the date Nigel sent the follow-ups, and plausibly the date the
ticket was filed, but it is not the date of the answers the section
records. [[GTC-258]] and [[GTC-264]] date the follow-up answers
2026-08-31, which is correct.
