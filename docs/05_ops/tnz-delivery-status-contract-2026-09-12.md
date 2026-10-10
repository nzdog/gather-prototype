# TNZ delivery-status contract — the recorded wire shape

**Status:** Reference record. Not a ticket. Cite it; do not execute it.
**Filed:** 2026-09-12, at `0dc7be1` on `feat/moment-one-redesign`.
**Phase:** [[GTC-264]] Phase 0. Closes that ticket's blocking *Unknown 1*.

This is the record [[GTC-264]] *Isolate the wire shape* requires: the
assumed shape written down, field names and types, the status vocabulary
as far as it is known, and **which parts are documented versus
inferred** — so that a reader at trial time can diff belief against
reality without reading the implementation.

**It is a dated snapshot, not a live contract.** It does not change when
the code changes. The live contract is
`src/lib/sms/tnz-delivery-contract.ts` (Phase 2), which carries the
types, the parse and the fixture factory, and which cites this file.
This file is the evidence; that module is the boundary.

---

## The artefacts this record is built from

Both were fetched on 2026-09-12 and are held beside this file, because a
URL can change under a citation and a hosted page is not evidence.

- `docs/05_ops/tnz-restapi-v2.04-docs-2026-09-12.html`
  — `https://www.tnz.co.nz/Docs/RESTAPI/?version=2.04`, HTTP 200,
  808,725 bytes, static HTML.
  sha256 `57247a88a9623ac1f19b3a97a09e0406d9d8cd17354434e24234edb7fd1f701e`
  The page's own footer reads **"Last updated: Jun 5th 2025"**.
- `docs/05_ops/tnz-sms-delivery-result-codes-2026-09-12.html`
  — `https://help.tnz.co.nz/help/sms-delivery-result-codes`, HTTP 200,
  66,118 bytes. Linked from the `Result` parameter description in the
  page above.

Sections read: `#status-section` ("API - Status Reporting") and
`#receive-section` ("API - Receive Messages"). The second was read in the
same pass on instruction, for [[GTC-288]]'s benefit.

**Method note.** Read as raw HTML converted to text locally, not as a
model's summary of a fetched page. An earlier attempt through a
summarising fetch tool returned a paraphrase of a truncated copy, which
is adequate for "does this exist" and not adequate for field names. Two
facts it reported were correct and are confirmed below; nothing in this
record rests on it.

---

## Provenance legend

Every field and value below carries one of these. Nothing is unmarked.

- **DOC-EXAMPLE** — appears in a literal payload example in the page
  source.
- **DOC-TABLE** — appears in the page's parameter table.
- **DOC-CODES** — appears in the result-codes help page.
- **MAIL** — in the 2026-08 correspondence
  (`tnz-inbound-and-delivery-correspondence-2026-08.md`).
- **INFERRED** — believed, with the basis named. Never seen stated.
- **UNKNOWN** — asked or unasked, not answered anywhere.

---

## Finding 1 — there is ONE webhook envelope, discriminated by `Type`

**This is the most consequential finding of the phase and it contradicts
a binding instruction in three tickets.** DOC-TABLE, DOC-EXAMPLE.

The delivery-status webhook and the SMS-reply webhook carry **the same
envelope, the same field names, in the same order**. They are told apart
by `Type`, and secondarily by two fields:

- `Type: "SMS"` — a delivery status report.
- `Type: "SMSReply"` — a reply to one of our messages.
- `Type: "SMSInbound"` — an inbound message that is not a reply.
- `Message` is present **only** when `Type` is `SMSInbound` or
  `SMSReply`. DOC-TABLE, verbatim: *"The received SMS message (if
  'Type=SMSInbound' or 'Type=SMSReply')"*.
- `ReceivedID` is **"Always blank for Status webhooks"**. DOC-TABLE.

And the two webhooks are **one subscription**. DOC-TABLE, verbatim, from
the Receive Messages section:

> *"If you are set up to receive Status webhooks, you will also be
> receiving SMS Received webhooks."*

There is no documented way to point them at two different URLs. What is
documented is one webhook URL per Sender, overridable per outbound
message by `WebhookCallbackURL` — *"Overrides your Sender's default
Webhook URL. Requires a default webhook to be configured."* The override
is per message, not per callback type.

**What this means for the tickets is in *Contradictions* below.** It is
not a small correction.

---

