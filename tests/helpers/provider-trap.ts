/**
 * [[GTC-274]] — THE PROVIDER TRAP, AND THE ONLY PLACE A TEST MAY TURN LIVE SENDING ON.
 *
 * Founder ruling, 2026-09-29: *"Gather only sends for real where a setting says it's live:
 * production."* The setting is `GATHER_LIVE_SENDS=on` (`src/lib/live-sends.ts`). Without it every
 * text and email stops at the last step before the provider, so a test that forgets this file
 * cannot send. That is why the ruling chose this shape.
 *
 * Some suites need the step AFTER the gate: they stub `globalThis.fetch` and assert what the
 * senders make of Resend's replies. For them the gate has to be open, and it may only be opened
 * here, behind walls that stop every outbound request from leaving the process:
 *
 *   - `globalThis.fetch` (Resend and TNZ) — replaced by `installProviderTrap`, answered with a fake
 *     200 and counted. `liveBehindTrap` leaves a suite's own fetch stub in charge instead.
 *   - `http.request` / `https.request` / `.get` (the Twilio SDK's axios) — every call is counted
 *     and refused before a socket exists.
 *   - `dns.lookup` / `dns.promises.lookup` — refused for every host that is not loopback.
 *   - `net.connect` / `net.createConnection` / `tls.connect` — refused for every host that is not
 *     loopback. Node's own fetch connects through these, so a suite that restores the REAL fetch
 *     is still walled in.
 *   - `HTTPS_PROXY` / `HTTP_PROXY` point at a closed loopback port, a second wall for any client
 *     that honours them.
 *
 * Loopback stays open: the suites that drive the dev server on :3000 go on working, and Prisma
 * talks to Postgres through its native engine, not through these modules.
 *
 * COPIED IN FULL FROM GTC-274's PHASE 0 REPRODUCTION, which proved it at HEAD: all eight doors
 * reached the trap, including Twilio at `https.request`, and nothing left the process.
 *
 * ⚠ `tests/live-switch-test.ts` FAILS if any other file in tests/ or scripts/, or package.json,
 * .env or .env.local, sets GATHER_LIVE_SENDS. Do not open the gate anywhere else.
 */
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';

export interface TrapHit {
  via: string;
  target: string;
}

const LOOPBACK = /^(localhost|127\.|::1$|\[::1\])/;
const FAKE_BODY = JSON.stringify({ id: 'gtc274-fake-id', MessageID: 'gtc274-fake-id' });

const hits: TrapHit[] = [];
let wallsUp = false;
let trapFetchInstalled = false;

/** Every outbound request the trap has intercepted in this process, oldest first. */
export function trapHits(): readonly TrapHit[] {
  return hits;
}

/** How many requests the trap has intercepted so far. Take one before, one after. */
export function trapCount(): number {
  return hits.length;
}

function raiseWalls(): void {
  if (wallsUp) return;
  wallsUp = true;

  process.env.HTTPS_PROXY = process.env.HTTP_PROXY = 'http://127.0.0.1:9';
  process.env.https_proxy = process.env.http_proxy = 'http://127.0.0.1:9';

  for (const [name, mod] of [
    ['http', http],
    ['https', https],
  ] as const) {
    for (const fn of ['request', 'get'] as const) {
      const orig = (mod as any)[fn];
      (mod as any)[fn] = (...args: any[]) => {
        const o = args.find((a) => a && typeof a === 'object' && !(a instanceof URL)) ?? {};
        const u = args.find((a) => typeof a === 'string' || a instanceof URL);
        const host = u ? new URL(String(u)).hostname : String(o.hostname ?? o.host ?? '');
        // A request through the loopback proxy wall carries its real destination in `path`.
        const proxied = typeof o.path === 'string' && /^https?:\/\//.test(o.path);
        const bound = proxied ? new URL(o.path).hostname : host;
        if (LOOPBACK.test(bound)) return orig.apply(mod, args);
        const target = u ? String(u) : `${o.hostname ?? o.host}${o.path ?? ''}`;
        hits.push({ via: `${name}.${fn}`, target: target.slice(0, 80) });
        throw new Error('GTC-274 trap: outbound request blocked');
      };
    }
  }

  const origLookup = dns.lookup;
  (dns as any).lookup = (host: string, ...rest: any[]) => {
    if (LOOPBACK.test(host)) return (origLookup as any)(host, ...rest);
    hits.push({ via: 'dns.lookup', target: host });
    const cb = rest[rest.length - 1];
    if (typeof cb === 'function') {
      process.nextTick(cb, Object.assign(new Error('GTC-274 trap'), { code: 'ENOTFOUND' }));
    }
  };
  const origPromisesLookup = dns.promises.lookup;
  (dns.promises as any).lookup = async (host: string, ...rest: any[]) => {
    if (LOOPBACK.test(host)) return (origPromisesLookup as any)(host, ...rest);
    hits.push({ via: 'dns.promises.lookup', target: host });
    throw Object.assign(new Error('GTC-274 trap'), { code: 'ENOTFOUND' });
  };

  for (const [name, mod, fn] of [
    ['net', net, 'connect'],
    ['net', net, 'createConnection'],
    ['tls', tls, 'connect'],
  ] as const) {
    const orig = (mod as any)[fn];
    (mod as any)[fn] = (...args: any[]) => {
      const o = args[0];
      if (o && typeof o === 'object' && o.path) return orig.apply(mod, args); // unix socket
      const host =
        o && typeof o === 'object'
          ? (o.host ?? o.servername ?? 'localhost')
          : (args[1] ?? 'localhost');
      if (!LOOPBACK.test(String(host))) {
        hits.push({ via: `${name}.${fn}`, target: String(host) });
        throw new Error('GTC-274 trap: socket blocked');
      }
      return orig.apply(mod, args);
    };
  }
}

/**
 * Raise every wall AND replace `globalThis.fetch` with a counting fake that answers 200. The
 * gate is NOT opened: this is the state every GTC-274 assertion that "nothing reached a provider"
 * is made in.
 */
export function installProviderTrap(): void {
  raiseWalls();
  if (trapFetchInstalled) return;
  trapFetchInstalled = true;
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input));
    const u = new URL(url);
    if (LOOPBACK.test(u.hostname)) {
      throw new Error('GTC-274 trap fetch: loopback is not faked; use the real fetch for :3000');
    }
    hits.push({ via: 'fetch', target: u.host + u.pathname });
    return new Response(FAKE_BODY, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

/**
 * Open the live gate for THIS process, behind the walls. For suites that stub `globalThis.fetch`
 * themselves and assert what the senders do with the reply: their stub stays in charge of fetch,
 * and every other door out of the process is walled. Returns a function that closes the gate.
 */
export function liveBehindTrap(): () => void {
  raiseWalls();
  process.env.GATHER_LIVE_SENDS = 'on';
  return () => {
    delete process.env.GATHER_LIVE_SENDS;
  };
}
