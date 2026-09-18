/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // TEMPORARY — set back to false once GTC-221's 68 pre-existing lint findings
    // are cleared. Until then this states openly what was previously accidental:
    // ESLint was crashing silently inside `next build` (eslint-config-next/next
    // version mismatch), so the build was never actually lint-gated.
    ignoreDuringBuilds: true,
  },

  /*
   * GTC-189 slice 5a — THE PRESS'S OLD NAME, AS A REDIRECT AND NOT AS A ROUTE.
   *
   * Decision 31 renamed `confirm-invites-sent` to `send`: "A route named for a behaviour it
   * no longer has is the same defect class as everything else this week." The founder's
   * answer of 2026-09-19 was *"Rename now, and take the redirect"*, and the reason the old
   * paths must keep answering is that TWO LIVE host-reachable buttons post to them —
   * `InviteStatusSection` on `/plan/[eventId]` and the host view at `/h/[token]`, both
   * reading "I've sent the invites".
   *
   * ⚠ IT IS HERE AND NOT IN A ROUTE HANDLER, AND THE REASON IS MEASURED. Written as two
   * `route.ts` files the redirect works and costs two EXPORTED HTTP HANDLERS WITH NO GUARD
   * AND NO CREDENTIAL OF ANY KIND — the exact population GTC-267, GTC-268 and GTC-273 spent
   * three tickets counting down. `tests/security-route-scan-control.ts` caught it
   * immediately: 7 of its 118 pinned assertions moved, including "exactly 12 handlers carry
   * no guard and no other credential of any kind". As a config redirect there is no handler,
   * so the surface does not grow by one line and every pinned count stays where it was.
   *
   * `permanent: false` is a 307, which PRESERVES THE METHOD. A 301 or 308 would be a promise
   * that the old path is permanently equivalent, which it is not — it is going away — and a
   * 302 may rewrite POST to GET, which would silently stop the press happening at all.
   */
  async redirects() {
    return [
      {
        source: '/api/events/:id/confirm-invites-sent',
        destination: '/api/events/:id/send',
        permanent: false,
      },
      {
        source: '/api/h/:token/confirm-invites-sent',
        destination: '/api/h/:token/send',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
