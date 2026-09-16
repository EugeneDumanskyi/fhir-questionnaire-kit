import { owningPackage, repoPath } from './paths.js';

/**
 * `no-deep-imports` — NFR-M-06, ADR-0007, ADR-0013.
 *
 * Two ways to reach past a package's front door, both closed here:
 *
 * 1. A bare specifier into another package's internals — `@fhirq/core/session`
 *    rather than `@fhirq/core`. The `exports` map already blocks this at
 *    runtime; the rule makes it a lint error rather than a build failure a
 *    consumer discovers, and keeps the list of real entry points in one place.
 * 2. A relative import that climbs out of its own package —
 *    `../../core/src/session/state.js`. Nothing blocks that inside a
 *    workspace, and it is how a monorepo quietly loses its layering: the
 *    import resolves, the types check, and the published package is broken.
 */

/** @type {import('eslint').Rule.RuleModule} */
export const noDeepImports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid importing another package through anything but its published entry points',
    },
    schema: [
      {
        type: 'object',
        properties: {
          entryPoints: {
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' } },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      subpath:
        "'{{source}}' is not a published entry point of {{pkg}}. Import {{entries}} instead; hosts and renderers use the front door (ADR-0007).",
      unknown:
        "'{{source}}' names no known @fhirq package. Add its entry points to the no-deep-imports options when the package is real.",
      escapes:
        "'{{source}}' climbs out of {{pkg}} into {{target}}. Cross-package imports go through the package name, so the published artifact matches what the tests ran against.",
    },
  },

  create(context) {
    const entryPoints = context.options[0]?.entryPoints ?? {};
    const path = repoPath(context);
    const pkg = owningPackage(path);

    /**
     * @param {import('estree').Node} node
     * @param {string} source
     */
    const check = (node, source) => {
      if (source.startsWith('@fhirq/')) {
        const segments = source.split('/');
        const name = `${segments[0]}/${segments[1]}`;
        const entries = entryPoints[name];
        if (entries === undefined) {
          context.report({ node, messageId: 'unknown', data: { source } });
          return;
        }
        if (!entries.includes(source)) {
          context.report({
            node,
            messageId: 'subpath',
            data: { source, pkg: name, entries: entries.join(' or ') },
          });
        }
        return;
      }

      if (!source.startsWith('.') || pkg === null) return;
      const dir = path.slice(0, path.lastIndexOf('/'));
      const resolved = normalise(`${dir}/${source}`);
      const target = owningPackage(resolved);
      if (target === null || target === pkg) return;
      context.report({ node, messageId: 'escapes', data: { source, pkg, target } });
    };

    return {
      ImportDeclaration(node) {
        check(node.source, String(node.source.value));
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node.source, String(node.source.value));
      },
      ExportAllDeclaration(node) {
        if (node.source) check(node.source, String(node.source.value));
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal' && typeof node.source.value === 'string') {
          check(node.source, node.source.value);
        }
      },
    };
  },
};

/**
 * Collapses `.` and `..` segments in a repository-relative path.
 *
 * @param {string} path
 * @returns {string}
 */
function normalise(path) {
  const out = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') out.pop();
    else out.push(segment);
  }
  return out.join('/');
}
