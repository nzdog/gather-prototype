import { MOMENT_HEADINGS, MOMENT_WORDS } from '@/lib/moments/moment-words';

/**
 * [[GTC-368]] (item 5) — one Moment's words on the Moment screens: the founder's label (W15) as a
 * small heading, then his line (Q10's A, Q13 at GTC-368's plan). The board writes its own closed
 * disclosure, so this sits on the Moment screens only (Q14). No hooks: it renders anywhere.
 */
export default function MomentWords({
  moment,
  part,
  className = '',
}: {
  moment: 1 | 2 | 3 | 4;
  part: 'does' | 'done';
  className?: string;
}) {
  return (
    <div data-moment-words={`${moment}-${part}`} className={className}>
      <p className="m-0 mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        {part === 'does' ? MOMENT_HEADINGS.DOES : MOMENT_HEADINGS.DONE}
      </p>
      <p className="m-0 leading-relaxed text-gray-600 text-base">{MOMENT_WORDS[moment][part]}</p>
    </div>
  );
}
