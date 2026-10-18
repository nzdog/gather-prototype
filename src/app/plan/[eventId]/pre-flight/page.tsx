'use client';

/**
 * GTC-188 (I1) — the pre-flight. Kate's last look before the send.
 *
 * ROUGH FIRST PASS. This is a crude, visible assembly of five pieces that already exist
 * underneath, plus one placeholder for a piece that does not. It is deliberately one
 * scrolling page of numbered steps rather than a wizard: the shape is meant to be looked
 * at and argued with, not shipped.
 *
 * Hinge §1: the threshold is not a summary screen before a button — it is a guided check
 * Gather does with Kate, and as she moves through it, the weight lifts.
 *
 * ✅ STEP 5 SENDS NOW — GTC-189 SLICE 5f, 2026-09-19, AND THIS LINE USED TO SAY THE OPPOSITE. It read
 * *"NOTHING HERE SENDS. The press is GTC-189 (I2). Step 5 is a dead button on purpose."* The press
 * exists, the dispatcher exists, the board's fourth red exists, and this screen is the ONE surface
 * that may reach them — two others posted to the press until slice 5c took them down (option D).
 *
 * ⚠ READ THE COMMENT AT STEP 5 BEFORE PRESSING IT IN THIS ENVIRONMENT. What it does here is not what
 * it does on a working deployment, and the difference is permanent.
 *
 * THE TWO CADENCE CONTROLS ARE THE POINT OF THIS PASS. GTC-179 stored both, obeys both on
 * the direct and proxy paths, and closed as machinery with neither reachable by a host.
 * Step 3 is the surface that makes them reachable — the per-EVENT pace and the per-PERSON
 * mark on one screen, per GTC-179's Ruling 8. ⚠ Moment 4 §10.3/§10.7 still place the mark
 * at Moment 1 beside the household picker; Ruling 8 supersedes both and the spec passages
 * are not edited. Do not re-derive the Moment 1 placement from them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  NUDGE_PACE_OFFSET_DAYS,
  resolveNudgeOffsetDays,
  type NudgePace,
} from '@/lib/nudge-cadence';
import {
  DIETARY_OPTIONS,
  dietaryTitleSummary,
  type DietaryData,
  type DietaryStatus,
} from '@/lib/dietary';
import AccordionShell from '@/components/plan/AccordionShell';
import { draftAuthorLine, firstNameOf } from '@/lib/messages/ask-register';
import {
  TEST_EMAIL_OUTCOMES,
  TEST_EMAIL_WORDS,
  testEmailLead,
  testEmailOutcomeLine,
  testEmailTextNote,
  type TestEmailOutcome,
} from '@/lib/preflight/test-email';
import { PRESS_REFUSAL_WORDS, THRESHOLD_SCRIPT } from '@/lib/press/press-words';
import {
  CHASED_BY_LABEL,
  CHASED_BY_VALUE,
  CHASE_DEFAULT_PILLS,
  CHASE_DEFAULT_QUESTION,
  CHASE_OPTED_OUT_PLACEHOLDER,
  DEFAULT_SUFFIX,
  HOST_LIST_BLURB,
  HOST_LIST_EMPTY,
  HOST_LIST_HEADING,
  HOST_LIST_NOT_ASKED_HEADING,
  HOST_LIST_NOT_CHASED_BLURB,
  HOST_LIST_NOT_CHASED_HEADING,
  MESSAGE_STEP_PARTS,
  NOT_MESSAGED_WHY,
  NO_REPLY_TO_LINE,
  TOLD_ABOUT_LABEL,
  chasePersonPills,
  composePreview,
  hostListReason,
  notChasedReason,
  messageCountLine,
  messageRows,
  notMessagedRows,
  replyToLine,
  toldAboutValue,
} from '@/lib/preflight/ask-preview-compose';
import type { AskPreview, NotMessagedLinkState } from '@/lib/preflight/ask-preview';
import { OPT_OUT_LINE } from '@/lib/sms/opt-out-line';
// [[GTC-329]] — moved unchanged, so the post-press surface shows the same row as step 3.
import { MarkRows, Pill, cadenceSentence, type Member } from '@/components/preflight/mark-rows';
import AfterThePress from '@/components/preflight/AfterThePress';
import EventDetails from '@/components/shared/EventDetails';
import { DemoBanner } from '@/components/demo/DemoBanner';
import PretendSend from '@/components/demo/PretendSend';
import { pretendList, type PretendList } from '@/lib/demo/pretend-send';
import { COPY_WORDS, isCopyAddress } from '@/lib/demo/copy-address';
import { BOARD_MOVE_AFTER_MS, SEE_THE_BOARD_LINK } from '@/lib/preflight/after-press-words';
import { boardHref, itemDoorHref } from '@/lib/events/home-href';
import {
  CONTACT_BOX_WORDS,
  boxRefusalLine,
  contactLineOffer,
  nameLabel,
  savedPreflightLine,
} from '@/lib/contact/contact-box';
import { formatPhoneForDisplay } from '@/lib/phone';
import MomentArc from '@/components/plan/MomentArc';
import { AT_OPENING, AT_PEOPLE, AT_PLAN, STRIP_WORDS, setupHref } from '@/lib/moments/strip';
import { HOUSEHOLD_CONTACT_LINE } from '@/lib/households/contact-line';
import {
  PREFLIGHT_STEP_TITLES,
  firstUnticked,
  goToStepLine,
  looseLine,
  settledSteps,
  talkLine,
} from '@/lib/preflight/next-check';
// [[GTC-377]] (Q1): the step, moved out of this page so a suite can render it.
import Step from '@/components/preflight/PreflightStep';
import { INVITES_ONLY_WORDS } from '@/lib/setup/invites-only';
// [[GTC-386]] (item 68): the five ticks, remembered in this browser.
import {
  READY_PRINT,
  browserStore,
  forgetTicks,
  preflightPrints,
  printOf,
  readTicks,
  settleStepFour,
  standingTicks,
  tickKey,
  writeTicks,
  type TickPrints,
  type TickStep,
} from '@/lib/preflight/tick-memory';

// ─── Wire shapes (mirror /api/events/[id]/pre-flight) ────────────────────────

interface HouseholdView {
  id: string;
  label: string;
  littleCount: number;
  contactPersonEventId: string | null;
  resolvedContactPersonEventId: string | null;
  members: Member[];
  /** GTC-363 (item 6): optional, so a view built without it shows the line. */
  isHostHousehold?: boolean;
}

interface PreFlightData {
  /** [[GTC-386]] (Q8): who is looking, so each person's ticks are kept apart. */
  viewerId?: string;
  /** [[GTC-388]] Q24: their own account address, where step 4's test email goes (W2). */
  viewerEmail?: string | null;
  event: {
    id: string;
    name: string;
    startDate: string | null;
    sentAt: string | null;
    nudgePace: NudgePace | null;
    /** [[GTC-368]] (item 17, C2): the details' facts, from the route's widened read. */
    endDate: string | null;
    venueName: string | null;
    venueTimingStart: string | null;
    venueTimingEnd: string | null;
    occasionDescription: string | null;
    eventType: string | null;
    eventTypeOther: string | null;
    /** [[GTC-374]]: invites only — steps 1 and 2 settled, W9 and W10, Moments 2 and 3 not needed. */
    invitesOnly?: boolean;
    /** [[GTC-375]] (W3): a plan put away, waiting to come back. */
    planPutAway?: boolean;
  };
  coverage: {
    unassignedItems: Array<{
      id: string;
      name: string;
      critical: boolean;
      teamName: string | null;
    }>;
    unassignedCount: number;
    criticalUnassignedCount: number;
    complianceRate: number;
    criticalGaps: Array<{ itemId: string; itemName: string }>;
  };
  dietary: DietaryData;
  households: HouseholdView[];
  unhoused: Member[];
  channelCandidates: Array<{
    personEventId: string;
    name: string;
    householdId: string | null;
    householdLabel: string | null;
  }>;
}

/**
 * Who Gather currently talks to for a household, for the collapsed row.
 *
 * Reads `resolvedContactPersonEventId` — the picked channel, or the primary contact when
 * nothing is picked — so the row states the fact rather than the setting. The lookup runs
 * over the whole event's candidates, not the household's members, because a channel is
 * cross-household by design (§10.7: Grandma's channel may live in her daughter's
 * household); `elsewhere` names that household when it is not this one.
 */
function channelFor(
  h: HouseholdView,
  candidates: PreFlightData['channelCandidates']
): { name: string; elsewhere: string | null } | null {
  if (!h.resolvedContactPersonEventId) return null;
  const c = candidates.find((x) => x.personEventId === h.resolvedContactPersonEventId);
  if (c) {
    return {
      name: c.name,
      elsewhere:
        c.householdId === h.id
          ? null
          : c.householdLabel
            ? `${c.householdLabel}’s household`
            : 'not in a household',
    };
  }
  // Not in the candidate list means the stored channel is not messageable — a corrupt
  // row, since the API refuses to write one. Name it rather than silently showing the
  // primary contact, which is what resolveHouseholdChannel deliberately does not do.
  const m = h.members.find((x) => x.personEventId === h.resolvedContactPersonEventId);
  return m ? { name: m.name, elsewhere: null } : null;
}

/**
 * [[GTC-386]] (Q7) — her own change on this page keeps a ticked step ticked: it takes the step's new
 * fingerprint. Only what changed somewhere else, found on arrival, drops a tick.
 */
function restamp(ticks: TickPrints, prints: Partial<Record<1 | 2 | 3 | 4, string>>): TickPrints {
  const out = { ...ticks };
  for (const n of [1, 2, 3, 4] as const) {
    const now = prints[n];
    if (out[n] !== undefined && now !== undefined) out[n] = now;
  }
  return out;
}

