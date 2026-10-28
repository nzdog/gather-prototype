'use client';

/**
 * [[GTC-415]] tweak 18 — the page shown when something breaks on Gather's side. The founder's
 * words (28 Oct 2026): "Something went wrong on our side.", a "Try again" button (Next's usual
 * reset) and the one help line.
 */
import NeedHelp from '@/components/shared/NeedHelp';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900">Something went wrong on our side.</h1>
        <div className="mt-6">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-accent hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
          >
            Try again
          </button>
        </div>
        <NeedHelp className="mt-6" />
      </div>
    </div>
  );
}
