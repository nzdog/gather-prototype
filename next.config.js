/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // TEMPORARY — set back to false once GTC-221's 68 pre-existing lint findings
    // are cleared. Until then this states openly what was previously accidental:
    // ESLint was crashing silently inside `next build` (eslint-config-next/next
    // version mismatch), so the build was never actually lint-gated.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