## The webhook — transport and authentication

- Method `POST`. DOC-TABLE.
- `Content-Type: application/json` or `text/xml`. DOC-EXAMPLE, both
  forms given.
- The format is **not ours to choose per callback.** It is the Sender's
  configured default, overridable per outbound message by
  `WebhookCallbackFormat` — *"Overrides your Sender's default Webhook
  format ('JSON' or 'XML')"*. DOC-TABLE.
  ⚠ `sendViaTnz` sets neither parameter, so **the format Gather will
  receive is whatever our Sender default is, and that is UNKNOWN.**
  See *Hazards* H-A.
- Retry: *"Webhook failures are retried every five minutes for a maximum
  of 24 hours."* DOC-TABLE, stated in both sections.
- **The expected success status code is NOT stated.** UNKNOWN, for the
  status webhook and the reply webhook both. The page defines the retry
  trigger as a "webhook failure" and never says what makes one. Every
  `200 OK` in the page belongs to TNZ's responses to *our* API calls.
- Authentication headers, DOC-EXAMPLE, identical in both sections:
  - `X-Timestamp: "2024-05-01T03:51:42.000Z"`
  - `X-Sender: "application@domain.com"`
  - `Authorization: "ta8wr7ymd"`
- And repeated in the body as `Sender` and `APIKey`, same values.
  DOC-EXAMPLE.
- ⚠ The webhook `Authorization` header is the **raw secret**, not
  `Basic <token>`. Outbound API calls use `Authorization: Basic <Auth
  Token>` and that is a different credential. DOC-EXAMPLE both ways.
- Nothing is said about clock skew tolerance on `X-Timestamp`, or about
  what it is for. UNKNOWN.

---

## The webhook payload — fields, in source order

All DOC-EXAMPLE and DOC-TABLE unless marked. Types are as they appear:
**every value in the JSON example is a string**, including `Price`.

- `Version` — `"2.04"`. *"The API Version configured for the webhook"*.
- `Sender` — `"application@domain.com"`. *"Webhook sender
  authentication (can configure a unique Sender if required)"*.
- `APIKey` — `"ta8wr7ymd"`. *"Webhook token authentication (can
  configure a unique APIKey if required)"*.
- `Type` — `"SMS"` for a status report. Documented value set:
  `Email`, `SMS`, `Fax`, `Voice`, `TextToSpeech`, `SMSInbound`,
  `SMSReply`.
- `Destination` — `"+6421000001"`. *"Destination that the webhook is
  for (alphanumeric field, where telephone/mobile numbers are supplied
  in E.164 internationalised format)"*. On a **status** report this is
  the guest's number as the recipient. On a **reply** the same field is
  described differently — *"Mobile number that sent the SMS"* — same
  value semantics, opposite direction.
- `ContactID` — UUID v4, 36 characters. *"Displays the Address Book
  Contact ID. If unavailable, displays an empty field."* Gather does not
  use TNZ's address book, so expect empty. INFERRED, from that
  description plus the absence of any address-book call in the tree.
- `ReceivedID` — **empty string on status reports.** DOC-TABLE:
  *"Tracking ID for inbound/reply SMS messages. Always blank for Status
  webhooks."*
- `MessageID` — `"1000000a-f002-4007-b00a-d00000000002"`. *"MessageID
  parameter supplied when sending your original API call. If you did not
  supply one, the API generated one for you."* **This is the join key.**
  It is the same field, same wording, in the reply webhook.
- `SubAccount`, `Department` — reporting/billing segmentation. Gather
  supplies neither, so expect empty. INFERRED, same basis as
  `ContactID`.
- `JobNumber` — `"10C7B9A0"`. *"Eight digit alphanumeric tracking
  number (our internal Job Number)"*.
- `SentTimeLocal` — `"2025-06-04 09:16:55"`. Described as ISO 8601; the
  example is **not** ISO 8601 (space separator, no offset). Take the
  example over the description.
- `SentTimeUTC-ISO8601` — `"2025-06-03 21:16:55"`. Same discrepancy.
- `SentTimeUTC-RFC3339` — `"2025-06-03T21:16:55.000Z"`. This one does
  match its description and is the field to parse.
  ⚠ All three are the time the **message was sent**, not the time the
  report was raised. Nothing in the payload carries the report's own
  timestamp. See *Hazards* H-C.
