/**
 * [[GTC-415]] tweak 18 — the page shown for an address Gather does not have. The founder's words
 * (28 Oct 2026): "We can't find that page.", a link "Go to the home page" and the one help line.
 */
import Link from 'next/link';
import NeedHelp from '@/components/shared/NeedHelp';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900">{"We can't find that page."}</h1>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-accent hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
          >
            Go to the home page
          </Link>
        </div>
        <NeedHelp className="mt-6" />
      </div>
    </div>
  );
}
