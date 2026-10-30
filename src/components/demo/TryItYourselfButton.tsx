'use client';

/**
 * [[GTC-430]] — /demo's "Try it yourself" button, moved here unchanged from the page so the page
 * can be a server component and read the demo start switch on the server, never in the browser.
 * The page decides whether to draw it (development AND the switch on) and hands it its label and
 * the sample's page to open.
 */
export default function TryItYourselfButton({ href, label }: { href: string; label: string }) {
  return (
    <button
      onClick={() => window.location.assign(href)}
      className="w-full px-5 py-3 bg-sage-600 text-white font-semibold rounded-lg hover:bg-sage-700 transition-colors"
    >
      {label}
    </button>
  );
}