- `Status` — see the vocabulary below.
- `Result` — see the vocabulary below.
- `Message` — **absent on status reports.** Present only for
  `SMSInbound` / `SMSReply`.
- `Price` — `"0.10"`, a string. *"Your cost for this transaction"*.
  *"Always empty for SMS Received webhooks."*
- `Detail` — `"SMSParts:1"`. A `key:value` string whose key varies by
  message type. For SMS, *"'SMSParts' is the quantity of SMS Parts"*.
  On a reply it carries `InputToNumber:...` instead.
- `URL` — the webhook URL the callback was sent to.

**No field is documented as optional or nullable** beyond the
empty-string cases named above. Whether an absent field arrives as `""`
or is omitted from the JSON entirely is UNKNOWN; the examples show `""`.

---

## `Status` — the vocabulary

DOC-TABLE, verbatim: *"For submission results, values are SUCCESS,
FAILED, PENDING. For reply reports, this will be RECEIVED. For
additional analytics, this will be UPDATED."*

So on a status webhook, three values:

- `SUCCESS` — DOC-TABLE, DOC-EXAMPLE.
- `FAILED` — DOC-TABLE. `MAIL` corroborates as `Status=Failed`.
- `PENDING` — DOC-TABLE. ⚠ **Contested** — see *Contradictions* 4.

And two that belong to other callback kinds arriving at the same URL:

- `RECEIVED` — reply and inbound. DOC-TABLE, DOC-EXAMPLE.
- `UPDATED` — *"additional analytics"*. DOC-TABLE. What these are, and
  whether Gather would receive any, is UNKNOWN.

⚠ **Case is inconsistent across TNZ's own sources.** The API page gives
`SUCCESS` / `FAILED` / `PENDING` upper-case. The result-codes page gives
`Success` / `Failed` / `Pending`. The 2026-08 mail gives
`Status=Failed`. **Compare case-insensitively.**

---

## `Result` — the full taxonomy, which [[GTC-264]] recorded as unread

**DOC-CODES. This is the single largest thing the phase gained.**
[[GTC-264]] *Unknowns* 4 and its §7 note both say the `Result` set is
unread and that the three-way partition cannot be made. **It is
documented.** Twenty-one rows, and the chargeable flag and the
notification channels are documented per row.

**Status `Success` — four values:**

- `delivered` — *"SMS received successfully by the mobile phone"*.
  Chargeable.
- `SentOK` — *"SMS received successfully by the mobile phone"*.
  Chargeable. ⚠ The API page's `Result` example spells this
  **`Sent OK`**, with a space. The codes page spells it **`SentOK`**.
  One of the two is wrong and we do not know which.
- `delivered-to-network` — *"SMS received successfully by the mobile's
  network/carrier but not acknowledged by the mobile (mobile off or out
  of coverage)"*. Chargeable. ⚠ **A `Success` that is not an arrival.**
- `Control Deleted` — *"SMS sending was aborted by a user (marked as
  success for reporting purposes and to avoid retries)"*. Not
  chargeable. ⚠ Also a `Success` that is not an arrival.

**Status `Failed` — thirteen values:**

- `Undelivered` — carrier reported failure, no reason given.
- `Bad Number` — *"the mobile number is not in use"*.
- `Destination is blacklisted` — *"Mobile number has opted out of
  receiving your texts and is on your blacklist"*. Not chargeable.
  `MAIL` corroborates exactly.
- `Rejected-Duplicate` — *"same To, From and Message within 60
  seconds"*.
- `Rejected-Country Blocked-Account Policy`
- `Rejected-Invalid Sender ID`
- `Rejected-Message Content Issue`
- `LinkNotPermitted` — *"contains a URL that is not on our phishing
  whitelist"*. ⚠ **Not delivered by webhook** — see H-B.
- `No Permit Record` — *"Internal TNZ error; contact TNZ Support"*.
- `Invalid Mobile Number (RP-Max)` — too many digits.
- `Invalid Mobile Number (RP-Min)` — not enough digits.
- `Rejected-06-Invalid Mobile Number` — unused number range.
- `Rejected-07-Invalid Number` — *"number range is not used for
  mobile"*.

**Message-level statuses with no `Result` value:**

- `Pending` — *"currently processing and awaiting a delivery result"*.
  Channels: Dashboard, GET Poll.
