/**
 * [[GTC-447]] — draw a Next server component in this process the way a running Next server does.
 *
 * Since GTC-447 the /demo page and the /demo/new layout are async and call `await connection()`
 * from next/server first. React's static render cannot draw an async component, and
 * `connection()` throws outside a request. So the suites call the component INSIDE Next's own
 * request scope (the AsyncLocalStorage stores `next start` and `next dev` fill for each request),
 * then draw what it returns. With `scope: 'build'` the call runs inside Next's build-time scope
 * instead ("prerender-legacy", what `next build` uses with this app's config), where
 * `connection()` throws Next's DynamicServerError: that throw is how a build marks a route
 * dynamic.
 *
 * Shared by tests/demo-public-test.ts, demo-note, demo-tweaks, demo-tweaks-2 (founder ruling C, 3
 * Nov 2026), so a Next upgrade that moves these internals is fixed here, once. If the stores
 * cannot be loaded or used, every draw comes back empty with the reason in `threw`, and the
 * suites' controls go red with it.
 *
 * IMPORT THIS BEFORE any page, layout or component file. Next makes its stores when its modules
 * are first loaded, and makes working ones only if `globalThis.AsyncLocalStorage` is set by then.
 */
import { AsyncLocalStorage } from 'async_hooks';
import { renderToStaticMarkup } from 'react-dom/server';

const g = globalThis as { AsyncLocalStorage?: unknown };
if (!g.AsyncLocalStorage) g.AsyncLocalStorage = AsyncLocalStorage;

type Store = { run<T>(store: unknown, fn: () => T): T };
let stores: { work: Store; workUnit: Store } | null = null;
let storesError = '';

/** Next's two request stores, loaded on first use (after the global above is set). */
function nextStores(): { work: Store; workUnit: Store } | null {
  if (stores || storesError) return stores;
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const work = require('next/dist/server/app-render/work-async-storage.external')
      .workAsyncStorage as Store;
    const workUnit = require('next/dist/server/app-render/work-unit-async-storage.external')
      .workUnitAsyncStorage as Store;
    /* eslint-enable @typescript-eslint/no-require-imports */
    if (typeof work?.run !== 'function' || typeof workUnit?.run !== 'function') {
      throw new Error('a store has no run()');
    }
    stores = { work, workUnit };
  } catch (err) {
    storesError = `Next's request stores could not be loaded: ${(err as Error).message}`;
    console.log(`    (next-request-scope: ${storesError})`);
  }
  return stores;
}

export type Drawn = {
  /** What the component drew; '' when it threw. */
  html: string;
  /** '' when it drew; else the thrown error's digest, name and message. */
  threw: string;
  /** The thrown error's digest ('' if none): Next's 404 is `NEXT_HTTP_ERROR_FALLBACK;404`. */
  digest: string;
};

const SWITCH = 'GATHER_DEMO_START';

/**
 * Call `make` (it calls the server component and returns what it drew, an element) inside Next's
 * request scope (`scope: 'request'`) or build-time scope (`scope: 'build'`), with NODE_ENV and the
 * demo start switch set for the call (undefined = unset), then draw the element with
 * renderToStaticMarkup. Both settings are put back afterwards.
 */
export async function drawInNext(opts: {
  route: string;
  scope: 'request' | 'build';
  nodeEnv: string;
  demoStart: string | undefined;
  make: () => unknown;
}): Promise<Drawn> {
  const env = process.env as Record<string, string | undefined>;
  const wasEnv = env.NODE_ENV;
  const wasSwitch = env[SWITCH];
  env.NODE_ENV = opts.nodeEnv;
  if (opts.demoStart === undefined) delete env[SWITCH];
  else env[SWITCH] = opts.demoStart;
  try {
    const s = nextStores();
    if (!s) return { html: '', threw: `next-request-scope: ${storesError}`, digest: '' };
    const type = opts.scope === 'request' ? 'request' : 'prerender-legacy';
    const html = await s.work.run({ route: opts.route }, () =>
      s.workUnit.run({ type, phase: 'render' }, async () =>
        renderToStaticMarkup((await opts.make()) as Parameters<typeof renderToStaticMarkup>[0])
      )
    );
    return { html, threw: '', digest: '' };
  } catch (err) {
    const e = err as { digest?: unknown; name?: string; message?: string };
    const digest = typeof e?.digest === 'string' ? e.digest : '';
    const message = String(e?.message ?? err).split('\n')[0];
    return { html: '', threw: `${digest} ${e?.name ?? 'Error'} ${message}`.trim(), digest };
  } finally {
    if (wasEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = wasEnv;
    if (wasSwitch === undefined) delete env[SWITCH];
    else env[SWITCH] = wasSwitch;
  }
}
