/**
 * The wire shapes of an `Event`, and the only place either of them is defined.
 *
 * ONE CONTRACT BINDS BOTH SELECTS BELOW: a join credential, the Stripe columns and the
 * check-plan telemetry do not go over the wire. GTC-267 set that contract on the
 * single-event route; GTC-271 extended it to the list route. The sixteen columns are
 * named in `tests/security-validation.ts` — suite 10 holds the single-event route to
 * them, suite 13 the list route.
 *
 * They live in one file because two narrowings maintained in two files are two
 * narrowings that will disagree with each other. They are two CONSTANTS rather than
 * one because the two routes answer two different questions, and a single union would
 * be a superset of both — which is the shape this contract exists to prevent:
 *
 *   - `EVENT_WIRE_SELECT` feeds the host DASHBOARD (`/plan/[eventId]`) and the setup
 *     flow, which read the full venue, dietary and guest-count block.
 *   - `EVENT_LIST_WIRE_SELECT` feeds the events INDEX (`/plan/events`), which renders
 *     one card per event and reads ten scalars. It needs `archived` and `createdAt`,
 *     which the dashboard never reads and which `EVENT_WIRE_SELECT` therefore omits —
 *     so reuse was not available in either direction.
 *
 * Adding a field to either list is how a new one reaches that client. Widening either
 * back to a bare `include` is asserted against in `tests/security-validation.ts`.
 */

/**
 * GTC-267: the wire shape of a single event, and the ONLY thing
 * `src/app/api/events/[id]/route.ts` serialises from `GET` and `PATCH`.
 *
 * Both handlers used to hand back `prisma.event.findUnique` with an `include` and no
 * top-level `select`, so every scalar on the row went out — `sharedLinkToken` (a join
 * credential), `stripePaymentIntentId`, `paidAt`, `amountPaid`, and the whole
 * check-plan telemetry block. None of it was ever read by a caller.
 *
 * The list below is not a guess. It is the union of the two declared client contracts
 * — `Event` in `src/app/plan/[eventId]/page.tsx` and `SetupEvent` in
 * `src/app/plan/[eventId]/setup/page.tsx` (which extends `SerialisedEvent` from
 * `src/lib/lifecycle.ts`) — plus `hostId`, which `TransitionModal` reads. Anything
 * outside it had no reader in the tree.
 *
 * `host` and `coHost` are deliberately absent. They were included with `email`
 * selected, and nothing anywhere reads `event.host` off that route.
 *
 * GTC-271 moved this constant here from the route file. The field list is byte-for-byte
 * what GTC-267 shipped; only its address changed.
 */
export const EVENT_WIRE_SELECT = {
  id: true,
  name: true,
  status: true,
  sentAt: true,
  wrappedAt: true,
  startDate: true,
  endDate: true,
  occasionType: true,
  occasionDescription: true,
  guestCount: true,
  guestCountConfidence: true,
  guestCountMin: true,
  guestCountMax: true,
  dietaryStatus: true,
  dietaryVegetarian: true,
  dietaryVegan: true,
  dietaryGlutenFree: true,
  dietaryDairyFree: true,
  dietaryAllergies: true,
  venueName: true,
  venueType: true,
  venueKitchenAccess: true,
  venueOvenCount: true,
  venueStoretopBurners: true,
  venueBbqAvailable: true,
  venueTimingStart: true,
  venueTimingEnd: true,
  venueNotes: true,
  lastCheckPlanAt: true,
  hostId: true,
  isDemo: true,
  clonedFromId: true,
  aiCallsUsed: true,
  // V2 signal: events that entered the Moment flow have an EventSetup row.
  // The dashboard uses its presence to suppress V1-pipeline actions (GTC-148).
  setup: { select: { id: true } },
} as const;

/**
 * GTC-271: the wire shape of one row in the events list, and the ONLY scalars
 * `GET` in `src/app/api/events/route.ts` serialises.
 *
 * That handler used to call `prisma.event.findMany` with an `include` and no sibling
 * top-level `select` — which in Prisma means "every scalar, plus these relations" — so
 * all sixteen forbidden columns went out for EVERY event the caller holds a role on.
 * The route requires a session and filters on `eventRoles.some.userId`, so this was
 * never GTC-267's anonymous class; it was a response wider than the contract, reachable
 * by a legitimately authenticated caller, `COORDINATOR` included.
 *
 * `EVENT_WIRE_SELECT` was NOT reusable here, in either direction:
 *   - it lacks `archived` and `createdAt`, which `/plan/events` filters and renders;
 *   - it carries ~20 venue, dietary and guest-count fields the index never reads,
 *     multiplied by every event in the list.
 *
 * The list below is the union of what the route's callers actually read, taken from the
 * callers and not from the dashboard's list:
 *   - `Event` in `src/app/plan/events/page.tsx`, the only application caller — `id`,
 *     `name`, `status`, `startDate`, `endDate`, `guestCount`, `occasionType`,
 *     `archived`, `createdAt`, `_count.teams`, `setup`;
 *   - `testSuite11_DemoSessionScope` in `tests/security-validation.ts`, which
 *     enumerates the demo session's blast radius off this route and reads `id`, `name`
 *     and `isDemo` — so `isDemo` is load-bearing for a security assertion, not scenery.
 *
 * `_count.days` is selected and read by nobody. It is kept because the page's own
 * `Event` interface declares it, and a select that makes a declared type lie is a worse
 * trap than an unread aggregate. `_count` exposes no columns.
 *
 * `eventRoles` is NOT here because it carries a `where` bound to the calling user; the
 * route composes it on top of this constant. It has no reader in the tree either, and
 * is kept only because it is a two-field relation with no column exposure — dropping it
 * would spend risk for nothing this contract is about.
 */
export const EVENT_LIST_WIRE_SELECT = {
  id: true,
  name: true,
  status: true,
  startDate: true,
  endDate: true,
  occasionType: true,
  guestCount: true,
  // Read by the `showArchived` filter in `/plan/events`, not rendered.
  archived: true,
  createdAt: true,
  // Read by suite 11's demo-session enumeration. Dropping it makes that every() vacuous.
  isDemo: true,
  // GTC-233: the events list routes V2 events to /plan/[id]/setup, so it needs the
  // same EventSetup signal the dashboard uses to hide V1 controls (GTC-148/149).
  // `setup` is a relation, so it is absent unless named here.
  setup: { select: { id: true } },
  _count: { select: { teams: true, days: true } },
} as const;
