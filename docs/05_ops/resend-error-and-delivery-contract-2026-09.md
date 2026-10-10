# Resend — error codes and delivery events, as published

**Transcribed 2026-09-19 for [[GTC-323]].** A greppable artifact, in the shape
`tnz-inbound-and-delivery-correspondence-2026-08.md` set: a link rots and cannot be diffed.

**Checked against `resend@6.22.0`**, the version installed in this repo on the date above. The SDK
version matters because [[GTC-264]] found TNZ's own two documentation pages disagreeing with each
other, and a contract read against one version while the tree runs another is the same defect.

**Sources, all read on 2026-09-19:**

- `https://resend.com/docs/api-reference/errors`
- `https://resend.com/docs/webhooks/event-types`
- `https://resend.com/docs/webhooks/introduction`
- `https://resend.com/changelog/email-bounce-details`

⚠ **THIS FILE CONTAINS NO DECISIONS.** It records what the provider publishes. Where our code
classifies a value, the classification stays in
`src/lib/email-delivery/resend-error-contract.ts` and `resend-delivery-contract.ts`. Where the
published text settles something those files marked uncertain, it is noted as settled and the
correction is theirs to make, not this file's.

---

## 1. Error codes — `ErrorResponse.name`

Transcribed verbatim. Status is the HTTP status the page pairs with the code.

- `invalid_idempotency_key` — 400 — "Idempotency keys, if present, must have between 1 and 256
  characters."
- `validation_error` — 400 — "An error was found with one or more fields in the request."
- `missing_api_key` — 401 — "Missing API key in the authorization header."
- `restricted_api_key` — 401 — "This API key is restricted to only send emails."
- `email_above_quota` — 403 — "You can't retrieve this email's content because it was above quota
  when received."
- `invalid_permission` — 403 — "Access token is missing required scopes."
- `restricted_api_key` — 403 — "API key is not active"
- `suspended_api_key` — 403 — "This API key is suspended"
- `validation_error` — 403 — "You can only send testing emails to your own email address
  (`youremail@domain.com`)..."
- `validation_error` — 403 — "The `domain.com` domain is not verified. Please, add and verify your
  domain."
- `not_found` — 404 — "The requested endpoint does not exist."
- `method_not_allowed` — 405 — "Method is not allowed for the requested path."
- `concurrent_idempotent_requests` — 409 — "There is another request in progress with the same
  idempotency key."
- `invalid_idempotent_request` — 409 — request body mismatch with an existing idempotency key
- `resource_locked` — 409 — "Another request is already updating this resource."
- `invalid_attachment` — 422 — "Attachment must have either a `content` or `path`."
- `invalid_parameter` — 422 — "The `parameter` must be a valid UUID."
- `missing_required_field` — 422 — request body missing required fields
- `missing_required_parameter` — 422 — request missing required parameters
- `daily_quota_exceeded` — 429 — "You have exceeded your daily email sending quota."
- `monthly_quota_exceeded` — 429 — "You have exceeded your monthly email sending quota."
- `rate_limit_exceeded` — 429 — "Too many requests. Please limit the number of requests per
  second."
- `application_error` — 500 — "An unexpected error occurred."
- `service_unavailable` — 503 — "API is temporarily unavailable"

### ⚠ What the SDK declares and the page does not document

`resend@6.22.0` declares a 21-value error union. **`security_error` and `internal_server_error`
appear in the SDK's types and on no documented page read here.** The page's only 500 is
`application_error`.

⚠ **That is this ticket's own thesis, from the other side.** GTC-323 leads on *an SDK's types tell
you the shape and never the vocabulary*. Here the vocabulary is published and the SDK's union is
**larger than it** — so a declared value is not a documented one, and neither containment runs the
way you would guess.

### ⚠ AND NO DOCUMENTED CODE COVERS A WRONG API KEY

The page covers a **missing** key (`missing_api_key`), a **restricted** one and a **suspended** one.
**There is no documented code for a key that is simply incorrect.**

This repo has observed what actually happens: a live invalid key answers **`validation_error` / 401
/ "API key is invalid"** ([[GTC-189]] slice 5f, measured 2026-09-19). That combination is
undocumented twice over — `validation_error` is published at 400 and 403 and never at 401, and its
published meanings are field validation and domain verification, neither of which is authentication.