- `Delayed` — *"queued until the specified Send Time"*.
  Channels: Dashboard, GET Poll.
- `CreditHold` — *"held due to lack of available account credit"*.
  Channels: Dashboard, Email, GET Poll. ⚠ See H-B.
- `Unknown` — *"Catch-all value if no other Status code is
  appropriate"*. Channels: N/A.

⚠ Three rows spell the channel **"Webook"**. A typo, on
`Rejected-Country Blocked`, `Rejected-Invalid Sender ID` and
`Rejected-Message Content Issue`. Not a separate mechanism.

### The three-way partition — PROPOSED, not ruled

[[GTC-264]] requires `Result` values to partition into dead-channel,
opted-out and transient, and says the partition waits on the vocabulary.
The vocabulary is now in hand, so the partition is proposable. **It is
proposed here and owned by [[GTC-192]], not settled by this record.**

- **Dead channel** — §7's bounce, the guest is unreachable at this
  number and no retry helps: `Bad Number`,
  `Invalid Mobile Number (RP-Max)`, `Invalid Mobile Number (RP-Min)`,
  `Rejected-06-Invalid Mobile Number`, `Rejected-07-Invalid Number`.
- **Opted out** — a live number whose owner said stop. Explicitly NOT a
  §7 bounce: `Destination is blacklisted`.
- **Our fault, not the guest's** — nothing about the guest is wrong and
  every §7 door option would mislead: `Rejected-Duplicate`,
  `Rejected-Country Blocked-Account Policy`,
  `Rejected-Invalid Sender ID`, `Rejected-Message Content Issue`,
  `LinkNotPermitted`, `No Permit Record`, `CreditHold`.
  ⚠ **This is a fourth bucket [[GTC-264]] did not anticipate**, and it
  is seven of the twenty-one values. §7's bounce door offers *"let the
  system try again, or take it herself — ring him, ask his mum, fix the
  number"*. **Every one of those seven makes every one of those the wrong
  instruction. Nothing about the guest is wrong** — the number is fine,
  the guest is reachable, and the fault is ours or TNZ's: a duplicate
  inside sixty seconds, a sender id the carrier rejected, a link not on a
  phishing whitelist, an account out of credit. Sending Kate to ring him
  or fix the number is worse than silence, because it spends her
  attention on a problem she cannot see and cannot fix.
  **Confirmed as the right finding by founder ruling 2026-09-12, and it
  stays [[GTC-192]]'s to rule.** A "bounce red" that fires on
  `CreditHold` tells Kate a guest is unreachable when the truth is that
  Gather has run out of credit.
- **Genuinely ambiguous** — `Undelivered`. The carrier said it failed
  and gave no reason. It cannot be assigned without evidence from real
  traffic.
- **Not a failure but not an arrival** — `delivered-to-network`,
  `Control Deleted`. Both are `Success`. Colouring them green says the
  guest saw it, and neither establishes that.

---

## The GET Status Poll

- `GET https://api.tnz.co.nz/api/v2.04/get/status/[MessageID]`.
  DOC-EXAMPLE. **Per message, keyed on `MessageID`** — the same key
  Gather already captures on every send.
- Authentication: `Authorization: Basic <Auth Token>`, described as
  *"Auth Token value set up"*. DOC-TABLE. **This is the existing
  `TNZ_AUTH_TOKEN`.** The poll needs no new credential.
- Also required: `Content-Type` and `Accept`, both
  `application/json; encoding='utf-8'`. DOC-TABLE.
- *"The GET Poll should be configured to timeout after 48 hours with no
  result."* DOC-TABLE.
- Responses: `200 OK` on success, `400 Bad Request` on failure.
  DOC-TABLE. ⚠ Note this is TNZ's answer to us, and note that a failed
  *poll* returns `Result: "Failed"` meaning **the API call failed** —
  *"Result of your API call (not the result of the message)"*. Same
  field name, opposite subject.

**Its response is a different shape from the webhook**, and this matters:

- Message level: `Result`, `MessageID`, `Status`, `JobNum` (note: not
  `JobNumber`), `Account`, `SubAccount`, `Department`, `Reference`,
  `CreatedTimeLocal`, `CreatedTimeUTC`, `CreatedTimeUTC_RFC3339`,
  `DelayedTimeLocal`, `DelayedTimeUTC`, `DelayedTimeUTC_RFC3339`,
  `Count`, `Complete`, `Success`, `Failed`, `Recipients`.
