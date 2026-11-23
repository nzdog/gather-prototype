/**
 * [[GTC-478]] — call a session-guarded route handler in THIS process, as a signed-in user.
 *
 * `requireEventRole` reads the session cookie through `cookies()` from `next/headers`, which only
 * works inside a real request. tests/decide-later-write-test.ts set the pattern: stand in for that
 * ONE reader, and run everything else (the guard, `getUser`, the Session row, the EventRole, the
 * route, the database) as the real code.
 *
 * THIS STAND-IN HANDS BACK THE REAL READER unless `actAs` or `actAsNobody` is in force, so a file
 * that imports it behaves exactly as before for every call made outside those. It is used by
 * tests/sessions-foundation-test.ts and by tests/security-validation.ts Suite 21.
 *
 * IMPORT THIS BEFORE any file that imports `next/headers` (directly or through src/lib/auth): the
 * stand-in is put in place when this file is loaded, and a module already loaded keeps what it got.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module') as any;

/** null: the real reader answers. '': a request with no session cookie. Else: that token. */
let sessionToken: string | null = null;

/** Act as the user whose Session row has this token, until `standDown`. */
export function actAs(token: string): void {
  sessionToken = token;
}

/** Act as a request that carries no session cookie (signed out), until `standDown`. */
export function actAsNobody(): void {
  sessionToken = '';
}

/** Stop standing in: the real `cookies()` answers again. */
export function standDown(): void {
  sessionToken = null;
}

const realLoad = Module._load;
Module._load = function (request: string, ...rest: unknown[]) {
  const loaded = realLoad.call(this, request, ...rest);
  if (request !== 'next/headers') return loaded;
  return {
    ...loaded,
    cookies: async (...args: unknown[]) => {
      if (sessionToken === null) return loaded.cookies(...args);
      const token = sessionToken;
      return {
        get: (name: string) => (name === 'session' && token ? { name, value: token } : undefined),
        has: (name: string) => name === 'session' && token !== '',
        getAll: () => (token ? [{ name: 'session', value: token }] : []),
      };
    },
  };
};
