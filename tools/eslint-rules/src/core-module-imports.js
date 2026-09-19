import { repoPath } from './paths.js';

/**
 * `core-module-imports` — NFR-M-06, `05-architecture.md` §4.1.
 *
 * Inside `@fhirq/core`, each module is one bounded context and may import only
 * the modules its row in §4.1 names. The table is the rule's option, written in
 * `eslint.config.js` next to the other architectural claims, so a reader checks
 * it against §4.1 without reading this file.
 *
 * An allowed entry is a module (`kernel`), which allows everything under it, or
 * one file inside a module without its extension (`session/projection`), which
 * allows that file only. `index` is the package's public engine API,
 * `src/index.ts`. A file's own module is always allowed. A file under `root`
 * that belongs to no listed module is reported, so a new module has to be
 * added to the table, visibly, before it can import anything.
 *
 * Two finer grains, both from ADR-0021 (M3):
 * - `files` gives one file its own row, in place of its module's, and gives
 *   the files at the root of `root` (`index`, `resume`) the rows they need.
 *   A root file with no row is reported like a file in no module. A file row
 *   does not allow the file's own module unless it lists it.
 * - `importers` names the only files that may import a file, whatever their
 *   rows say and even from inside its own module: the session state registry,
 *   and the resume path that nothing reachable from `index` or `view` may
 *   import.
 *
 * And one from M4: `typesOnly` names modules that may hold types and nothing
 * else — `ports/`, whose row in §4.1 says "types only" (BC5). A statement
 * there that would emit JavaScript is reported: a value import, a function, a
 * variable, a class, an enum, an expression.
 *
 * Imports that leave `root` are not this rule's business: `no-deep-imports`
 * owns crossing a package boundary.
 */

/** Statements that emit nothing, so a types-only module may hold them. */
const TYPE_STATEMENTS = new Set(['TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'TSModuleDeclaration', 'TSDeclareFunction']);

/**
 * @param {import('estree').Node} node a top-level statement
 * @returns {boolean}
 */
function emitsNothing(node) {
  if (TYPE_STATEMENTS.has(node.type)) return true;
  if (node.type === 'ImportDeclaration') return node.importKind === 'type' || (node.specifiers.length > 0 && node.specifiers.every((specifier) => specifier.importKind === 'type'));
  if (node.type === 'ExportNamedDeclaration') {
    if (node.declaration) return TYPE_STATEMENTS.has(node.declaration.type);
    return node.exportKind === 'type' || node.specifiers.every((specifier) => specifier.exportKind === 'type');
  }
  if (node.type === 'ExportAllDeclaration') return node.exportKind === 'type';
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
export const coreModuleImports = {
  meta: {
    type: 'problem',
    docs: {
      description: "Enforce the core module import table of 05-architecture.md §4.1",
    },
    schema: [
      {
        type: 'object',
        properties: {
          root: { type: 'string' },
          modules: {
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' } },
          },
          files: {
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' } },
          },
          importers: {
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' } },
          },
          typesOnly: { type: 'array', items: { type: 'string' } },
        },
        required: ['root', 'modules'],
        additionalProperties: false,
      },
    ],
    messages: {
      forbidden:
        "'{{source}}' reaches {{target}} from {{module}}/. 05-architecture.md §4.1 lets {{module}}/ import only {{allowed}}.",
      unlisted:
        "{{path}} is in no module of the §4.1 import table. Add its module to the core-module-imports options first.",
      restricted:
        "'{{source}}' reaches {{target}}, which only {{importers}} may import (05-architecture.md §4.1, ADR-0021).",
      runtime:
        '{{module}}/ is types only (05-architecture.md §4.1): this statement would emit JavaScript. Move the code to the module that uses the port.',
    },
  },

  create(context) {
    const { root, modules, files = {}, importers = {}, typesOnly = [] } = context.options[0];
    const path = repoPath(context);
    if (!path.startsWith(`${root}/`)) return {};

    const local = stripExtension(path.slice(root.length + 1));
    const fileRow = Object.hasOwn(files, local) ? files[local] : undefined;
    const module = fileRow === undefined ? moduleOf(local, modules) : local;
    if (module === null) {
      return {
        Program(node) {
          context.report({ node, messageId: 'unlisted', data: { path } });
        },
      };
    }
    const allowed = fileRow ?? modules[module] ?? [];
    const dir = path.slice(0, path.lastIndexOf('/'));

    /**
     * @param {import('estree').Node} node
     * @param {string} source
     */
    const check = (node, source) => {
      if (!source.startsWith('.')) return;
      const resolved = normalise(`${dir}/${source}`);
      if (!resolved.startsWith(`${root}/`)) return;
      const target = stripExtension(resolved.slice(root.length + 1));
      const only = Object.hasOwn(importers, target) ? importers[target] : undefined;
      if (only !== undefined) {
        if (only.includes(local)) return;
        const names = only.length === 0 ? 'no file' : only.join(', ');
        context.report({ node, messageId: 'restricted', data: { source, target, importers: names } });
        return;
      }
      if ((fileRow === undefined && within(target, module)) || allowed.some((entry) => within(target, entry))) return;
      context.report({
        node,
        messageId: 'forbidden',
        data: {
          source,
          target,
          module,
          allowed: allowed.length === 0 ? 'nothing' : allowed.join(', '),
        },
      });
    };

    return {
      Program(node) {
        if (!typesOnly.includes(module)) return;
        for (const statement of node.body) {
          if (!emitsNothing(statement)) context.report({ node: statement, messageId: 'runtime', data: { module } });
        }
      },
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
 * The longest listed module a root-relative path sits in, so `fhir/r4/parse`
 * belongs to `fhir/r4` even if `fhir` were ever listed too.
 *
 * @param {string} local
 * @param {Record<string, string[]>} modules
 * @returns {string | null}
 */
function moduleOf(local, modules) {
  let best = null;
  for (const name of Object.keys(modules)) {
    if (local.startsWith(`${name}/`) && (best === null || name.length > best.length)) best = name;
  }
  return best;
}

/**
 * @param {string} target root-relative path without extension
 * @param {string} entry a module, or one file inside a module
 * @returns {boolean}
 */
function within(target, entry) {
  return target === entry || target.startsWith(`${entry}/`);
}

/** @param {string} path */
function stripExtension(path) {
  return path.replace(/\.(?:[cm]?[jt]s|tsx|jsx)$/, '');
}

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