- Message-level `Status` has its **own vocabulary**: `Unknown`,
  `Pending`, `Delayed`, `Completed`, `CreditHold`. DOC-TABLE. Note
  `Completed`, which appears nowhere in the webhook vocabulary.
- Per recipient, inside `Recipients`: `Type`, `DestSeq`, `Destination`,
  `ContactID`, `Status`, `Result`, `SentTimeLocal`, `SentTimeUTC`,
  `SentTimeUTC_RFC3339`, `Attention`, `Company`, `Custom1-9`,
  `RemoteID`, `Price`.
- Per-recipient `Status` and `Result` use the **webhook** vocabulary —
  `SUCCESS` / `FAILED` / `PENDING` and the twenty-one `Result` values.
- ⚠ The UTC field names differ from the webhook's: `SentTimeUTC` and
  `SentTimeUTC_RFC3339` here, `SentTimeUTC-ISO8601` and
  `SentTimeUTC-RFC3339` (hyphens) there. **Underscore versus hyphen, in
  the same API.**

**⚠ FILED AS [[GTC-290]] on a founder ruling, 2026-09-12.** The poll is
not optional and it is not folded into [[GTC-264]]. Not optional because
of H-B below: `CreditHold` silences every message the account sends and
produces no webhook for any of them, which is indistinguishable from
healthy, and a schema that looks complete while being structurally blind
to an account-wide failure is worse than one that says it is partial. Not
folded in because of the two vocabularies above — **two vocabularies in
one phase is how the fiction gets built.**

⚠ **Evidence asymmetry, and it is the reason to trust the webhook shape
more.** The webhook payload is documented by a parameter table **and** a
literal JSON example, and the two agree. The GET's response is
documented by tables only: of 25 `<pre>` blocks in that section of the
page source, 23 are empty — both "Sample SUCCESS Response" and "Sample
FAILURE Response" bodies are absent from the HTML. So there is no
literal example to check the GET field list against.

---

## What the documentation does NOT give

- **The expected success status code for either webhook.** UNKNOWN, and
  it was not asked. This is the one thing needed to know when TNZ will
  stop retrying.
- **Whether the two callbacks can be sent to two different URLs.**
  UNKNOWN, and now load-bearing. See *Contradictions* 1.
- **Our Sender's default `WebhookCallbackFormat`.** UNKNOWN. It decides
  whether we receive JSON or XML.
- **Clock-skew tolerance on `X-Timestamp`**, and what it is for.
- **Whether a report can arrive more than once per message** with a
  changed `Status` (e.g. `PENDING` then `SUCCESS`). The vocabulary
  implies yes; nothing states it.
- **How long after acceptance a report arrives.** [[GTC-264]]
  *Unknowns* 5, still open. The 24-hour retry and 48-hour poll timeout
  bound it loosely and do not answer it.
- **Whether `Destination is blacklisted` is account-scoped or
  platform-scoped.** The codes page says *"your blacklist"*, matching
  `MAIL` A4's *"your Dashboard's"*. H3 in the correspondence record
  remains outstanding.
- **A blacklisted send's response body.** Gap 3 in the correspondence
  record. The page documents the normal send response
  (`{"Result": "Success", "MessageID": "..."}`) and the status set
  (`200` accepted, `400` invalid variables, `401` invalid token, `500`
  server fault) but does not single out the blacklisted case.

---

## Contradictions — the most important part of the phase

### 1. "The delivery-receipt contract is NOT the MO contract" is wrong

[[GTC-264]] carries this as a binding warning, attributed to
[[GTC-229]] answer 3, and repeats *"do not build one parser for both"*.
[[GTC-288]] carries it as TRAP 3. **The documentation shows one
envelope, one field list, one authentication scheme, one subscription,
discriminated by `Type`.**

Trace the claim back and it is not TNZ's. The correspondence record
already flags the provenance: the delivery-receipt field names entered
the thread in **Nigel's own question 2**, as *"already known"*, with the
MO contract *"assumed different"* — and the record notes explicitly that
this is *"Nigel's statement of existing knowledge... not TNZ's
confirmation."* TNZ answered question 2 with a bare URL. The assumption
was then recorded as an answer in [[GTC-229]] and inherited as binding
by two more tickets. **The correspondence record's caution about
provenance was right, and this is the thing it was cautious about.**

