/**
 * [[GTC-357]] / [[GTC-358]] — a headless Chrome a suite can drive over the DevTools protocol, to read
 * pages as a browser renders them (widths, a client-rendered banner, a menu that opens).
 *
 * WALLED: a throwaway profile, and `--host-resolver-rules` that resolve nothing but localhost, so the
 * browser cannot reach any provider whatever a page asks for. `hostsRequested()` lets a suite assert
 * it. The suite's own process keeps `installProviderTrap`; Chrome is a separate process, which is why
 * it carries its own wall.
 *
 * Needs a global `WebSocket`: run the suite under `NODE_OPTIONS=--experimental-websocket` on Node 20.
 * `fetchImpl` is the real `fetch`, taken before the provider trap replaced it, because the trap
 * refuses loopback and the DevTools endpoint is loopback.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export interface Headless {
  setViewport(width: number, height: number, mobile: boolean): Promise<void>;
  setSessionCookie(token: string): Promise<void>;
  clearCookies(): Promise<void>;
  navigate(path: string, settleMs?: number): Promise<void>;
  evaluate<T = unknown>(expression: string): Promise<T>;
  /** A real mouse click at the centre of the first element matching `selector`. */
  click(selector: string): Promise<boolean>;
  /**
   * [[GTC-364]] — the click a look on screen uses (GATHER-BUILD-CONSTANTS.md, "Looking on screen —
   * three safeguards"). Scrolls the target to mid-screen and clicks only if the element at that point
   * is inside the target; refuses a control whose words are a press, a send, a hold or a generate.
   * Every refusal is logged. Resolves to null when it clicked, or the reason it refused.
   * [[GTC-365]] Q13: `settleMs` is the wait after the click (400 unless given), so a suite can make
   * two taps closer together than a save takes.
   */
  clickGuarded(selector: string, settleMs?: number): Promise<string | null>;
  /**
   * [[GTC-364]] — fails every request to a route that calls the AI (`finalize-plan`,
   * `regenerate-plan`, `/generate`, `/regenerate`, `suggest-resolution`) before it leaves the page.
   * Call before the first navigation.
   */
  blockPlanMaking(): Promise<void>;
  /**
   * [[GTC-366]] Q17 — a fourth wall: fails every request to a door that sends (the press, the
   * host-token send, a nudge, "Send it again", trigger-nudges, the wrap-up, any cron) before it
   * leaves the page. Additive: the plan-making block stays as it is, and both can be on at once.
   */
  blockSends(): Promise<void>;
  /** Every request `blockPlanMaking` or `blockSends` failed, as "METHOD url". */
  planMakingBlocked(): string[];
  /** Types `text` into whatever has focus, as a keyboard would. */
  insertText(text: string): Promise<void>;
  pressKey(key: 'Escape'): Promise<void>;
  screenshot(
    file: string,
    clip?: { x: number; y: number; width: number; height: number }
  ): Promise<void>;
  hostsRequested(): string[];
  close(): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function openHeadless(opts: {
  fetchImpl: typeof fetch;
  port: number;
  base?: string;
}): Promise<Headless> {
  const base = opts.base ?? 'http://localhost:3000';
  const profile = mkdtempSync(join(tmpdir(), 'gather-headless-'));
  const chrome: ChildProcess = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${opts.port}`,
      `--user-data-dir=${profile}`,
      '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost',
      '--no-first-run',
      '--disable-extensions',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  let targets: { type: string; webSocketDebuggerUrl: string }[] = [];
  for (let i = 0; i < 75 && targets.length === 0; i++) {
    try {
      targets = (await (
        await opts.fetchImpl(`http://127.0.0.1:${opts.port}/json/list`)
      ).json()) as typeof targets;
    } catch {
      await sleep(200);
    }
  }
  const page = targets.find((t) => t.type === 'page');
  if (!page) {
    chrome.kill();
    throw new Error('headless Chrome did not start');
  }
  const WS = (globalThis as any).WebSocket;
  if (!WS) throw new Error('no global WebSocket — run under NODE_OPTIONS=--experimental-websocket');
  const ws = new WS(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map<number, (m: any) => void>();
  const hosts = new Set<string>();
  const blocked: string[] = [];
  ws.addEventListener('message', (e: { data: string }) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!(m);
      pending.delete(m.id);
    }
    if (m.method === 'Network.requestWillBeSent') {
      try {
        hosts.add(new URL(m.params.request.url).host);
      } catch {
        // data: and blob: URLs have no host worth recording
      }
    }
    if (m.method === 'Fetch.requestPaused') {
      blocked.push(`${m.params.request.method} ${m.params.request.url}`);
      ws.send(
        JSON.stringify({
          id: ++id,
          method: 'Fetch.failRequest',
          params: { requestId: m.params.requestId, errorReason: 'BlockedByClient' },
        })
      );
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<any>((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Network.enable');
  await send('Page.enable');

  // One Fetch.enable carries every pattern: a second call REPLACES the first's patterns, so the
  // two blocks share this list rather than each enabling their own ([[GTC-366]] Q17).
  const blockedPatterns: string[] = [];
  const enableBlocks = () =>
    send('Fetch.enable', {
      patterns: blockedPatterns.map((urlPattern) => ({ urlPattern, requestStage: 'Request' })),
    });

  const evaluate = async <T>(expression: string): Promise<T> =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result
      ?.result?.value as T;

  return {
    async setViewport(width, height, mobile) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
      });
    },
    async setSessionCookie(token) {
      await send('Network.setCookie', {
        name: 'session',
        value: token,
        domain: 'localhost',
        path: '/',
      });
    },
    async clearCookies() {
      await send('Network.clearBrowserCookies');
    },
    async navigate(path, settleMs = 7000) {
      await send('Page.navigate', { url: `${base}${path}` });
      await sleep(settleMs);
    },
    evaluate,
    async click(selector) {
      const box = await evaluate<{ x: number; y: number } | null>(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
          const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`
      );
      if (!box) return false;
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', {
          type,
          x: box.x,
          y: box.y,
          button: 'left',
          clickCount: 1,
        });
      }
      await sleep(400);
      return true;
    },
    async clickGuarded(selector, settleMs = 400) {
      const at = await evaluate<{ x: number; y: number } | { why: string } | null>(
        `(() => { const t = document.querySelector(${JSON.stringify(selector)}); if (!t) return { why: 'no target' };
          if (/\\b(generate|regenerate|new event|hold|send|press|move on)\\b/i.test(t.innerText || '')) return { why: 'refused by its words' };
          t.scrollIntoView({ block: 'center', inline: 'nearest' });
          const r = t.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2;
          const hit = document.elementFromPoint(x, y);
          return hit && t.contains(hit) ? { x, y } : { why: 'the point is not inside the target' }; })()`
      );
      const refused = !at ? 'no answer' : 'why' in at ? at.why : null;
      if (refused || !at || 'why' in at) {
        console.log(`  clickGuarded REFUSED ${selector}: ${refused}`);
        return refused ?? 'no answer';
      }
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', {
          type,
          x: at.x,
          y: at.y,
          button: 'left',
          clickCount: 1,
        });
      }
      await sleep(settleMs);
      return null;
    },
    async blockPlanMaking() {
      blockedPatterns.push(
        '*finalize-plan*',
        '*regenerate-plan*',
        '*/generate',
        '*/generate?*',
        '*/regenerate',
        '*/regenerate?*',
        '*suggest-resolution*'
      );
      await enableBlocks();
    },
    async blockSends() {
      blockedPatterns.push(
        '*/send',
        '*/send?*',
        '*/nudge',
        '*/nudge?*',
        '*/resend',
        '*/resend?*',
        '*/trigger-nudges*',
        '*/wrap-up',
        '*/wrap-up?*',
        '*/wrap-up/retry*',
        '*/api/cron/*'
      );
      await enableBlocks();
    },
    planMakingBlocked: () => [...blocked],
    async insertText(text) {
      await send('Input.insertText', { text });
      await sleep(200);
    },
    async pressKey(key) {
      for (const type of ['keyDown', 'keyUp']) {
        await send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: 27 });
      }
      await sleep(300);
    },
    async screenshot(file, clip) {
      const { writeFileSync } = await import('node:fs');
      const shot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
      });
      writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    },
    hostsRequested: () => [...hosts],
    close() {
      try {
        ws.close();
      } catch {
        // already closed
      }
      chrome.kill();
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // the profile is in the OS temp directory; leaving it is harmless
      }
    },
  };
}