/** [[GTC-366]] (item 32) — the sage ring on the box W1's line arrives at, for two seconds. */
const ARRIVAL_RING = ['ring-2', 'ring-accent', 'ring-offset-4', 'rounded-md'];

/** [[GTC-377]] (Q6) — how long the line waits for a step to open before taking her there. */
const STEP_OPEN_WAIT_MS = 220;

const PACE_LABELS: Record<NudgePace, string> = {
  STANDARD: 'Standard',
  RELAXED: 'Relaxed',
  OFF: 'Off',
};

// ─── The screen ──────────────────────────────────────────────────────────────

export default function PreFlightPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [data, setData] = useState<PreFlightData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /*
   * The acknowledgements exist so the flow has an end. [[GTC-386]] (item 68, ruled 2026-10-15) —
   * REMEMBERED IN THIS BROWSER, PER EVENT AND PER PERSON (Q8), and nowhere else: each ticked step
   * holds the fingerprint of what it showed when she ticked it (`tick-memory.ts`), no names. Until
   * this ticket they were lost on a reload. A tick goes when its step has changed somewhere other
   * than this page, Ready with any of steps 1 to 4 (Q7); a settled step is the event's, never stored.
   */
  const [ticks, setTicks] = useState<TickPrints>({});
  const checked = useMemo<Record<number, boolean>>(
    () => ({ 1: !!ticks[1], 2: !!ticks[2], 3: !!ticks[3], 4: !!ticks[4], 5: !!ticks[5] }),
    [ticks]
  );
  // Step 4's fingerprint comes from its own read, a moment after the page's. Until it has been
  // checked, a remembered step 4 is drawn but does not count towards Send.
  const [messagePrint, setMessagePrint] = useState<string | null>(null);
  const [fourPending, setFourPending] = useState(false);
  // The first arrival of a visit compares what was stored; every later one follows her own change.
  const arrived = useRef(false);
  const fourArrived = useRef(false);

  // Which household rows are expanded. Empty = all collapsed, which is the landing state:
  // step 3 is a list to scan first and open second. GTC-364 (Q2): several may be open at
  // once, as on Moment 2, so opening one never shuts another above it.
  const [openHouseholds, setOpenHouseholds] = useState<string[]>([]);

  // [[GTC-377]] — which of steps 1 to 4 are open. Empty on every visit: the steps start closed and
  // nothing remembers them (ruled at scoping). Several may be open at once, as on Moment 2, and
  // opening one never shuts another. Ready never folds.
  const [openSteps, setOpenSteps] = useState<number[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${eventId}/pre-flight`);
    if (!res.ok) {
      setError(`Could not load the pre-flight (${res.status})`);
      return;
    }
    const fresh: PreFlightData = await res.json();
    // [[GTC-386]] — set in the same pass as the data, so the steps are drawn ticked from their first
    // frame. No viewer, no memory: the ticks are for this visit, as before.
    const key = fresh.viewerId ? tickKey(eventId, fresh.viewerId) : null;
    const prints = preflightPrints(fresh);
    if (key && fresh.event.sentAt) {
      forgetTicks(browserStore(), key);
    } else if (key && !arrived.current) {
      const kept = standingTicks(
        readTicks(browserStore(), key),
        prints,
        settledSteps(fresh.event.invitesOnly === true)
      );
      setTicks(kept);
      setFourPending(kept[4] !== undefined);
    } else {
      setTicks((t) => restamp(t, prints));
    }
    arrived.current = true;
    setData(fresh);
    setError(null);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  // [[GTC-386]] — every change to the ticks is kept, once the visit's first read has compared.
  const tickStoreKey = data?.viewerId ? tickKey(eventId, data.viewerId) : null;
  const sent = !!data?.event.sentAt;
  useEffect(() => {
    if (!tickStoreKey || !arrived.current || sent) return;
    writeTicks(browserStore(), tickStoreKey, ticks);
  }, [ticks, tickStoreKey, sent]);

  /** [[GTC-386]] — step 4's fingerprint, from its message: checked on arrival, kept on her changes. */
  const onMessagePrint = useCallback((print: string) => {
    setMessagePrint(print);
    if (!fourArrived.current) {
      fourArrived.current = true;
      setTicks((t) => (t[4] === '' ? { ...t, 4: print } : settleStepFour(t, print)));
      setFourPending(false);
    } else {
      setTicks((t) => (t[4] !== undefined ? { ...t, 4: print } : t));
    }
  }, []);

  // ── writes ────────────────────────────────────────────────────────────────

  const patchCadence = async (body: Record<string, unknown>) => {
    setSaving(true);
    const res = await fetch(`/api/events/${eventId}/pre-flight/cadence`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'That did not save.');
      return;
    }
    await load();
  };

  const patchChannel = async (householdId: string, contactPersonEventId: string | null) => {
    setSaving(true);
    const res = await fetch(`/api/events/${eventId}/pre-flight/channel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ householdId, contactPersonEventId }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'That did not save.');
      return;
    }
    await load();
  };

  // The dietary correction writes back to EventSetup.dietaryData — G1's underlying data,
  // through the existing setup route. No second copy (GTC-185 acceptance).
  const saveDietary = async (next: DietaryData) => {
    setSaving(true);
    const res = await fetch(`/api/events/${eventId}/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dietaryData: next }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'That did not save.');
      return;
    }
    await load();
  };

  // [[GTC-374]] (Q8): an invites-only event's steps 1 and 2 are ticked for her.
  // [[GTC-386]]: a remembered step 4 counts once its message has been checked.
  const allChecked = useMemo(() => {
    const settled = settledSteps(data?.event.invitesOnly === true);
    return !fourPending && [1, 2, 3, 4, 5].every((n) => checked[n] || settled[n]);
  }, [checked, data, fourPending]);

  /*
   * ── GTC-189 SLICE 5f — THE PRESS, CALLED ONCE ───────────────────────────────
   *
   * ⚠ THREE GUARDS AGAINST A SECOND PRESS, AND THEY ARE NOT REDUNDANT BECAUSE THEY FAIL DIFFERENTLY.
   * The press is ruled ONE ACT, NO RECALL, so a double-click must not be able to produce a second
   * anything:
   *
   *   1. `pressing` — the in-flight latch, checked at the TOP of this function rather than only in
   *      the button's `disabled`, because a disabled attribute is a rendering and a second click can
   *      land before React re-renders.
   *   2. `pressed` — the done latch, so the button stays spent for the life of the page.
   *   3. The route's own `ALREADY_SENT`, which is the only one that holds across a page reload and is
   *      therefore the real guarantee. The two above make the common case quiet; this one makes it
   *      correct.
   *
   * It reads the `code` and shows the press's own words for that state — never the route's prose,
   * which is written for a log, and never a generic failure sentence for a state the press named.
   */
  const [pressing, setPressing] = useState(false);
  const [pressed, setPressed] = useState<{ recipients: number } | null>(null);
  const [pressError, setPressError] = useState<string | null>(null);
  // [[GTC-392]] part B — the pretend Send's list, on a sample only (QB1, QB2).
  const [pretend, setPretend] = useState<PretendList | 'failed' | null>(null);

  const press = useCallback(async () => {
    if (pressing || pressed !== null) return;
    setPressing(true);
    setPressError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/send`, { method: 'POST' });
      const body = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (res.ok && body?.success) {
        setPressed({ recipients: Number(body.recipients ?? 0) });
        return;
      }
      const code = typeof body?.code === 'string' ? body.code : null;
      setPressError(
        (code && PRESS_REFUSAL_WORDS[code as keyof typeof PRESS_REFUSAL_WORDS]) ||
          'Nothing was sent. Try again in a moment.'
      );
    } catch {
      /*
       * ⚠ A NETWORK FAILURE IS NOT A REFUSAL, AND THE WORDS SAY SO CAREFULLY. The request may have
       * reached the press and committed before the connection dropped, so this cannot claim nothing
       * was sent — every refusal sentence above can, because the route answered. Reloading is the
       * honest instruction: `ALREADY_SENT` is what will tell her which way it went.
       */
      setPressError('Gather could not tell whether that went through. Reload the page to check.');
    } finally {
      setPressing(false);
    }
  }, [eventId, pressing, pressed]);

  /*
   * [[GTC-357]] — AFTER THE PRESS, THE BOARD. Founder, PLAN RULINGS 2026-10-03, Q2: *"Lines, link,
   * then board (Recommended)"* — the threshold lines show with "See the board →" under them, and
   * after about 8 seconds, roughly the time it takes to read them, the page moves to the board by
   * itself. Outside `press`, so the press handler and its dependency list are untouched; before the
   * after-the-press return below, so the hook order never changes.
   */
  useEffect(() => {
    if (!pressed) return;
    const timer = setTimeout(() => window.location.assign(boardHref(eventId)), BOARD_MOVE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [pressed, eventId]);

  // [[GTC-386]] — after the press the ticks have done their work: this event's are forgotten.
  useEffect(() => {
    if (pressed && tickStoreKey) forgetTicks(browserStore(), tickStoreKey);
  }, [pressed, tickStoreKey]);

  /*
   * [[GTC-392]] part B — THE PRETEND SEND. The press is untouched (QB1): on a sample it refuses,
   * writes nothing, and the line under Send says so (W2). Only once that line holds W2 does this read
   * step 4's own message read, which writes nothing, and build what Send would have done from it, as
   * the drain composes it. It records nothing (QB2). Outside `press`, so its handler is unchanged.
   */
  useEffect(() => {
    if (pressError !== PRESS_REFUSAL_WORDS.DEMO_EVENT) {
      setPretend(null);
      return;
    }
    let live = true;
    fetch(`/api/events/${eventId}/pre-flight/message`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((preview) => {
        if (live) setPretend(pretendList(preview));
      })
      .catch(() => {
        if (live) setPretend('failed');
      });
    return () => {
      live = false;
    };
  }, [pressError, eventId]);

  if (error && !data) {
    return <div className="max-w-3xl mx-auto px-6 py-16 text-gray-600">{error}</div>;
  }
  if (!data) {
    return <div className="max-w-3xl mx-auto px-6 py-16 text-gray-400">Loading…</div>;
  }

  /*
   * [[GTC-329]], ruled 2026-09-29 — AFTER THE PRESS THIS ADDRESS IS A SMALLER SURFACE, NOT THIS ONE.
   *
   * Everything below speaks before the press — "Before you send", five checks, a preview of what
   * each person "will receive", and a Send the press refuses `ALREADY_SENT`. After it, the host
   * comes here for the three decisions the chase reads when it runs: the don't-chase mark, the
   * per-person exception and the event switch. Pace is left out, by the same ruling; so is the
   * channel picker, which after the press would move the chase onto someone never sent the ask.
   *
   * The same address rather than a new one, so GTC-192 Ruling 17's "revisited where it is set (the
   * pre-flight)" stays literally true. After every hook above, so the hook order never changes.
   */
  if (data.event.sentAt) {
    return <AfterThePress eventId={eventId} />;
  }

  const { coverage, dietary, households, unhoused, channelCandidates } = data;
  const pace = data.event.nudgePace;
  // [[GTC-374]] (item 14): invites only. Plain values, not hooks (after the after-the-press return).
  const invitesOnly = data.event.invitesOnly === true;
  const settled = settledSteps(invitesOnly);

  /*
   * [[GTC-366]] (item 32) — THE WAY FROM THE GREYED SEND TO THE FIRST STEP NOT YET TICKED. Ruled
   * 2026-10-06 (Q1 to Q4): one tap scrolls that step to the top of the screen, puts the focus on its
   * box and rings it for two seconds. It ticks nothing and presses nothing. A plain function, not a
   * hook: nothing here may add a hook after the after-the-press return above.
   */
  const nextStep = firstUnticked({ ...checked, ...settled });
  /*
   * [[GTC-386]] — one tick for all five boxes: it stamps the step with what it shows now. A plain
   * function, like the others here, after the after-the-press return.
   */
  const stepPrints = preflightPrints(data);
  const tick = (n: TickStep, v: boolean) => {
    if (n === 4) setFourPending(false);
    setTicks((t) => {
      const next = { ...t };
      if (!v) delete next[n];
      else next[n] = n === 5 ? READY_PRINT : n === 4 ? (messagePrint ?? '') : stepPrints[n];
      return next;
    });
  };
  const toggleStep = (n: number) =>
    setOpenSteps((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  /*
   * [[GTC-377]] (Q6) — the line opens the step it names, then takes her there. The order matters:
   * with the steps closed the page is too short to bring a step to the top of the screen until it
   * has opened, so the scroll waits for the fold. It never closes a step; Ready never folds.
   */
  const goToStep = (n: number) => {
    const section = document.getElementById(`step-${n}`);
    if (!section) return;
    const opening = n <= 4 && !settled[n] && !openSteps.includes(n);
    if (opening) setOpenSteps((prev) => (prev.includes(n) ? prev : [...prev, n]));
    const arrive = () => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const box = section.querySelector<HTMLInputElement>('header input[type="checkbox"]');
      if (!box) return;
      box.focus({ preventScroll: true });
      const ring = box.closest('label');
      if (!ring) return;
      ring.classList.add(...ARRIVAL_RING);
      window.setTimeout(() => ring.classList.remove(...ARRIVAL_RING), 2000);
    };
    if (opening) window.setTimeout(arrive, STEP_OPEN_WAIT_MS);
    else arrive();
  };
  // [[GTC-377]] (W1 to W3) — what a closed row says when something inside needs her.
  const loose = looseLine(coverage.criticalUnassignedCount);
  const talk = talkLine(households.filter((h) => channelFor(h, channelCandidates) === null).length);

  return (
    <div className="min-h-screen bg-warm-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <header className="mb-8">
          {/*
            [[GTC-367]] (items 2 and 31) — before the press: the way back to Moment 3 (W4), and the
            strip, Moments 1 to 3 done and 4 current (plan Q4). Each tap opens the setup page at that
            Moment by its address; Moment 3 is where the setup page opens by itself. Plain links: no
            hook is added after the after-the-press return above.
          */}
          {/*
            [[GTC-374]] (W9): an invites-only event goes back to Moment 2's opening, where she chose
            it and where "Let’s do this →" starts a plan; Moments 2 and 3 read "not needed" and
            open the same place (Q6). The planned event's link and strip are as they were.
          */}
          {invitesOnly ? (
            <a
              href={setupHref(eventId, AT_OPENING)}
              className="mb-4 inline-block text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"
            >
              {STRIP_WORDS.BACK_TO_WHATS_THE_PLAN}
            </a>
          ) : (
            <a
              href={`/plan/${eventId}/setup`}
              className="mb-4 inline-block text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"
            >
              {STRIP_WORDS.BACK_TO_WHOS_ON_WHAT}
            </a>
          )}
          {/* [[GTC-384]] (item 61, Q7): more room for the strip and more space above and below,
              here only, so each Moment's label and its tick sit on one line. MomentArc is untouched. */}
          <div className="mt-2 mb-8 lg:-mx-16">
            <MomentArc
              currentMoment={4}
              completedMoments={[1, 2, 3]}
              notNeeded={invitesOnly ? [2, 3] : undefined}
              doors={{
                1: { href: setupHref(eventId, AT_PEOPLE) },
                2: {
                  href: invitesOnly ? setupHref(eventId, AT_OPENING) : setupHref(eventId, AT_PLAN),
                },
                3: { href: invitesOnly ? setupHref(eventId, AT_OPENING) : setupHref(eventId) },
              }}
            />
          </div>
          {/* [[GTC-368]] (item 17, Q1): the small name line is the event's name and its details. */}
          <div className="mb-1">
            <EventDetails
              facts={{
                ...data.event,
                id: eventId,
                startDate: data.event.startDate ?? '',
                endDate: data.event.endDate ?? data.event.startDate ?? '',
              }}
              className="text-sm text-gray-400 hover:text-gray-700 text-left"
            />
          </div>
          <h1 className="text-2xl font-medium text-gray-900">Before you send</h1>
          <p className="text-gray-600 mt-2">
            Five things to go through. Nothing goes out until you press at the end.
          </p>
          {/* [[GTC-374]] (W10). */}
          {invitesOnly ? (
            <p
              data-invites-only-line=""
              className="mt-3 rounded-md border border-sage-200 bg-sage-50 px-3 py-2 text-sm text-gray-700"
            >
              {INVITES_ONLY_WORDS.PREFLIGHT_LINE}
              {/* [[GTC-375]] (W3): where her plan went, and how to bring it back. */}
              {data.event.planPutAway === true && (
                <span data-plan-waiting="" className="mt-1 block">
                  {INVITES_ONLY_WORDS.PREFLIGHT_WAITING}
                </span>
              )}
            </p>
          ) : null}
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          {saving && <p className="text-sm text-gray-400 mt-3">Saving…</p>}
        </header>

        {/* ── 1. Coverage ─────────────────────────────────────────────────── */}
        <Step
          n={1}
          title={PREFLIGHT_STEP_TITLES[0]}
          blurb="Everything that has no owner yet. None of it blocks you."
          settled={!!settled[1]}
          checked={!!checked[1]}
          onCheck={(v) => tick(1, v)}
          open={openSteps.includes(1)}
          onToggle={() => toggleStep(1)}
          line={loose ? { text: loose, amber: true } : null}
        >
          <div className="flex gap-6 mb-4">
            <div>
              <p className="text-2xl font-medium text-gray-900">{coverage.unassignedCount}</p>
              <p className="text-sm text-gray-500">unassigned</p>
            </div>
            <div>
              <p
                className={`text-2xl font-medium ${
                  coverage.criticalUnassignedCount > 0 ? 'text-amber-700' : 'text-gray-900'
                }`}
              >
                {coverage.criticalUnassignedCount}
              </p>
              <p className="text-sm text-gray-500">critical and unassigned</p>
            </div>
            <div>
              <p className="text-2xl font-medium text-gray-900">{coverage.complianceRate}%</p>
              <p className="text-sm text-gray-500">confirmed so far</p>
            </div>
          </div>

          {coverage.unassignedCount === 0 ? (
            <p className="text-sm text-gray-600">Everything has an owner.</p>
          ) : (
            <>
              <ul className="text-sm text-gray-700 space-y-1 max-h-64 overflow-y-auto pr-2">
                {coverage.unassignedItems.map((i) => (
                  <li key={i.id} className="flex items-center gap-2">
                    {i.critical && (
                      <span className="text-[11px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        critical
                      </span>
                    )}
                    {/* [[GTC-381]] (ruling 4): each item opens Moment 3 with that item brought
                        to the middle and outlined (GTC-380's arrival), in the same tab. */}
                    <a
                      href={itemDoorHref(eventId, i.id)}
                      className="text-gray-700 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-600"
                    >
                      {i.name}
                    </a>
                    {i.teamName && <span className="text-gray-400">· {i.teamName}</span>}
                  </li>
                ))}
              </ul>
              {/* [[GTC-381]] (Q16, Q17): W11, then "Refresh this list" on its own (W12). */}
              <p className="text-xs text-gray-400 mt-3">
                Each one opens &ldquo;Who&rsquo;s on what?&rdquo; at that item. Come back here with
                &ldquo;Is everyone sorted?&rdquo; at the top.{' '}
                <button
                  type="button"
                  onClick={load}
                  className="underline decoration-gray-300 underline-offset-2 hover:text-gray-600"
                >
                  Refresh this list
                </button>
              </p>
            </>
          )}
          {/* [[GTC-380]] (item 46, Q1): step 1's own numbers say it; the route still sends the
              readiness check's lines, and nothing on this page reads them. */}
        </Step>

        {/* ── 2. Dietary ──────────────────────────────────────────────────── */}
        <Step
          n={2}
          title={PREFLIGHT_STEP_TITLES[1]}
          blurb="Event-level, not by name. The last check before people eat."
          settled={!!settled[2]}
          checked={!!checked[2]}
          onCheck={(v) => tick(2, v)}
          open={openSteps.includes(2)}
          onToggle={() => toggleStep(2)}
          line={{
            text: dietaryTitleSummary(dietary),
            amber: dietary.status === 'unanswered',
          }}
        >
          <DietarySection value={dietary} onSave={saveDietary} />
        </Step>

        {/* ── 3. Who Gather talks to, and how often ───────────────────────── */}
        {/* [[GTC-378]] item 47: W7 as ruled at scoping; W8 on an invites-only event (ruling 3). */}
        <Step
          n={3}
          title={PREFLIGHT_STEP_TITLES[2]}
          blurb={
            invitesOnly
              ? 'Everyone with an email or mobile hears from me. Pick how hard I nudge.'
              : 'Everyone with an email or mobile hears from me. Pick who takes the kids’ asks, and how hard I nudge.'
          }
          checked={!!checked[3]}
          onCheck={(v) => tick(3, v)}
          open={openSteps.includes(3)}
          onToggle={() => toggleStep(3)}
          line={talk ? { text: talk, amber: true } : null}
        >
          {/* The per-EVENT pace (Moment 4 §10.3). */}
          <div className="mb-6 pb-6 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-1">Nudge pace for this event</p>
            <p className="text-sm text-gray-500 mb-3">
              How often the system follows up with anyone who has not answered.
            </p>
            <div className="flex flex-wrap gap-2">
              <Pill active={pace === null} onClick={() => patchCadence({ nudgePace: null })}>
                Not set
              </Pill>
              {(Object.keys(PACE_LABELS) as NudgePace[]).map((p) => (
                <Pill key={p} active={pace === p} onClick={() => patchCadence({ nudgePace: p })}>
                  {PACE_LABELS[p]}
                </Pill>
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-3">
              {pace === null
                ? cadenceSentence(resolveNudgeOffsetDays({}))
                : cadenceSentence(NUDGE_PACE_OFFSET_DAYS[pace])}
              {pace === null && ' (the default)'}
            </p>
          </div>

          {/* The household channel picker (§10.7) + the per-PERSON mark (§10.3). */}
          {households.length === 0 && unhoused.length === 0 && (
            <p className="text-sm text-gray-500">Nobody has been added to this event yet.</p>
          )}

          {/*
            One collapsed row per household, several open at once, using the same AccordionShell
            Moment 2's sections use. The collapsed row carries the household name and the
            channel, because those are what Kate scans this list for: whose ear Gather has
            for each household. Everything she can CHANGE — the picker and the marks —
            lives behind the expand.
          */}
          <div className="space-y-2">
            {households.map((h) => {
              const channel = channelFor(h, channelCandidates);
              return (
                <AccordionShell
                  key={h.id}
                  id={h.id}
                  label={`${h.label}’s household`}
                  showHide
                  open={openHouseholds.includes(h.id)}
                  onToggle={() =>
                    setOpenHouseholds((prev) =>
                      prev.includes(h.id) ? prev.filter((x) => x !== h.id) : [...prev, h.id]
                    )
                  }
                  headerHint={
                    <span className="text-sm text-gray-500">
                      {channel ? (
                        <>
                          &rarr; {channel.name}
                          {channel.elsewhere && (
                            <span className="text-gray-400"> ({channel.elsewhere})</span>
                          )}
                        </>
                      ) : (
                        <span className="text-amber-700">no one to talk to</span>
                      )}
                    </span>
                  }
                >
                  {h.littleCount > 0 && (
                    <p className="text-xs text-gray-400 mb-3">
                      + {h.littleCount} kid{h.littleCount === 1 ? '' : 's'} without jobs
                    </p>
                  )}

                  {/* [[GTC-384]] (Q4): the picker, its question (item 63's words) and its line only
                      where they are true: not on the host's own household, where her children are
                      hers whoever is picked. Nothing stored changes. */}
                  {!h.isHostHousehold && (
                    <>
                      <label className="block text-sm text-gray-600 mb-1">
                        Who should Gather talk to for the kids in this household?
                      </label>
                      <select
                        value={h.contactPersonEventId ?? ''}
                        onChange={(e) => patchChannel(h.id, e.target.value || null)}
                        className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        {/* value="" is "not picked", which resolves to the primary contact. */}
                        <option value="">{h.label} (main contact)</option>
                        {channelCandidates
                          .filter(
                            (c) =>
                              c.personEventId !==
                              h.members.find((m) => m.householdRole === 'PRIMARY_CONTACT')
                                ?.personEventId
                          )
                          .map((c) => (
                            <option key={c.personEventId} value={c.personEventId}>
                              {c.name}
                              {c.householdId === h.id
                                ? ''
                                : c.householdLabel
                                  ? ` — ${c.householdLabel}’s household`
                                  : ' — not in a household'}
                            </option>
                          ))}
                      </select>
                      {/* GTC-363 (item 6, W1), darker since [[GTC-384]] (item 63). */}
                      <p className="text-sm text-gray-600 -mt-2 mb-3">{HOUSEHOLD_CONTACT_LINE}</p>
                    </>
                  )}

                  <MarkRows
                    members={h.members}
                    channelPersonEventId={h.resolvedContactPersonEventId}
                    pace={pace}
                    onMark={(personEventId, nudgeMark) =>
                      patchCadence({ personEventId, nudgeMark })
                    }
                  />
                </AccordionShell>
              );
            })}
          </div>

          {unhoused.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Not in a household</h3>
              <p className="text-xs text-gray-400 mb-2">
                Added straight to the event. Gather talks to them directly.
              </p>
              <MarkRows
                members={unhoused}
                channelPersonEventId={null}
                pace={pace}
                onMark={(personEventId, nudgeMark) => patchCadence({ personEventId, nudgeMark })}
              />
            </div>
          )}
        </Step>

        {/* ── 4. The message, shown ───────────────────────────────────────── */}
        <Step
          n={4}
          title={PREFLIGHT_STEP_TITLES[3]}
          blurb="Exactly what each person will receive, how I nudge, and who I’ll leave to you."
          checked={!!checked[4]}
          onCheck={(v) => tick(4, v)}
          checkLabel="Settled"
          open={openSteps.includes(4)}
          onToggle={() => toggleStep(4)}
        >
          <MessageStep
            eventId={eventId}
            onPrint={onMessagePrint}
            viewerEmail={data?.viewerEmail ?? null}
          />
        </Step>

        {/* ── 5. The end ──────────────────────────────────────────────────── */}
        <Step
          n={5}
          title={PREFLIGHT_STEP_TITLES[4]}
          blurb="The last look is done."
          checked={!!checked[5]}
          onCheck={(v) => tick(5, v)}
        >
          {/*
            ── GTC-189 SLICE 5f — THE PRESS. ONE ACT, NO RECALL ────────────────────────

            ⚠ WHAT PRESSING THIS DOES IN THIS ENVIRONMENT, RECORDED HERE AND NOT ONLY IN THE TICKET,
            ON FOUNDER INSTRUCTION (2026-09-19): whoever meets this button next should meet the
            consequence in the same place.

            Measured on the one pressable board in `gather_dev` — Henderson Family Christmas 2025,
            43 memberships, 38 recipients:

              • The press writes 38 `OutboundMessage` rows, sets `Event.sentAt`, sets the invite
                anchors and writes `SEND_PRESSED`. IRREVERSIBLE AT THE MECHANISM LEVEL (Hinge §2,
                ruled gap #1): no undo, and a second press is refused `ALREADY_SENT`.
              • When the dispatcher runs, nothing reaches a provider: since [[GTC-274]] the live
                switch is off on every machine but production. All 37 email rows are REJECTED with
                no provider code — the sender stops before the key is tried (where the switch is on,
                a key that does not authenticate is refused `validation_error` / 401, terminal on the
                first attempt, [[GTC-247]]). The 1 text row is withheld `SMS_DISABLED`:
                `TNZ_AUTH_TOKEN` is absent, and the switch is off.
              • ⚠ THE BOARD THEN READS RED, "never got it", FOR ALL 38, WHOSE ADDRESSES AND NUMBER
                ARE FINE (GTC-189 slice 7a's `NOT_DELIVERED`; the text since [[GTC-340]]), and the
                summary says 38 need her.
              • ⚠ THE WAY BACK IS SLICE 7b's DOOR, AND HERE IT CANNOT WORK. "Send it again", "Send to
                a different address" and "Send to an email address" each queue a row the next drain
                stops the same way, so the red clears while the row waits and comes back after the
                drain ([[GTC-347]]). "Send it as a text" is not offered while texting is off
                (founder answer 1's fence). The remind is withdrawn on that red, and the press
                cannot be repeated.

            That is the press behaving exactly as designed against a broken key, which is the state
            founder answer Q7 chose over a fake provider. It is not a defect and it is not a surprise
            — it is written here so it is not discovered by pressing.

            ⚠ AND PRESSING SENDS NOTHING AT ALL LOCALLY. Vercel's cron does not run on a dev machine,
            so the rows sit unattempted until somebody calls `/api/cron/outbound-dispatch` with
            `CRON_SECRET`. Anyone testing this presses, sees nothing happen, and that is not a bug:
            the press and the sending are two acts here.
          */}
          <button
            type="button"
            disabled={!allChecked || pressing || pressed !== null}
            onClick={press}
            className={`w-full py-3 rounded-lg font-medium ${
              !allChecked || pressing || pressed !== null
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {pressed !== null
              ? 'Sent'
              : pressing
                ? 'Sending…'
                : `Send${allChecked ? '' : ' — finish the five checks first'}`}
          </button>

          {/* [[GTC-366]] (item 32) — W1, under the greyed Send. Send itself is unchanged (Q1, Q4). */}
          {nextStep !== null && !pressing && !pressed ? (
            <button
              type="button"
              data-go-to-step=""
              onClick={() => goToStep(nextStep)}
              className="mt-3 mx-auto block px-2 py-1 text-sm text-gray-700 underline underline-offset-2 hover:text-gray-900"
            >
              {goToStepLine(nextStep)}
            </button>
          ) : null}

          {/*
            THE TWO-SENTENCE THRESHOLD SCRIPT, at the moment of commitment (Hinge §2). Verbatim, from
            `press-words.ts`, and deliberately WITHOUT a roadmap door beside it — the spec refuses an
            options screen showing the machine's plan, and the compressed script is what carries the
            feeling instead of the inventory.
          */}
          {pressed !== null && (
            <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-4">
              <p className="text-sm text-gray-900">
                Sent to {pressed.recipients} {pressed.recipients === 1 ? 'person' : 'people'}.
              </p>
              {THRESHOLD_SCRIPT.map((line) => (
                <p key={line} className="text-sm text-gray-700 mt-2">
                  {line}
                </p>
              ))}
              {/* [[GTC-357]] Q2 — one link to the board, not a roadmap door: the board is where the
                  page goes by itself after BOARD_MOVE_AFTER_MS, and this lets her go sooner. */}
              <a
                href={boardHref(eventId)}
                className="mt-3 inline-block text-sm font-medium text-gray-900 underline underline-offset-2"
              >
                {SEE_THE_BOARD_LINK}
              </a>
            </div>
          )}

          {/*
            THE REFUSAL, IN THE PRESS'S OWN WORDS FOR THAT STATE. The route sends a `code` beside its
            prose precisely so this screen can pick the sentence a host should read rather than
            rendering an internal message — and `PRESS_REFUSAL_WORDS` is a `Record` over the union, so
            an eighth code cannot arrive here without one.
          */}
          {pressError && (
            <p className="text-sm text-red-700 mt-3" role="alert">
              {pressError}
            </p>
          )}
          {/* [[GTC-392]] part B — what Send would have done, under W2, on a sample only. */}
          {pretend && <PretendSend state={pretend} onOpenStep4={() => goToStep(4)} />}
        </Step>
      </div>
      {/* [[GTC-392]] — the sample event's banner; nothing on a real event. */}
      <DemoBanner eventId={eventId} />
    </div>
  );
}

// ─── The dietary re-verify (GTC-185, as rescoped) ────────────────────────────

/**
 * Event-level only. Per-person dietary capture was ruled out on 2026-08-23 and is not
 * deferred — there is no by-name dietary data anywhere in the schema to show.
 *
 * ⚠ Hinge §1 and Moment 4 §10.5 both still say "re-verified by name". Both are superseded
 * by that ruling and neither spec is edited; the by-name reading is not available here.
 */
function DietarySection({
  value,
  onSave,
}: {
  value: DietaryData;
  onSave: (next: DietaryData) => void;
}) {
  const [draft, setDraft] = useState<DietaryData>(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(value);
    setDirty(false);
  }, [value]);

  const set = (next: DietaryData) => {
    setDraft(next);
    setDirty(true);
  };

  const setStatus = (status: DietaryStatus) => {
    if (status === 'confirmed_needs') {
      set({ ...draft, status });
      return;
    }
    // The stored shape is coherence-checked server-side: a non-needs status may carry
    // neither requirements nor free text.
    set({ status, requirements: [], other: undefined });
  };

  const toggle = (opt: string) => {
    const has = draft.requirements.includes(opt);
    const requirements = has
      ? draft.requirements.filter((r) => r !== opt)
      : [...draft.requirements, opt];
    set({ ...draft, status: 'confirmed_needs', requirements });
  };

  const needs = draft.status === 'confirmed_needs';
  const coherent =
    draft.status !== 'confirmed_needs' ||
    draft.requirements.length > 0 ||
    (draft.other ?? '').trim() !== '';

  return (
    <div>
      <p className="text-sm text-gray-500 mb-3">
        {value.status === 'unanswered'
          ? 'Never answered. That is different from “nobody has any”.'
          : value.status === 'confirmed_none'
            ? 'You said there are none.'
            : 'You said there are these.'}
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <Pill
          active={draft.status === 'confirmed_none'}
          onClick={() => setStatus('confirmed_none')}
        >
          No dietary needs
        </Pill>
        <Pill active={needs} onClick={() => setStatus('confirmed_needs')}>
          There are some
        </Pill>
        <Pill active={draft.status === 'unanswered'} onClick={() => setStatus('unanswered')}>
          Still don&rsquo;t know
        </Pill>
      </div>

      {needs && (
        <div className="mb-4 space-y-2">
          {DIETARY_OPTIONS.map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.requirements.includes(opt)}
                onChange={() => toggle(opt)}
                className="rounded border-gray-300 text-accent focus:ring-accent/40"
              />
              <span className="text-sm text-gray-700">{opt}</span>
            </label>
          ))}
          <input
            type="text"
            placeholder="Other dietary needs"
            value={draft.other ?? ''}
            onChange={(e) =>
              set({ ...draft, status: 'confirmed_needs', other: e.target.value || undefined })
            }
            className="w-full mt-2 px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
      )}

      <button
        type="button"
        disabled={!dirty || !coherent}
        onClick={() => onSave(draft)}
        className="px-4 py-2 text-sm rounded-md bg-accent text-white disabled:opacity-40"
      >
        {dirty ? 'Save this' : 'Saved'}
      </button>
      {!coherent && (
        <span className="ml-3 text-xs text-amber-700">
          Tick at least one, or say there are none.
        </span>
      )}
    </div>
  );
}

// ─── 4. The message, shown ───────────────────────────────────────────────────

/** `readAskPreview`'s answer as it arrives over the wire — the date as a string. */
type MessageData = Omit<AskPreview, 'event'> & {
  event: Omit<AskPreview['event'], 'startDate'> & { startDate: string };
};

/** What one person, or one child, has been asked for — names exactly as stored ([[GTC-302]]). */
function rowsInBrief(x: { itemNames: readonly string[]; jobNames: readonly string[] }): string {
  const parts = [
    x.itemNames.length > 0 ? `bring ${x.itemNames.join(', ')}` : null,
    x.jobNames.length > 0 ? `do ${x.jobNames.join(', ')}` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : 'nothing';
}

/**
 * GTC-187 (H2) — step 4 made real. Hinge §1: "she reads exactly what each person will
 * receive before it goes... What Kate reads at the pre-flight IS what the guest receives —
 * one shape, two sides."
 *
 * EVERY MESSAGE ON THIS SCREEN COMES OUT OF `composeAsk`, the same function GTC-189's
 * dispatch will call, by way of `composePreview`. The route hands over ingredients and nothing
 * else; the composition happens here, in the client, through the shared module. That is the
 * arrangement GTC-188 made for the nudge clock and it exists so the screen and the send cannot
 * drift apart.
 *
 * GTC-189 SLICE 3 — WHO, AND HOW. The ingredients are the route slice 1's chooser picks for each
 * person: the channel, the children's asks their message carries, and the host's list — the
 * people Gather will not message, each with the reason. Names show exactly as stored
 * ([[GTC-302]], ordered after this slice), so capitals and bracketed qualifiers appear
 * mid-sentence here, on purpose.
 *
 * THE SEAM IS RENDERED, NOT HIDDEN. Each movement carries its voice as a label, because
 * Hinge §5's design is that "the guest can tell whose words are whose" — and the threshold's
 * check is "coverage and voice", so the voice has to be visible to be checked.
 */
function MessageStep({
  eventId,
  onPrint,
  viewerEmail,
}: {
  eventId: string;
  /** [[GTC-386]] (item 68) — the fingerprint of what this step shows, each time it arrives. */
  onPrint: (print: string) => void;
  /** [[GTC-388]] Q24 — the signed-in person's own address, the only place her test can go. */
  viewerEmail: string | null;
}) {
  const [data, setData] = useState<MessageData | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // The host's movement 1, edited here and STORED in Event.askAuthorLine (GTC-259/GTC-260).
  // Null means "no local edit", which falls through to the stored line and then to the draft.
  // ⚠ THE STORED VALUE HAS THREE STATES (founder ruling, 2026-08-29): null = never authored,
  // `''` = deliberately no line, a value = her words. Every `??` and `=== null` below is
  // written to keep `''` distinct from null; `||` anywhere here would collapse the two.
  const [edited, setEdited] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [chaseSaving, setChaseSaving] = useState(false);
  const [chaseError, setChaseError] = useState<string | null>(null);

  /*
   * [[GTC-387]] (item 67) — "People I’ll leave to you": a name opens a fold under its line with an
   * Email and a Mobile box, only where new details could fix it (`contactLineOffer`, ruling 2, Q6,
   * Q10). Its current values come from the existing people read when it opens (Q5); Save goes to
   * the pre-flight's own channel route, saves only, and the step is read again, so the person
   * moves into the messages above (W12). One fold at a time.
   */
  const [contactFor, setContactFor] = useState<string | null>(null);
  const contactForRef = useRef<string | null>(null);
  const [contactEmail, setContactEmail] = useState('');
  const [contactMobile, setContactMobile] = useState('');
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSaved, setContactSaved] = useState<string | null>(null);

  const openContact = async (personEventId: string) => {
    setContactError(null);
    setContactSaved(null);
    const next = contactFor === personEventId ? null : personEventId;
    contactForRef.current = next;
    setContactFor(next);
    setContactEmail('');
    setContactMobile('');
    if (!next) return;
    try {
      const res = await fetch(`/api/events/${eventId}/people`);
      if (!res.ok) return;
      const body = (await res.json()) as {
        people?: { id: string; email: string | null; phone: string | null }[];
      };
      const held = body.people?.find((p) => p.id === next);
      if (!held || contactForRef.current !== next) return;
      setContactEmail(held.email ?? '');
      setContactMobile(held.phone ? formatPhoneForDisplay(held.phone) : '');
    } catch {
      /* the boxes start empty */
    }
  };

  const saveContactFor = async (line: { personEventId: string; name: string }) => {
    setContactBusy(true);
    setContactError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/pre-flight/channel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personEventId: line.personEventId,
          email: contactEmail,
          mobile: contactMobile,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setContactError(boxRefusalLine(err.code, err.error ?? 'That did not save.'));
        return;
      }
      const fresh = await fetch(`/api/events/${eventId}/pre-flight/message`);
      if (fresh.ok) setData(await fresh.json());
      contactForRef.current = null;
      setContactFor(null);
      setContactSaved(savedPreflightLine(line.name));
    } catch {
      setContactError(boxRefusalLine(undefined, 'That did not save.'));
    } finally {
      setContactBusy(false);
    }
  };

  /**
   * [[GTC-311]] — the chase channel's two writes, the switch and one person's exception.
   *
   * The server's answer is authoritative, so this re-reads the whole preview rather than patching
   * local state: flipping the switch moves everyone who follows it, and the list below must show
   * exactly who moved. The selected recipient is kept.
   */
  const patchChase = async (body: Record<string, unknown>) => {
    setChaseSaving(true);
    setChaseError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/pre-flight/chase`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setChaseError(err.message ?? err.error ?? 'That did not save.');
        return;
      }
      const fresh = await fetch(`/api/events/${eventId}/pre-flight/message`);
      if (fresh.ok) setData(await fresh.json());
    } catch {
      setChaseError('That did not save.');
    } finally {
      setChaseSaving(false);
    }
  };

  useEffect(() => {
    let live = true;
    fetch(`/api/events/${eventId}/pre-flight/message`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`(${res.status})`);
        return res.json();
      })
      .then((d: MessageData) => {
        if (!live) return;
        setData(d);
        setSelected(d.recipients[0]?.personEventId ?? null);
      })
      .catch((e) => live && setFailed(`Could not load the message ${e.message ?? ''}`));
    return () => {
      live = false;
    };
  }, [eventId]);

  // [[GTC-386]] — step 4's tick is checked against what it shows: her line as stored, the switch and
  // its exceptions, who gets a message by which way and what it carries, and both lists.
  useEffect(() => {
    if (data) onPrint(printOf(data));
  }, [data, onPrint]);

  const facts = useMemo(
    () =>
      data
        ? {
            name: data.event.name,
            startDate: new Date(data.event.startDate),
            venueName: data.event.venueName,
            occasionDescription: data.event.occasionDescription,
          }
        : null,
    [data]
  );

  const draft = useMemo(() => (facts ? draftAuthorLine(facts) : ''), [facts]);
  const authorLine = edited ?? data?.storedAuthorLine ?? draft;
  // An unsaved change against whatever the box would show without it — the stored line if
  // there is one, the draft otherwise. Typing back to the shown text is not a change.
  const dirty = edited !== null && edited !== (data?.storedAuthorLine ?? draft);

  // Every recipient's message, composed. The whole list is composed rather than only the
  // selected one so the segment summary is a fact about the send and not about whoever
  // happens to be on screen.
  const composed = useMemo(
    () => (data ? composePreview(data, authorLine) : { rows: [], longestText: null }),
    [data, authorLine]
  );

  /*
   * [[GTC-388]] (item 64) — "Send me a test email". One email to her own address (Q1), holding the
   * message of whoever she is reading as (Q3), composed by the server from her STORED line (Q5), so
   * the button waits while the box holds an unsaved change. The answer is an outcome code and the
   * words are the module's. A test changes nothing on this step, so its tick stays (Q13). What the
   * last test came to is cleared once she reads as someone else or changes her line.
   */
  const [testing, setTesting] = useState(false);
  const [testOutcome, setTestOutcome] = useState<TestEmailOutcome | null>(null);
  useEffect(() => {
    setTestOutcome(null);
  }, [selected, authorLine]);
  const sendTest = async (personEventId: string) => {
    setTesting(true);
    setTestOutcome(null);
    try {
      const res = await fetch(`/api/events/${eventId}/pre-flight/message`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEmail: { personEventId } }),
      });
      const answer = (await res.json().catch(() => ({}))) as { outcome?: TestEmailOutcome };
      setTestOutcome(
        res.ok && answer.outcome && TEST_EMAIL_OUTCOMES.includes(answer.outcome)
          ? answer.outcome
          : 'NOT_SENT'
      );
    } catch {
      setTestOutcome('NOT_SENT');
    } finally {
      setTesting(false);
    }
  };

  /**
   * Stores movement 1. GTC-187 decision 2 makes the line reusable across sends — the point
   * is the late addition two weeks on getting the SAME words everyone else got.
   *
   * The server normalises empty to NULL, so this deliberately does NOT pre-empt it: what
   * comes back is authoritative, and a cleared box returns null and re-renders as the draft.
   * One rule, one site.
   */
  const saveAuthorLine = async (value: string | null) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/pre-flight/message`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ askAuthorLine: value }),
      });
      if (!res.ok) {
        setSaveError((await res.json().catch(() => ({}))).error ?? 'That did not save.');
        return;
      }
      const { storedAuthorLine } = (await res.json()) as { storedAuthorLine: string | null };
      setData((d) => (d ? { ...d, storedAuthorLine } : d));
      setEdited(null);
    } catch {
      setSaveError('That did not save.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * THE TWO CLEARING ACTIONS ARE DIFFERENT WRITES, and the founder ruling (2026-08-29) is
   * that Kate must be able to tell them apart. Both empty the box; they mean opposite things.
   *
   *   revertToDraft   → NULL → "put the draft back", Gather speaks for her
   *   sendWithoutLine → ''   → "send without a line from me", nobody speaks for her
   *
   * One button each, labelled as the sentence rather than as the state, because "clear" would
   * be ambiguous between them in exactly the way the ruling forbids.
   */
  const revertToDraft = async () => {
    // Nothing stored and only a local edit: drop the edit, no write needed. `== null` is
    // deliberate — it must catch null and undefined but NOT `''`, which IS a stored state.
    if (data?.storedAuthorLine == null) {
      setEdited(null);
      setSaveError(null);
      return;
    }
    await saveAuthorLine(null);
  };

  const sendWithoutLine = async () => {
    await saveAuthorLine('');
  };

  if (failed) return <p className="text-sm text-red-600">{failed}</p>;
  if (!data) return <p className="text-sm text-gray-400">Loading…</p>;
  if (data.recipients.length === 0 && data.hostList.length === 0) {
    return <p className="text-sm text-gray-600">Nobody to message on this event yet.</p>;
  }

  const rows = composed.rows;
  const current = rows.find((c) => c.recipient.personEventId === selected) ?? rows[0] ?? null;
  /*
   * ⚠ THE COUNTS ARE OVER THE MESSAGES, NOT OVER THE RECIPIENTS — GTC-189 slice 5b, decision 29.
   *
   * This read `rows.length`, and the founder named what was wrong with it at Q1: "the
   * pre-flight's own arithmetic says '8 messages' — two of those eight are not messages." Since
   * slice 5a it is a disagreement with the code, not only a wording problem: `pressSend` writes
   * a row per recipient it holds a link for, so the screen promised more messages than the press
   * sends, in the direction that reassures.
   *
   * The split comes from the module, through the one predicate the press gates on, so this
   * screen and the send cannot answer "who gets a message" differently.
   */
  const messages = messageRows(rows);
  const notMessaged = notMessagedRows(rows);
  const emailed = messages.filter((c) => c.recipient.channel === 'EMAIL').length;
  const texted = messages.length - emailed;
  const linksAtPress = messages.some((c) => c.recipient.linkState === 'AT_PRESS');

  /*
   * [[GTC-386]] (item 66, PLAN RULINGS 2026-10-15) — THREE LABELLED PARTS, in this order: what guests
   * will receive (Q4: her line, the notes, "Read it as" with each person's own nudge choice, and the
   * message, as they were), how I nudge (the question and its two choices, Q3), and the people I'll
   * leave to her (group A, then group B, each under its own heading, Q1 and Q2). The labels wear
   * Moment 2's quiet small-capitals divider (Q6); the first has no rule, the step's own line is above it.
   */
  return (
    <div>
      <section data-message-part="1">
        <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">
          {MESSAGE_STEP_PARTS[0]}
        </h3>
        {/* Movement 1 — hers. */}
        <label className="block text-sm font-medium text-gray-900 mb-1">Your line</label>
        <p className="text-xs text-gray-500 mb-2">
          A starting point built from the event — change it to whatever you would actually say. It
          goes first, in your words, to everyone.
        </p>
        <textarea
          value={authorLine}
          onChange={(e) => setEdited(e.target.value)}
          rows={3}
          className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-accent/40 focus:border-accent"
        />
        <div className="flex flex-wrap items-center gap-3 mt-2 mb-5">
          <button
            type="button"
            onClick={() => saveAuthorLine(authorLine)}
            disabled={!dirty || saving}
            className="text-xs px-3 py-1 rounded-md bg-accent text-white disabled:bg-gray-200 disabled:text-gray-400"
          >
            {saving ? 'Saving…' : 'Save my line'}
          </button>
          <button
            type="button"
            onClick={revertToDraft}
            disabled={saving || (edited === null && data.storedAuthorLine === null)}
            className="text-xs text-gray-500 underline disabled:no-underline disabled:text-gray-300"
          >
            Put the draft back
          </button>
          <button
            type="button"
            onClick={sendWithoutLine}
            disabled={saving || (edited === null && data.storedAuthorLine === '')}
            className="text-xs text-gray-500 underline disabled:no-underline disabled:text-gray-300"
          >
            Send without a line from me
          </button>
          {/*
          THE THREE STATES, SAID PLAINLY. Kate cannot see which one she is in from the box
          alone — an empty box is "no line from me" and a box full of the draft is "Gather
          speaks for me", and those look nothing alike but read the same if nothing says so.
        */}
          {saveError ? (
            <p className="text-xs text-red-600">{saveError}</p>
          ) : dirty ? (
            <p className="text-xs text-amber-700">Not saved yet.</p>
          ) : data.storedAuthorLine === '' ? (
            <p className="text-xs text-gray-500">
              No line from you. Guests get the greeting and then the handover — the preview below is
              exactly what they will read.
            </p>
          ) : data.storedAuthorLine !== null ? (
            <p className="text-xs text-gray-500">
              Saved. Everyone gets this line, including anyone you add later.
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              This is the draft, in your voice. Save it to make it yours, or send without a line
              from you.
            </p>
          )}
        </div>

        {/* GTC-256, CLOSED 2026-08-29. Stated, not hidden.
          Still correct, and now permanent for these events rather than pending: phase 2
          gives every NEW event a host membership row, and Ruling 12 rules no backfill for
          the ones that predate it. So this banner fires only on pre-phase-2 events, and
          what it describes is not going to be repaired — it is reseeded. */}
        {!data.hostIdentityResolved && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
            <strong>The name on this message is provisional.</strong> This event has no host
            membership row, so &ldquo;{data.hostName}&rdquo; is taken from the account that owns the
            event rather than from the person you captured as yourself. If you are in the guest list
            below, that is the same problem: you would be sent your own invitation. This event
            predates the fix (GTC-256); newer events capture you properly.
          </p>
        )}

        {linksAtPress && (
          <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-3 py-2 mb-4">
            Some guests have no link yet — links are issued at the press. Those messages show a
            stand-in where the link will go.
          </p>
        )}

        {/* GTC-294. What stood here said "Coordinators are not given a guest link, at the press or
          before it", which this ticket made false: a coordinator now gets the same link as any
          other adult.

          The notice is kept rather than deleted because the STATE it speaks to still exists —
          `NONE_NOT_ISSUED`, a recipient the press will issue no link to — it is simply no longer
          a coordinator, and is unreachable for every role `PersonRole` currently has. So the
          sentence has to say what it means WITHOUT naming a population, which is the same
          constraint GTC-262's directory copy was written under and the opposite of the Family
          Directory card's, where the reader is the host. Founder ruling, 2026-09-18: ships. */}
        {/* ⚠ GTC-189 slice 5b — THIS NAMES EVERY RECIPIENT THE PRESS WILL NOT MESSAGE, NOT JUST
          `NONE_NOT_ISSUED`. It filtered that one state alone, so the host as carrier was counted
          as a message AND went unnamed — the two halves of the same defect. The reason comes
          from `NOT_MESSAGED_WHY`, keyed so a state with no words is a compile error. Its two
          sentences are PROPOSED and carry an anchor; every other word here was ruled. */}
        {notMessaged.length > 0 && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
            <strong>
              {notMessaged.length === 1
                ? 'One person gets no message'
                : `${notMessaged.length} people get no message`}
              .
            </strong>{' '}
            They stay on this screen, and the count below does not include them.
            <ul className="mt-1.5 space-y-1">
              {notMessaged.map((c) => (
                <li key={c.recipient.personEventId}>
                  <span className="font-medium">{c.recipient.name}</span> —{' '}
                  {NOT_MESSAGED_WHY[c.recipient.linkState as NotMessagedLinkState]}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* The words are the view module's, ruled at slice 3 — Gather says "I". */}
        <p className="text-xs text-gray-500 mb-3">
          {data.replyTo ? (
            isCopyAddress(data.replyTo) ? (
              COPY_WORDS.REPLY_LINE
            ) : (
              replyToLine(data.replyTo)
            )
          ) : (
            <span className="text-amber-700">{NO_REPLY_TO_LINE}</span>
          )}
        </p>

        {/* Who is sent what. */}
        {current && (
          <>
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <label className="block text-sm font-medium text-gray-900">Read it as</label>
              <p className="text-xs text-gray-500">
                {messageCountLine(messages.length, emailed, texted)}
                {composed.longestText !== null &&
                  ` · the longest text runs to ${composed.longestText} ${
                    composed.longestText === 1 ? 'text' : 'texts'
                  }`}
              </p>
            </div>
            <select
              value={current.recipient.personEventId}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 mb-4"
            >
              {rows.map((c) => (
                <option key={c.recipient.personEventId} value={c.recipient.personEventId}>
                  {c.recipient.name} · by {c.recipient.channel === 'EMAIL' ? 'email' : 'text'}
                  {c.recipient.carried.length > 0 &&
                    ` · with ${c.recipient.carried.map((k) => k.firstName).join(', ')}`}
                </option>
              ))}
            </select>

            {/* What this person's message carries, before the words. */}
            <dl className="text-sm mb-3 space-y-1">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-gray-400">Sent by</dt>
                <dd className="text-gray-800">
                  {current.recipient.channel === 'EMAIL' ? 'Email' : 'Text'}
                  {/* GTC-189 slice 8a, W2 — why a person with an address is sent a text. */}
                  {current.recipient.emailNote ? (
                    <span data-email-note="" className="block text-xs text-gray-500">
                      {current.recipient.emailNote}
                    </span>
                  ) : null}
                </dd>
              </div>
              {/*
              [[GTC-311]] — HOW THEY ARE CHASED, AND THE ONE PLACE SHE MAY TAKE THEM OFF IT.

              The per-person control lives on the recipient she is reading, not on a list of every
              emailed guest: ruling AH rejected the forty-row screen, and the list she reads below is
              the short one — the people she has taken. The pills name BEHAVIOURS, never a tick; the
              control's polarity inverted on 2026-09-15 and a tick would read either way.

              An opted-out row is refused the control and says so IN ITS PLACE (ruling AI; ruling AM's
              words, from the module) rather than simply having no switch.
            */}
              {(() => {
                const rc = data.chase.byRecipient[current.recipient.personEventId];
                if (!rc) return null;
                return (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-gray-400">{CHASED_BY_LABEL}</dt>
                    <dd className="text-gray-800">
                      {CHASED_BY_VALUE[rc.chasedBy]}
                      {rc.control === 'REFUSED_OPTED_OUT' && (
                        <span className="block text-xs text-gray-500 mt-1">
                          {CHASE_OPTED_OUT_PLACEHOLDER}
                        </span>
                      )}
                      {rc.control === 'OFFERED' && (
                        <span className="flex flex-wrap gap-2 mt-1">
                          {chasePersonPills({
                            exception: rc.exception,
                            eventDefault: data.chase.stored,
                          }).map((p) => (
                            <Pill
                              key={p.value}
                              active={p.active}
                              onClick={() =>
                                !chaseSaving &&
                                !p.active &&
                                patchChase({
                                  personEventId: current.recipient.personEventId,
                                  chaseException: p.writes,
                                })
                              }
                            >
                              {p.label}
                            </Pill>
                          ))}
                        </span>
                      )}
                    </dd>
                  </div>
                );
              })()}
              {!current.recipient.hostAsCarrier && (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-gray-400">Theirs</dt>
                  <dd className="text-gray-800">{rowsInBrief(current.recipient)}</dd>
                </div>
              )}
              {current.recipient.carried.map((k) => (
                <div key={k.personEventId} className="flex gap-2">
                  <dt className="w-24 shrink-0 text-gray-400">For {k.firstName}</dt>
                  <dd className="text-gray-800">{rowsInBrief(k)}</dd>
                </div>
              ))}
              {/* [[GTC-356]] W5 — whose asks her message tells her about. The lines are in the message below. */}
              {current.recipient.household.length > 0 && (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-gray-400">{TOLD_ABOUT_LABEL}</dt>
                  <dd className="text-gray-800">{toldAboutValue(current.recipient.household)}</dd>
                </div>
              )}
              {current.replyTo !== null && (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-gray-400">Reply-to</dt>
                  <dd className="text-gray-800">
                    {isCopyAddress(current.replyTo) ? COPY_WORDS.REPLY_TO : current.replyTo}
                  </dd>
                </div>
              )}
            </dl>

            {current.ask === null ? (
              /* Ruling A2 — the host as carrier. Movements 1 and 2 are voiced as her, so which voice
               a message TO her is in is decision 20, unruled; her link is GTC-297. Not composed. */
              <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-4 py-3">
                This goes to you, because another household picked you as its contact. It carries
                only their child&rsquo;s ask &mdash; nothing of yours. Its wording is not settled
                yet (GTC-189 decision 20) and neither is the link you would answer it from
                (GTC-297), so it is not shown.
              </p>
            ) : (
              <>
                {/* The message itself, seam visible. */}
                <div className="border border-gray-200 rounded-md bg-white overflow-hidden">
                  {current.subject !== null && (
                    <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Subject</p>
                      <p className="text-sm text-gray-800">{current.subject}</p>
                    </div>
                  )}
                  {current.ask.movements.map((m) => (
                    <div key={m.slot} className="px-4 py-3 border-b border-gray-100 last:border-0">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
                        {m.voice === 'HOST' ? 'Your voice' : 'Gather'}
                      </p>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{m.text}</p>
                    </div>
                  ))}
                  {/* [[GTC-337]] ruling 2 — Gather ends every text with this line; the count below
                    includes it. An email carries none. */}
                  {current.textAsSent !== null && (
                    <div className="px-4 py-3 border-b border-gray-100 last:border-0">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
                        Gather
                      </p>
                      <p className="text-sm text-gray-900">{OPT_OUT_LINE}</p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {current.segments !== null && current.textAsSent !== null ? (
                    <>
                      {current.textAsSent.length} characters · {current.segments}{' '}
                      {current.segments === 1 ? 'text' : 'texts'}
                      {current.segments > 1 && ' — long is fine, it just costs more to send'}.
                      {current.narrowSegments &&
                        ' Counted at 70 characters a text rather than 160, because the wording uses punctuation plain SMS cannot carry.'}
                    </>
                  ) : (
                    'Sent by email, so there is no text count.'
                  )}
                </p>

                {/* [[GTC-388]] (item 64, Q14) — her test of this person's message, under it. Only
                  for someone the press will message (W14's case has no button). */}
                {messages.includes(current) && (
                  <div data-test-email="" className="mt-3">
                    <button
                      type="button"
                      data-test-email-button=""
                      onClick={() => sendTest(current.recipient.personEventId)}
                      disabled={dirty || testing || !viewerEmail || isCopyAddress(viewerEmail)}
                      className="text-xs px-3 py-1 rounded-md border border-gray-300 bg-white text-gray-700 disabled:border-gray-200 disabled:text-gray-300"
                    >
                      {testing ? TEST_EMAIL_WORDS.SENDING : TEST_EMAIL_WORDS.BUTTON}
                    </button>
                    <p data-test-email-lead="" className="text-xs text-gray-500 mt-1.5">
                      {dirty
                        ? TEST_EMAIL_WORDS.SAVE_FIRST
                        : !viewerEmail
                          ? TEST_EMAIL_WORDS.NO_ADDRESS
                          : isCopyAddress(viewerEmail)
                            ? testEmailOutcomeLine('DEMO', viewerEmail)
                            : current.recipient.channel === 'TEXT'
                              ? `${testEmailLead(firstNameOf(current.recipient.name), viewerEmail)} ${testEmailTextNote(firstNameOf(current.recipient.name))}`
                              : testEmailLead(firstNameOf(current.recipient.name), viewerEmail)}
                    </p>
                    {testOutcome && viewerEmail ? (
                      <p
                        data-test-email-outcome={testOutcome === 'SENT' ? 'sent' : 'not-sent'}
                        className={`text-xs mt-1 ${testOutcome === 'SENT' ? 'text-gray-700' : 'text-amber-700'}`}
                      >
                        {testEmailOutcomeLine(testOutcome, viewerEmail)}
                      </p>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>

      {/*
        [[GTC-311]] — THE DEFAULT, ASKED ONCE (acceptance: "in one sentence, rather than per row").
        It sits above the list because it decides who is on the second half of it. The switch is the
        event's; the per-person exception is on each recipient above. Words: W3, ruled 2026-09-27;
        [[GTC-386]] Q3 made W1 and W2's statement a question, and the pill that is on says the answer.
      */}
      <section data-message-part="2">
        <h3 className="text-xs uppercase tracking-wider text-gray-500 mt-6 mb-2 border-t border-gray-200 pt-4">
          {MESSAGE_STEP_PARTS[1]}
        </h3>
        <p className="text-sm text-gray-800 mb-2">{CHASE_DEFAULT_QUESTION}</p>
        <div className="flex flex-wrap gap-2">
          {(['BY_EMAIL', 'HAND_TO_HOST'] as const).map((v) => (
            <Pill
              key={v}
              active={data.chase.resolved === v}
              onClick={() =>
                !chaseSaving &&
                !(data.chase.stored === v) &&
                patchChase({ chaseWhenNoMobileDefault: v })
              }
            >
              {CHASE_DEFAULT_PILLS[v]}
              {data.chase.stored === null && data.chase.resolved === v && DEFAULT_SUFFIX}
            </Pill>
          ))}
        </div>
        {chaseSaving && <p className="text-xs text-gray-400 mt-2">Saving…</p>}
        {chaseError && <p className="text-xs text-red-600 mt-2">{chaseError}</p>}
      </section>

      {/* The host's list — ruling A as corrected: adults Gather cannot reach, and children whose
          route is closed. Each named with what they were asked for, and why it is hers.

          ⚠ [[GTC-311]] SCOPED ruling 6 — TWO KINDS OF PERSON NOW, AND EVERY HEADING IS TRUE OF
          EVERYONE UNDER IT. Group A is who Gather does not ask; slice 3's blurb is exactly true of
          them and stays with them. Group B is who Gather asks and will not chase, which the blurb
          would be false of. Each half comes from its own field and its own words map — group B's
          reasons are ruling AN's `CHASE_NONE_WHY`, never `ADULT_WHY`. */}
      <section data-message-part="3">
        <h3 className="text-xs uppercase tracking-wider text-gray-500 mt-6 mb-2 border-t border-gray-200 pt-4">
          {HOST_LIST_HEADING}
        </h3>
        {/* [[GTC-387]] W12 — after a save, the person has moved into the messages above. */}
        {contactSaved ? (
          <p data-contact-saved="" className="text-sm text-green-700 mb-2">
            {contactSaved}
          </p>
        ) : null}
        {data.hostList.length === 0 && data.chase.notChased.length === 0 ? (
          <p className="text-sm text-gray-600">{HOST_LIST_EMPTY}</p>
        ) : (
          <>
            {data.hostList.length > 0 && (
              <div data-host-list-a="" className="mt-3">
                <h4 className="text-sm text-gray-800 mb-1">{HOST_LIST_NOT_ASKED_HEADING}</h4>
                <p className="text-xs text-gray-500 mb-3">{HOST_LIST_BLURB}</p>
                <ul className="space-y-2">
                  {data.hostList.map((l) => {
                    const offer = contactLineOffer(l);
                    const open = offer !== null && contactFor === l.personEventId;
                    return (
                      <li key={l.personEventId} className="text-sm">
                        {offer ? (
                          <button
                            type="button"
                            data-contact-name={l.personEventId}
                            aria-label={nameLabel(l.name)}
                            aria-expanded={open}
                            onClick={() => openContact(l.personEventId)}
                            className="text-gray-900 underline decoration-dotted underline-offset-2 hover:decoration-solid"
                          >
                            {l.name}
                          </button>
                        ) : (
                          <span className="text-gray-900">{l.name}</span>
                        )}
                        <span className="text-gray-500"> — {rowsInBrief(l)}</span>
                        <p className="text-xs text-gray-500">{hostListReason(l)}</p>
                        {open ? (
                          <div
                            data-contact-fold=""
                            className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3"
                          >
                            <p data-contact-lead="" className="text-xs text-gray-600">
                              {offer.mobile
                                ? CONTACT_BOX_WORDS.leadBoth
                                : CONTACT_BOX_WORDS.leadEmail}
                            </p>
                            <label
                              htmlFor={`contact-email-${l.personEventId}`}
                              data-contact-email-label=""
                              className="mt-2 block text-xs text-gray-700"
                            >
                              {CONTACT_BOX_WORDS.email}
                            </label>
                            <input
                              id={`contact-email-${l.personEventId}`}
                              type="email"
                              data-contact-email=""
                              value={contactEmail}
                              onChange={(e) => setContactEmail(e.target.value)}
                              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                            />
                            {offer.mobile ? (
                              <>
                                <label
                                  htmlFor={`contact-mobile-${l.personEventId}`}
                                  data-contact-mobile-label=""
                                  className="mt-2 block text-xs text-gray-700"
                                >
                                  {CONTACT_BOX_WORDS.mobile}
                                </label>
                                <input
                                  id={`contact-mobile-${l.personEventId}`}
                                  type="tel"
                                  data-contact-mobile=""
                                  value={contactMobile}
                                  placeholder={CONTACT_BOX_WORDS.mobileHint}
                                  onChange={(e) => setContactMobile(e.target.value)}
                                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                                />
                              </>
                            ) : null}
                            {contactError ? (
                              <p data-contact-error="" className="mt-2 text-xs text-red-700">
                                {contactError}
                              </p>
                            ) : null}
                            <button
                              type="button"
                              data-contact-save=""
                              disabled={contactBusy}
                              onClick={() => saveContactFor(l)}
                              className="mt-2 rounded bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                            >
                              {contactBusy ? CONTACT_BOX_WORDS.saving : CONTACT_BOX_WORDS.save}
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {data.chase.notChased.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm text-gray-800 mb-1">{HOST_LIST_NOT_CHASED_HEADING}</h4>
                <p className="text-xs text-gray-500 mb-3">{HOST_LIST_NOT_CHASED_BLURB}</p>
                <ul className="space-y-2">
                  {data.chase.notChased.map((l) => (
                    <li key={l.personEventId} className="text-sm">
                      <span className="text-gray-900">{l.name}</span>
                      <span className="text-gray-500"> — {rowsInBrief(l)}</span>
                      <p className="text-xs text-gray-500">{notChasedReason(l)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