What survives, and what does not:

- **Survives, and is still binding: the two payloads MEAN different
  things.** A delivery report and a reply must never be conflated, and
  `Status`/`Result` carrying `RECEIVED` is a reply, not a delivery. The
  semantic warning is sound.
- **Does not survive: the claim that they are different *shapes*, and
  the conclusion that one parser is the failure mode.** The correct
  structure is the opposite of what the tickets instruct: **one
  envelope parser, shared and documented, then a `Type` switch, then two
  interpreters that do not know about each other.** Two independently
  written envelope parsers against one documented envelope is the
  duplication, not the safeguard.
- **And the routing question is now open.** If TNZ cannot send the two
  callbacks to two URLs, [[GTC-264]]'s endpoint and [[GTC-229]]'s
  endpoint are **the same route**, and [[GTC-264]]'s *Do not touch*
  entry forbidding `src/app/api/sms/inbound/route.ts` cannot be
  satisfied as written. **This must be asked of TNZ before Phase 3.**

### 2. A positive delivery receipt EXISTS

[[GTC-264]] *Unknowns* 4 is *"THE HIGHEST-RISK ASSUMPTION BEING DEFERRED
TO THE TRIAL"*, asked of TNZ 2026-09-12 and outstanding: whether a
delivered receipt exists or only failures. **It is documented.**
`Status: SUCCESS` with `Result: delivered` or `SentOK`, both
DOC-EXAMPLE and DOC-CODES, both listed as delivered by Webhook and GET
Poll.

So "delivered" is an affirmative state, the schema can carry it, and
green on the glance is not condemned to mean "no failure reported yet".

⚠ **But the weaker reading it displaces comes back in a narrower form,
and it is worth more than the reassurance.** `delivered-to-network` is
`Status: Success` and explicitly *"not acknowledged by the mobile (mobile
off or out of coverage)"*, and `Control Deleted` is `Success` for a
message that was aborted. **Two of the four `Success` values are not
arrivals.** So the honest statement is not "success means it arrived" —
it is that *`delivered` and `SentOK` mean it arrived, and the other two
`Success` values do not*. A boolean over `Status` would get this wrong;
only the `Result` value carries it.

### 3. The `Result` taxonomy is not unknown

[[GTC-264]] says *"We have seen exactly one `Result` value"* and
*"Do not model a boolean over a vocabulary you have not seen"*, and
[[GTC-289]] mirrors it. Twenty-one values are documented with
explanations and channels. The restraint was correct when written and
the condition it waited on has arrived — with the caveat that a
*documented* vocabulary is still not an *observed* one, and `Undelivered`
in particular cannot be bucketed without real traffic.

### 4. `PENDING` — the two pages disagree

The API page lists `PENDING` among the webhook `Status` values. The
result-codes page lists `Pending`'s notification channels as
*"Dashboard, GET Poll"* — **no Webhook**. One of the two is wrong. Treat
a `PENDING` webhook as possible and non-terminal; do not rely on
receiving one.

### 5. TNZ's own docs corroborate B1 independently

The send section carries, verbatim: *"A 'Success' response indicates
that the API has accepted your parameters, not that the message has been
delivered. Refer to the API - Status Reporting section for delivery
results."* [[GTC-258]]'s premise no longer rests on one email.

---

## Hazards this record creates

### H-A — we may be sent XML and have no parser for it

`WebhookCallbackFormat` defaults at the Sender level and `sendViaTnz`
sets nothing. If our Sender default is XML, a JSON-only endpoint fails
every report — and, given the retry contract, fails each one 288 times.

Setting the parameter on the send is a **send-path change**, which
[[GTC-264]] *Do not touch* assigns to [[GTC-258]] and excludes here.
So this is either a TNZ dashboard question or a cross-ticket
dependency, and it must be resolved before Phase 3 rather than
discovered in the trial. **Ask TNZ what our Sender default is.**

### H-B — the webhook is not a complete channel, by TNZ's own table

Four states are documented as **not** delivered by webhook:

- `LinkNotPermitted` — Dashboard, Email, GET Poll.
- `CreditHold` — Dashboard, Email, GET Poll.
- `Delayed` — Dashboard, GET Poll.
- `Pending` — Dashboard, GET Poll (contested, see *Contradictions* 4).

