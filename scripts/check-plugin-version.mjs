#!/usr/bin/env node
// Usage: node scripts/check-plugin-version.mjs [base-ref]   (default: origin/main)
// Installed Claude Code plugins only update when the plugin's version changes, so a change
// under library/ that keeps the same version never reaches existing users. This fails such
// a change and tells the author which version to set.
import { execFileSync } from 'node:child_process';

const base = process.argv[2] ?? 'origin/main';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const manifest = 'library/.claude-plugin/plugin.json';

const changed = git('diff', '--name-only', `${base}...HEAD`, '--', 'library/')
  .split('\n')
  .filter(Boolean);
if (changed.length === 0) {
  console.log('Plugin files are unchanged; no version bump needed.');
  process.exit(0);
}

const version = (ref) => JSON.parse(git('show', `${ref}:${manifest}`)).version;
const parts = (v) => v.split('.').map(Number);
const newer = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

const before = version(base);
const after = version('HEAD');
if (!newer(after, before)) {
  const [major, minor, patch] = parts(before);
  console.error(
    `library/ changed (${changed.length} file(s), e.g. ${changed[0]}) but the plugin version is still ${after}.\n` +
      `Set "version" to at least ${major}.${minor}.${(patch ?? 0) + 1} in ${manifest} and .claude-plugin/marketplace.json, ` +
      'and add a CHANGELOG entry. Installed plugins only update when the version goes up.',
  );
  process.exit(1);
}
console.log(`Plugin version ${before} -> ${after}.`);
