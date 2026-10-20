'use client';

/**
 * [[GTC-394]] tweak 3 — the copy button's own label on this page (founder's words). GTC-392's
 * `DEMO_START_WORDS.BUTTON` stays as it is in `start-limit.ts`, unused here; since [[GTC-395]] item 3
 * the other start words (the notes, the limits, the failure) are the sample page's, `/demo/new`.
 */
const TRY_IT_YOURSELF = 'Try it yourself';
/** [[GTC-395]] item 3 — the sample's own "Create Your Event" page. */
const SAMPLE_PAGE = '/demo/new';

/**
 * /demo — [[GTC-394]] tweak 3, and [[GTC-395]] items 1 and 2 (founder, 20 Oct 2026: "Don't have the
 * Henderson Christmas button." "The front page only has the Try it yourself button"). The heading
 * and one button, nothing else.
 *
 * "Try it yourself" opens the sample's own "Create Your Event" page, pre-filled ([[GTC-395]] item 3,
 * `/demo/new`), where the private sample copy is started as GTC-392 part A built it. Both are still
 * development-only until part D (GTC-392 Q5). In a production build the page is the heading and no
 * button (a flag on GTC-395).
 *
 * The "Sarah demo" button and its handler went with GTC-395. The route behind it (the demo session
 * route's no-body path) is not touched: the old shared Sarah event stays in the database until part
 * D retires it. The tokens and reset routes are not touched either; the reset route still exists,
 * is development-only, and force-resets whichever database the server points at.
 */
export default function DemoLandingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-sm mx-auto px-5 py-20 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-10">Gather</h1>
        <div className="flex flex-col gap-3">
          {process.env.NODE_ENV === 'development' && (
            <button
              onClick={() => window.location.assign(SAMPLE_PAGE)}
              className="w-full px-5 py-3 bg-sage-600 text-white font-semibold rounded-lg hover:bg-sage-700 transition-colors"
            >
              {TRY_IT_YOURSELF}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