**So the one code anybody here has ever SEEN from this provider is filed under a name that does not
describe the situation it was returned for, and the page does not connect them.** Recorded as an
observation about the wire, not as a correction to the provider.

---

## 2. Webhook event types

Transcribed verbatim from `/docs/webhooks/event-types`.

**Email events:**

- `email.sent` — "Occurs whenever the API request was successful. Resend will attempt to deliver the
  message to the recipient's mail server."
- `email.delivered` — "Occurs whenever Resend successfully delivered the email to the recipient's
  mail server."
- `email.delivery_delayed` — "Occurs whenever the email couldn't be delivered due to a temporary
  issue."
- `email.bounced` — "Occurs whenever the recipient's mail server permanently rejected the email."
- `email.complained` — "Occurs whenever the email was successfully delivered, but the recipient
  marked it as spam."
- `email.failed` — "Occurs whenever the email failed to send due to an error."
- `email.opened` — "Occurs whenever the recipient opened the email."
- `email.clicked` — "Occurs whenever the recipient clicks on an email link."
- `email.received` — "Occurs whenever Resend successfully receives an email."
- `email.scheduled` — "Occurs whenever the email is scheduled to be sent."
- `email.suppressed` — "Occurs whenever the email is suppressed by Resend."

**Domain events:** `domain.created`, `domain.updated`, `domain.deleted`.
**Contact events:** `contact.created`, `contact.updated`, `contact.deleted`.
**Suppression events:** `suppression.added`, `suppression.removed`.

### ⚠ Against the twelve values this repo declares

`ResendLastEvent` is `GetEmailResponseSuccess['last_event']` — twelve values in `resend@6.22.0`:
`queued`, `scheduled`, `sent`, `delivery_delayed`, `delivered`, `opened`, `clicked`, `bounced`,
`failed`, `suppressed`, `complained`, `canceled`.

- **`queued` and `canceled` are declared and are not documented webhook event types.**
- **`email.received` is a documented event type and is not a declared `last_event`.**

⚠ **These are two different surfaces** — a poll field against a webhook catalogue — so the
divergence is not necessarily an error. It is recorded because nothing else in the repo records
that they differ, and because a reader comparing them would otherwise have to discover it.

---

## 3. Bounce `type` and `subType`

From `/changelog/email-bounce-details`, and the example payload in `/docs/webhooks/introduction`.

**`type` — three values, documented:**

- **`Permanent`** — "also known as 'hard bounce', where the email is rejected by the recipient's
  mail server, and it will never be delivered."
- **`Transient`** — "also known as 'soft bounce', where the email is rejected by the recipient's
  mail server, but it could be delivered in the future."
- **`Undetermined`** — "where the recipient's email server bounced, but the bounce message didn't
  contain enough information for Resend to determine the underlying reason."

**`subType` — NOT enumerated anywhere read.** The field exists and carries "more granular
information". **One value appears, in an example payload only: `Suppressed`.** No closed list is
published.

The example payload, verbatim:

```json
"bounce": {
  "message": "The recipient's email address is on the suppression list because it has a recent history of producing hard bounces.",
  "subType": "Suppressed",
  "type": "Permanent"
}
```

---

## 4. What this settles, and what it does not

⚠ **Asked for by name at the founder's instruction, 2026-09-19. Answered one at a time, and where
the answer is "no" that is the finding.**

### ✅ SETTLED — the bounce `type` vocabulary

**Three values, published, with meanings: `Permanent`, `Transient`, `Undetermined`.** That is the
hard-against-soft partition [[GTC-289]] phase 1 could not derive, and the reason it could not is
exactly GTC-323's thesis — the SDK declares `type` and `subType` as bare `string`, so the shape was
readable and the vocabulary was not.

⚠ **AND IT DOES NOT REACH OUR POLLER, WHICH IS THE PART TO CARRY.** `resend-delivery-contract.ts`
already records it: *"the poll could not supply one anyway — `last_event` has ONE `bounced` member
with no type on it."* The partition lives on the **webhook** payload; the repo reads the **poll**.
So knowing the vocabulary does not by itself let this tree tell a hard bounce from a soft one —
that needs the webhook, which is [[GTC-289]]'s and is unbuilt.

