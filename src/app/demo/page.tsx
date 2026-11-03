import { connection } from 'next/server';
import TryItYourselfButton from '@/components/demo/TryItYourselfButton';
import { isDemoStartOn } from '@/lib/demo/start-switch';

/**
 * [[GTC-394]] tweak 3 — the copy button's own label on this page (founder's words). GTC-392's
 * `DEMO_START_WORDS.BUTTON` stays as it is in `start-limit.ts`, unused here; since [[GTC-395]] item 3
 * the other start words (the notes, the limits, the failure) are the sample page's, `/demo/new`.
 */
const TRY_IT_YOURSELF = 'Try it yourself';
/** [[GTC-395]] item 3 — the sample's own "Create Your Event" page. */
const SAMPLE_PAGE = '/demo/new';
/** [[GTC-430]] — the founder's words (30 Oct 2026), shown wherever the button is not. */
const UNDER_CONSTRUCTION = 'Under construction';

/**
 * /demo — [[GTC-394]] tweak 3, and [[GTC-395]] items 1 and 2 (founder, 20 Oct 2026: "Don't have the
 * Henderson Christmas button." "The front page only has the Try it yourself button"). The heading
 * and one button, or the note in its place ([[GTC-430]]), nothing else.
 *
 * "Try it yourself" opens the sample's own "Create Your Event" page, pre-filled ([[GTC-395]] item 3,
 * `/demo/new`), where the private sample copy is started as GTC-392 part A built it.
 *
 * [[GTC-430]] (founder, 30 Oct 2026): wherever the button is not, the page says "Under
 * construction" where the button goes, so a visitor never sees an empty page.
 *
 * [[GTC-447]] (GTC-392 part D, founder rulings of 1 Nov 2026): the button follows the demo start
 * switch and nothing else (`isDemoStartOn()`, read here on the server), in production and in
 * development alike; the switch off is the note. `connection()` first: the page is dynamic by its
 * own word, so the switch is read at each request, never once when the site is built. Setting
 * GATHER_DEMO_START to exactly `on` opens the demo; deleting it closes it again.
 *
 * The "Sarah demo" button and its handler went with GTC-395; the route's no-body path and the
 * tokens route went with [[GTC-442]]. The reset route still exists, answers 404 in production, and
 * elsewhere force-resets whichever database the server points at; this page never calls it.
 */
export default async function DemoLandingPage() {
  await connection();
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-sm mx-auto px-5 py-20 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-10">Gather</h1>
        <div className="flex flex-col gap-3">
          {isDemoStartOn() ? (
            <TryItYourselfButton href={SAMPLE_PAGE} label={TRY_IT_YOURSELF} />
          ) : (
            <p className="text-gray-600">{UNDER_CONSTRUCTION}</p>
          )}
        </div>
      </div>
    </div>
  );
}