`CreditHold` is the serious one. An account out of credit silences
**every** message Gather sends, and produces no webhook for any of them.
Gather would see acceptance, then nothing, forever — which is exactly
the shape of a healthy send. A webhook-only ingest cannot see the
failure mode that matters most, because it is the one that is
account-wide.

**This is the argument for the GET poll, and it is stronger than the
"fallback if the webhook can't be configured" argument that deferred
it.**

### H-C — the payload carries no report timestamp

Every timestamp in the webhook payload is the time the **message was
sent**. Nothing says when the report was raised. So the gap between
acceptance and outcome — [[GTC-264]] *Unknowns* 5, which bears on
[[GTC-258]]'s choice of which stamps move — is measurable only against
our own receipt time. That is a reason to store both, and it is why the
proposed model carries `receivedAt` as well as a provider timestamp.

---

## Rulings taken on this record — 2026-09-12

Four, all founder rulings at the close of Phase 0.

- **The one-envelope finding is accepted and the binding instruction is
  rewritten** in both [[GTC-264]] and [[GTC-288]]. One documented
  envelope parser, a `Type` switch, then two interpreters that know
  nothing of each other. What survives intact: the two payloads MEAN
  different things, `Status` and `Result` are shared names with different
  contracts, and **a `RECEIVED` is a reply**. The provenance trail is
  recorded as its own finding in
  `tnz-inbound-and-delivery-correspondence-2026-08.md`.
- **The GET poll is filed now, as [[GTC-290]], and not built.**
- **`authType` for the new route is `CUSTOM`.** The Stripe entry's own
  understatement gets its own correction ticket, [[GTC-291]], and is not
  fixed in passing.
- **A parse failure answers 5xx**, never 200 and never 4xx. The retry
  window is the mechanism that survives a contract we got wrong.

---

## Drafted for TNZ — 2026-09-12, NOT YET SENT

Recorded here so the tickets can cite them. **Drafted, not asked.**
Also recorded in the correspondence record, which is where their answers
will go.

1. **Can the status webhook and the SMS-received webhook be sent to two
   different URLs?** ⚠ **Gates [[GTC-264]] Phase 3.**
2. **What is our Sender's default `WebhookCallbackFormat`, JSON or
   XML?** ⚠ **Gates [[GTC-264]] Phase 3, and it is the sharper of the
   two** — if the default is XML a JSON-only endpoint fails every report
   288 times, and nothing in our code sets the parameter.
3. **What HTTP status do you expect from our endpoint on success?** Not
   blocking.

⚠ **Neither gating question blocks Phase 1.** The migration stores
`status`, `result` and `destination` as strings whatever the transport
encoding turns out to be, and it is indifferent to which route receives
the callback.

---

## Trial correction procedure

When the trial shows the wire differing from this record:

1. Correct `src/lib/sms/tnz-delivery-contract.ts` — the types, the
   provenance marks and the fixture factory. The fixtures are typed
   against the wire type, so a corrected field name fails `typecheck`
   and every test built on it, loudly.
2. Append the correction to this file **below** the record, dated, with
   what was believed and what was seen. Do not silently edit the record
   — its value is that it is what we believed on 2026-09-12.
3. Nothing else should need to change. If it does, the boundary leaked
   and that is the finding.

---

## Where this bears

- [[GTC-264]] — everything above. Closes blocking *Unknown 1*, answers
  *Unknowns* 3 and 4, supplies the `Result` taxonomy, and raises the
  one-envelope question against its own *Do not touch* list.
- [[GTC-229]] — the authentication scheme is identical to the delivery
  webhook's, which is the ownership ruling's premise, now documented
  rather than inferred from example values. Its *answer 3* provenance
  needs the correction in *Contradictions* 1.
- [[GTC-288]] — the full MO field list, `Type`/`Message`/`ReceivedID`
  discrimination, the 7-day reply window, and TRAP 3's correction.
- [[GTC-258]] — *Contradictions* 5, and H-C on stamp timing.
- [[GTC-192]] — the proposed four-way partition, which it owns.
- [[GTC-289]] — the Resend equivalent of every question here.
- [[GTC-290]] — the GET status poll, filed from *The GET Status Poll* and
  H-B above.
- [[GTC-291]] — the Stripe entry's understatement, found while choosing
  this route's `authType`.
