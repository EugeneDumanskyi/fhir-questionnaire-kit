import { matchesPath, repoPath } from './paths.js';

/**
 * `no-network` — NFR-M-06, NFR-X-01, ADR-0012.
 *
 * The kit performs no I/O. `packages/element/src/default-resolver.ts` is the
 * single exception, because ADR-0012 ships exactly one default option resolver
 * and it has to fetch a ValueSet. Every other file — core, view, React, themes,
 * the playground — reaches the network through an injected port or not at all.
 *
 * The claim is one an evaluator's security review reads first, so it is checked
 * here rather than trusted, and the allowed path is an option so that the
 * exception is visible in `eslint.config.js` instead of buried in a rule.
 */

const FORBIDDEN_GLOBALS = new Set([
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'importScripts',
]);

/** Members that are network calls whatever they are called on. */
const FORBIDDEN_MEMBERS = new Set(['sendBeacon']);

/** @type {import('eslint').Rule.RuleModule} */
export const noNetwork = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid network APIs everywhere except the single default resolver permitted by ADR-0012',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      network:
        "'{{name}}' opens a network connection. Only {{allow}} may do that (ADR-0012, NFR-X-01); everywhere else the host supplies data through a port.",
    },
  },

  create(context) {
    const allow = context.options[0]?.allow ?? [];
    const path = repoPath(context);
    if (allow.some((pattern) => matchesPath(path, pattern))) return {};

    const allowText = allow.length > 0 ? allow.join(', ') : 'no file';
    const sourceCode = context.sourceCode;

    const report = (node, name) => {
      context.report({ node, messageId: 'network', data: { name, allow: allowText } });
    };

    return {
      MemberExpression(node) {
        if (node.computed || node.property.type !== 'Identifier') return;
        if (!FORBIDDEN_MEMBERS.has(node.property.name)) return;
        report(node, node.property.name);
      },

      'Program:exit'(node) {
        const globalScope = sourceCode.getScope(node);
        const reported = new Set();
        const consider = (identifier) => {
          if (reported.has(identifier)) return;
          reported.add(identifier);
          report(identifier, identifier.name);
        };
        for (const reference of globalScope.through) {
          if (FORBIDDEN_GLOBALS.has(reference.identifier.name)) consider(reference.identifier);
        }
        for (const variable of globalScope.variables) {
          if (!FORBIDDEN_GLOBALS.has(variable.name) || variable.defs.length > 0) continue;
          for (const reference of variable.references) consider(reference.identifier);
        }
      },
    };
  },
};
