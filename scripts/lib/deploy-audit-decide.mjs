/**
 * [[GTC-397]] — THE DECISION OF THE DEPLOY-DAY SECURITY CHECK ([[GTC-359]]), as pure functions.
 *
 * `scripts/check-deploy-audit.mjs` runs `npm audit --package-lock-only --json`, reads
 * `package-lock.json` and prints; everything it decides is here, so `tests/deploy-audit-test.ts`
 * can ask the same questions of small hand-written fixtures with no network.
 *
 * No import at all: no file, no child process, no network. Plain node, no dependencies.
 * It returns package names, severities and advisory ids only.
 */

export const WATCHED = ['next', 'sharp', 'axios', 'twilio'];
export const BUILD_ONLY_CSS = 'node_modules/next/node_modules/postcss';

/** npm's answer can be used only if it parsed and carries both lists. */
export function auditReadable(report) {
  return !!(report && !report.error && report.vulnerabilities && report.metadata?.vulnerabilities);
}

/** The lockfile can be used only if it parsed and carries its `packages` map (lockfile v2/v3). */
export function lockfileReadable(lock) {
  return !!(lock && typeof lock.packages === 'object' && lock.packages !== null);
}

/** The package name at a lockfile node path (`node_modules/a/node_modules/@s/b` is `@s/b`). */
const nameAt = (node) => node.slice(node.lastIndexOf('node_modules/') + 'node_modules/'.length);

/**
 * The copy of `dep` that the copy at `from` uses, found the way node finds it: the nearest
 * `node_modules/<dep>`, from the depending copy's own folder up to the root. `null` when none
 * is in the lockfile (an optional package for another platform, an absent optional peer).
 */
const resolveFrom = (packages, from, dep) => {
  let base = from;
  for (;;) {
    const candidate = `${base ? `${base}/` : ''}node_modules/${dep}`;
    if (Object.prototype.hasOwnProperty.call(packages, candidate)) return candidate;
    if (!base) return null;
    const cut = base.lastIndexOf('/node_modules/');
    base = cut < 0 ? '' : base.slice(0, cut);
  }
};

const advisoryId = (via) => {
  const ghsa =
    typeof via.url === 'string' ? via.url.match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/) : null;
  return ghsa ? ghsa[0] : `npm-${via.source}`;
};

/**
 * The decision: `{ counts, listing, notes, failures }`. The check fails when `failures` is not
 * empty. `report` is npm audit's JSON, `lock` the lockfile's; both must be readable.
 */
export function decide(report, lock) {
  const vulnerabilities = report.vulnerabilities;
  const ownAdvisories = (name) => {
    const seen = new Set();
    const out = [];
    for (const v of vulnerabilities[name]?.via ?? []) {
      if (typeof v !== 'object' || v.name !== name) continue;
      const id = advisoryId(v);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, severity: v.severity });
    }
    return out;
  };
  const isBuildOnlyCss = (name) => {
    const nodes = vulnerabilities[name]?.nodes ?? [];
    return name === 'postcss' && nodes.length > 0 && nodes.every((n) => n === BUILD_ONLY_CSS);
  };

  const failures = [];
  const notes = [];

  // Any critical, anywhere.
  for (const name of Object.keys(vulnerabilities).sort()) {
    for (const a of ownAdvisories(name)) {
      if (a.severity === 'critical') failures.push(`${name}: ${a.id} critical`);
    }
  }
  if (report.metadata.vulnerabilities.critical > 0 && failures.length === 0) {
    failures.push(`${report.metadata.vulnerabilities.critical} critical package(s)`);
  }

  // The four, and EVERYTHING each brings in, by the lockfile's own tree ([[GTC-397]]). Not npm
  // audit's `via` chain: npm flags a parent only when the fix needs the parent changed, so a
  // flagged follow-redirects under an unflagged axios (2026-10-22) was never reached that way.
  const packages = lock.packages;
  const flaggedAt = (name, node) => (vulnerabilities[name]?.nodes ?? []).includes(node);
  for (const top of WATCHED) {
    const seen = new Set();
    const queue = Object.keys(packages)
      .filter((node) => node !== '' && nameAt(node) === top)
      .map((node) => ({ node, chain: [top] }));
    // Breadth first: each flagged copy is named by its shortest chain, top first.
    while (queue.length > 0) {
      const { node, chain } = queue.shift();
      if (seen.has(node)) continue;
      seen.add(node);
      const name = nameAt(node);
      if (flaggedAt(name, node)) {
        const label = chain.join(' <- ');
        for (const a of ownAdvisories(name)) {
          if (chain.length > 1 && node === BUILD_ONLY_CSS && isBuildOnlyCss(name)) {
            notes.push(
              `${label}: ${a.id} ${a.severity} (next's build-only CSS compiler, not failed)`
            );
          } else if (a.severity !== 'critical') {
            failures.push(`${label}: ${a.id} ${a.severity}`);
          } else if (chain.length > 1) {
            failures.push(`${label}: ${a.id} critical`);
          }
        }
      }
      // Followed even below the build-only copy: what IT brings in still counts.
      const entry = packages[node] ?? {};
      const deps = {
        ...entry.dependencies,
        ...entry.optionalDependencies,
        ...entry.peerDependencies,
      };
      for (const dep of Object.keys(deps)) {
        const found = resolveFrom(packages, node, dep);
        if (found && !seen.has(found)) queue.push({ node: found, chain: [...chain, dep] });
      }
    }
  }

  const listing = Object.keys(vulnerabilities)
    .sort()
    .map((name) => {
      const ids = ownAdvisories(name).map((a) => `${a.id} (${a.severity})`);
      return `${name} ${vulnerabilities[name].severity}${ids.length ? `: ${ids.join(', ')}` : ''}`;
    });

  return {
    counts: report.metadata.vulnerabilities,
    listing,
    notes,
    failures: [...new Set(failures)],
  };
}
