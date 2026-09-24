/**
 * `no-dom-in-core` — NFR-M-06, ADR-0007.
 *
 * `packages/core`, including `view/`, touches no DOM, no BOM, no storage and no
 * timers. The type layer enforces half of this already (core's tsconfig omits
 * `"DOM"` from `lib`), but a `declare global`, a `globalThis` member access or a
 * `// @ts-expect-error` would slip past it, and the claim is load-bearing: it is
 * what lets the engine run in Node, in a worker and under SSR (NFR-C-04).
 *
 * Apply it through the config's `files` pattern; the rule itself does not care
 * where it runs, so the same rule guards any future DOM-free package.
 */

/** Browser globals. A value here is reported wherever it resolves to a global. */
export const FORBIDDEN_GLOBALS = new Set([
  'window', 'document', 'navigator', 'location', 'history', 'screen', 'frames',
  'parent', 'top', 'self', 'customElements', 'getComputedStyle', 'matchMedia',
  'alert', 'confirm', 'prompt', 'localStorage', 'sessionStorage', 'indexedDB',
  'caches', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
  'cancelIdleCallback', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'CSSStyleSheet',
  'DOMParser', 'XPathEvaluator', 'Notification', 'CustomEvent', 'Event',
  'EventTarget', 'AbortController', 'AbortSignal', 'FileReader', 'Blob',
]);

/** `lib.dom` type names. Reported in type position as well as value position. */
const FORBIDDEN_TYPES = new Set([
  'HTMLElement', 'HTMLInputElement', 'HTMLFormElement', 'Element', 'Node',
  'NodeList', 'ShadowRoot', 'DocumentFragment', 'Document', 'Window',
  'CSSStyleSheet', 'CSSStyleDeclaration', 'Event', 'CustomEvent', 'EventTarget',
  'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'InputEvent', 'DOMRect',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'Storage',
]);

/** @type {import('eslint').Rule.RuleModule} */
export const noDomInCore = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid DOM, BOM, storage and timer globals and lib.dom types in the DOM-free core',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowGlobals: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      global:
        "'{{name}}' is a DOM, storage or timer global. packages/core is DOM-free (ADR-0007); if core seems to need one, that is a design error.",
      type: "'{{name}}' is a lib.dom type. packages/core describes state, never markup (ADR-0007).",
    },
  },

  create(context) {
    const allowed = new Set(context.options[0]?.allowGlobals ?? []);
    const sourceCode = context.sourceCode;

    /**
     * @param {string} name
     * @returns {boolean}
     */
    const isForbiddenGlobal = (name) => FORBIDDEN_GLOBALS.has(name) && !allowed.has(name);

    return {
      // Type position: `let el: HTMLElement`, `Array<Element>`.
      TSTypeReference(node) {
        const { typeName } = node;
        if (typeName.type !== 'Identifier') return;
        if (!FORBIDDEN_TYPES.has(typeName.name) || allowed.has(typeName.name)) return;
        context.report({ node: typeName, messageId: 'type', data: { name: typeName.name } });
      },

      // `globalThis.document`, `globalThis['window']`.
      MemberExpression(node) {
        if (node.object.type !== 'Identifier' || node.object.name !== 'globalThis') return;
        const name =
          node.property.type === 'Identifier' && !node.computed
            ? node.property.name
            : node.property.type === 'Literal' && typeof node.property.value === 'string'
              ? node.property.value
              : null;
        if (name === null || !isForbiddenGlobal(name)) return;
        context.report({ node, messageId: 'global', data: { name } });
      },

      // Value position, but only where the name really is the global: a local
      // binding called `document` is someone's own variable, not the DOM.
      'Program:exit'(node) {
        const globalScope = sourceCode.getScope(node);
        const reported = new Set();
        const report = (identifier) => {
          if (reported.has(identifier)) return;
          reported.add(identifier);
          context.report({
            node: identifier,
            messageId: 'global',
            data: { name: identifier.name },
          });
        };

        // Unresolved: no `globals` entry declares it, which is the usual case
        // for a package configured without a browser environment.
        for (const reference of globalScope.through) {
          if (isForbiddenGlobal(reference.identifier.name)) report(reference.identifier);
        }
        // Resolved to an environment global: the config declared it, so the
        // reference is not in `through`. A variable with no `defs` is one
        // nobody in this file declared, so it is still the DOM's.
        for (const variable of globalScope.variables) {
          if (!isForbiddenGlobal(variable.name) || variable.defs.length > 0) continue;
          for (const reference of variable.references) report(reference.identifier);
        }
      },
    };
  },
};