### ✅ SETTLED — `email.delivered` is NOT affirmative

> "Occurs whenever Resend successfully delivered the email to the recipient's **mail server**."

**The recipient's mail server, not the recipient.** [[GTC-289]] Unknown 3 asked *"whether Resend's
`delivered` is affirmative or merely the absence of a failure"*, and the published answer is the
narrower thing again: a successful handoff to the receiving MTA. What happens after that handoff —
inbox, spam folder, silent discard — is not what the event reports.

✅ **So `PROVIDER_REPORTS_DELIVERED` was named correctly and for the right reason.** That module's
own note — *"it is deliberately about who SAID it"* — is confirmed rather than merely vindicated.

⚠ **And `email.complained` corroborates it from the other side:** *"the email was successfully
delivered, but the recipient marked it as spam."* A complaint is published as following a
successful delivery, which is what slice 7a's `DELIVERY_STATE_MEANS` already assumes in mapping
`COMPLAINED` to not-a-delivery-failure — *"a LIVE address whose owner does not want mail."*

### ✅ SETTLED — `application_error`, one of the two marked UNCERTAIN

> `application_error` — 500 — "An unexpected error occurred."

**Published at HTTP 500 and described as unexpected — provider-side.** The contract module reads it
as provider-side *"from its neighbours"* and warns that *"if it turns out to mean 'your application
did something wrong', this entry is wrong and a retry wastes two attempts."*

✅ **The inference was right, and it is now read rather than inferred.** `PROVIDER_FAULT` stands, the
retry is correct, and the `UNCERTAIN` marker on that entry can come down.

### ⚠ NOT SETTLED — `security_error`, the other one

**It is not documented anywhere read.** It exists in `resend@6.22.0`'s declared union and on no
published page.

So the contract module's reading — `REQUEST_REFUSED`, terminal, chosen because *"a terminal keeps a
mystery from being sent three times"* — **stays an inference and its `UNCERTAIN` marker stays up.**

⚠ **AND THIS IS THE SHARPER HALF OF THE PAIR.** GTC-323 records that *"the two entries marked
UNCERTAIN are not the risky ones — they are the ones whose risk was visible."* Reading the
documentation settled one of the two and left the other exactly where it was. **A document answers
the questions it covers, and the residue is not smaller for having been looked up.**

### ⚠ NOT SETTLED — the `subType` vocabulary

The field is documented as existing and carrying granular detail. **No enumeration is published.**
One value — `Suppressed` — appears in an example. Anything built on `subType` is built on an open
set, and a `Record` over it would be a `Record` over a guess.

### ⚠ NOT SETTLED — which id joins a delivery event to a send

Not covered by any page read here, and it is [[GTC-289]] phase 1's open finding (`id` /
`message_id` / `email_id`). **A document cannot settle it and neither can this ticket:** it needs a
live accepted send to observe, which needs [[GTC-247]]. The two tickets are complements, as
GTC-323's own scope says — *"this one makes the vocabulary knowable; that one makes the shape
observable."*

---

## 5. What an executor should do with this

- **Read it before changing either contract module.** Both classify values this file now quotes.
- ✅ **The `application_error` marker IS down** — taken down 2026-09-19 with this file cited.
  `PROVIDER_FAULT` stands on the document rather than on its neighbours.
- ⚠ **The `security_error` marker stays up, and now says why in one line**: declared in the SDK,
  published nowhere. Do not remove it on the strength of this file — it records an ABSENCE, and an
  absence is not evidence either way. That is the whole difference between it and
  `application_error`, where the same reading found the answer.
- ⚠ **Check every value against BOTH sources.** Neither is a superset of the other: the SDK named
  two fields whose values only the prose enumerates (`type` / `subType`), and the prose publishes
  a vocabulary the SDK's union does not contain (`security_error`, `internal_server_error`). **A
  `Record` over an SDK union guards against the SDK changing and not against the provider having
  values the SDK never declared.**
- **Do not build anything on `subType`** until a vocabulary is published or observed.
- ⚠ **Re-check against the SDK version.** This is `resend@6.22.0`. If the installed version moves,
  the union may move with it and this file does not.
