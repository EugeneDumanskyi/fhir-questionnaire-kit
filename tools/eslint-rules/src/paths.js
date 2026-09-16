import { relative, sep } from 'node:path';

const DEEP = 'DEEPSTARPLACEHOLDER';

/**
 * A file's path relative to the repository root, with forward slashes, so rule
 * options can be written the way the repository instructions write them
 * ("packages/element/src/default-resolver.ts") on any platform.
 *
 * @param {import('eslint').Rule.RuleContext} context
 * @returns {string}
 */
export function repoPath(context) {
  const filename = context.filename ?? context.getFilename();
  const root = context.cwd ?? process.cwd();
  return relative(root, filename).split(sep).join('/');
}

/**
 * Matches a repository-relative path against a small glob: `*` inside one
 * segment, `**` across segments. Deliberately tiny and dependency-free, so a
 * reviewer can audit it in a minute (ADR-0018: custom gates are small scripts).
 *
 * @param {string} path
 * @param {string} pattern
 * @returns {boolean}
 */
export function matchesPath(path, pattern) {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, `${DEEP}SLASH`)
    .replace(/\*\*/g, DEEP)
    .replace(/\*/g, '[^/]*')
    .replace(new RegExp(`${DEEP}SLASH`, 'g'), '(?:.*/)?')
    .replace(new RegExp(DEEP, 'g'), '.*');
  return new RegExp(`^${source}$`).test(path);
}

/**
 * The workspace package a file belongs to ("packages/core", "apps/playground"),
 * or null when it belongs to none.
 *
 * @param {string} path repository-relative path
 * @returns {string | null}
 */
export function owningPackage(path) {
  const parts = path.split('/');
  if (parts.length < 2) return null;
  const root = parts[0];
  if (root !== 'packages' && root !== 'apps' && root !== 'tools') return null;
  return `${root}/${parts[1]}`;
}
