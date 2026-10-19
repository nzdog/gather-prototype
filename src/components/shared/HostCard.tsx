/**
 * [[GTC-394]] tweak 1 — THE HOST'S OWN CARD STANDS OUT, one definition for every screen that draws
 * it (founder, 19 Oct 2026: "make the host's card stand out. Actually, do that throughout the
 * system"). A soft tint of the accent and a solid accent border on the card, and GTC-256's "You"
 * pill (Ruling 1) made stronger: filled accent, white text. The word stays "You".
 *
 * Layout only: nothing is stored, sent or read differently. Each screen uses these behind the host
 * flag it already holds. It lives under `src/components` because Tailwind builds only the classes
 * it finds there (and in `src/app`), and the tint uses the sage scale because an opacity on the
 * accent's CSS variable (`bg-accent/10`) builds nothing. No hooks: the board renders it on the
 * server.
 */

/** The card: a soft tint of the accent and a solid accent border. Pair it with `border`. */
export const HOST_CARD = 'border-accent bg-sage-100';

/** GTC-256's "You" pill, made stronger. */
export function HostPill() {
  return (
    <span
      data-host-pill=""
      className="text-xs font-medium text-white bg-accent rounded-full px-2 py-0.5"
    >
      You
    </span>
  );
}
