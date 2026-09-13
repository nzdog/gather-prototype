'use client';

/**
 * GTC-192 (J1) — DEV CHROME. Not part of the replay, and not part of the product.
 *
 * The arrival replay is ~1.8s on a five-step board: correct, ruled, and over before someone
 * looking at it for the first time has focused. This is the control that lets it be WATCHED —
 * `?replay=manual` on the glance URL, a Play button, a second between steps.
 *
 * ── WHY IT IS ITS OWN FILE, SAID PLAINLY RATHER THAN ARRANGED QUIETLY ────────────────────
 *
 * `test:glance-replay` asserts, against the ISLAND'S SOURCE, that there is no button, no
 * link, no role="button" and no click handler anywhere in it (Ruling 6 — "'seen' means the
 * replay played"). That guard is about the replay a host receives, and it is left exactly as
 * it is: the island still has no control in it, and this file is not the island.
 *
 * ⚠ THAT IS THE LETTER OF THE GUARD AND IT IS RECORDED HERE RATHER THAN RELIED ON QUIETLY.
 * A dev control one file to the left of a fence is still a control in the tree. What makes it
 * honest rather than an evasion is what it CANNOT do, and both are structural:
 *
 *   - IT NEVER STAMPS. The stamp has one caller and it is the island's automatic path. A
 *     rehearsal is not an arrival; news consumed by a rehearsal is news the host never saw.
 *   - IT IS UNREACHABLE WITHOUT THE QUERY PARAM. The island renders this only after a client
 *     effect has read `?replay=manual`, so it is absent from every server-rendered board and
 *     from the markup Ruling 6 is asserted on.
 *
 * If it should be fenced rather than merely narrow, that is a ruling and belongs on the
 * ticket — see the note handed over with this change.
 *
 * It owns no mechanics. The walk lives in the island, once, and this presses it.
 */
export default function GlanceReplayPreview({
  stepCount,
  intervalSeconds,
  play,
}: {
  stepCount: number;
  intervalSeconds: number;
  play: () => void;
}) {
  return (
    <div
      data-glance-replay-preview={stepCount}
      className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-full bg-neutral-900 py-2 pl-3 pr-4 text-white shadow-lg"
    >
      <button
        type="button"
        onClick={play}
        className="rounded-full bg-white/15 px-3 py-1 text-sm font-medium hover:bg-white/25"
      >
        ▶ Play
      </button>
      <span className="text-xs leading-tight opacity-70">
        preview · {stepCount} steps, {intervalSeconds}s apart
        <br />
        not stamped — replays on every press
      </span>
    </div>
  );
}
