/**
 * `no-dom-in-render` — ADR-0015, NFR-C-08, M6.
 *
 * The React adapter renders on a server with no DOM (AC-08.3.1), and hydrates
 * with no warning only if nothing in a render depends on the client
 * (AC-08.3.2). So a DOM, storage or timer global may appear only in a function
 * nested inside a component or hook: an effect, an event handler, a ref
 * callback. It is reported:
 * - at module scope, which runs on import, on the server too;
 * - in the direct body of a component (a PascalCase function) or a hook (a
 *   `use*` function), which runs on every render;
 * - in a callback React calls during render: the initialiser of `useState`,
 *   `useReducer` or `useMemo`, and `useSyncExternalStore`'s snapshot readers;
 * - in any function that is not inside a component or hook, since nothing
 *   says when it runs.
 *
 * Types are not reported: `HTMLElement` in a type position emits nothing.
 */

import { FORBIDDEN_GLOBALS } from './no-dom-in-core.js';

/** Constructors a render might test against with `instanceof`, absent on a server. */
const RENDER_GLOBALS = new Set([
  ...FORBIDDEN_GLOBALS,
  'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'ShadowRoot', 'Document',
  'DocumentFragment', 'getSelection',
]);

/** Hooks whose function arguments React calls during render, by argument position. */
const RENDER_CALLBACKS = {
  useState: [0],
  useReducer: [2],
  useMemo: [0],
  useSyncExternalStore: [1, 2],
};

const FUNCTION = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/**
 * The name a function is known by: its own, the variable it is assigned to, or
 * the variable a wrapper call such as `memo(...)` or `forwardRef(...)` is
 * assigned to.
 */
function nameOf(fn) {
  if (fn.id?.type === 'Identifier') return fn.id.name;
  let parent = fn.parent;
  if (parent?.type === 'CallExpression') parent = parent.parent;
  return parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier' ? parent.id.name : null;
}

const rendersOrHooks = (fn) => {
  const name = nameOf(fn);
  return name !== null && (/^[A-Z]/.test(name) || /^use[A-Z0-9]/.test(name));
};

/** True when React calls `fn` during render as a hook's argument. */
function renderCallback(fn) {
  const call = fn.parent;
  if (call?.type !== 'CallExpression') return false;
  const { callee } = call;
  const hook = callee.type === 'Identifier' ? callee.name : callee.type === 'MemberExpression' && callee.property.type === 'Identifier' ? callee.property.name : null;
  const positions = hook === null ? undefined : RENDER_CALLBACKS[hook];
  return positions !== undefined && positions.includes(call.arguments.indexOf(fn));
}

/**
 * Whether a reference at `node` runs during render or on import. Walks out
 * through the enclosing functions: a render callback is transparent, a
 * component or hook is render, and any other function is deferred only if a
 * component or hook encloses it.
 */
function runsInRender(node) {
  let deferred = false;
  for (let current = node.parent; current != null; current = current.parent) {
    if (!FUNCTION.has(current.type) || renderCallback(current)) continue;
    if (rendersOrHooks(current)) return !deferred;
    deferred = true;
  }
  return true;
}

/** @type {import('eslint').Rule.RuleModule} */
export const noDomInRender = {
  meta: {
    type: 'problem',
    docs: { description: 'Forbid DOM, storage and timer globals outside effects and handlers in a renderer' },
    schema: [],
    messages: {
      global:
        "'{{name}}' is a DOM, storage or timer global, read where it runs on import or during render. Server rendering has no DOM and hydration must match it (ADR-0015): read it in an effect or an event handler.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const report = (node, name) => {
      if (runsInRender(node)) context.report({ node, messageId: 'global', data: { name } });
    };

    return {
      // `globalThis.document`, `globalThis['window']`.
      MemberExpression(node) {
        if (node.object.type !== 'Identifier' || node.object.name !== 'globalThis') return;
        const name =
          node.property.type === 'Identifier' && !node.computed
            ? node.property.name
            : node.property.type === 'Literal' && typeof node.property.value === 'string'
              ? node.property.value
              : null;
        if (name !== null && RENDER_GLOBALS.has(name)) report(node, name);
      },

      // Value position, only where the name is the global (as no-dom-in-core).
      'Program:exit'(node) {
        const globalScope = sourceCode.getScope(node);
        const identifiers = [
          ...globalScope.through.map((reference) => reference.identifier),
          ...globalScope.variables.filter((variable) => variable.defs.length === 0).flatMap((variable) => variable.references.map((reference) => reference.identifier)),
        ];
        const seen = new Set();
        for (const identifier of identifiers) {
          if (seen.has(identifier) || !RENDER_GLOBALS.has(identifier.name)) continue;
          seen.add(identifier);
          // A type position (`HTMLElement` in `useRef<HTMLElement>`) emits nothing.
          if (['TSTypeReference', 'TSQualifiedName', 'TSTypeQuery'].includes(identifier.parent?.type)) continue;
          report(identifier, identifier.name);
        }
      },
    };
  },
};
