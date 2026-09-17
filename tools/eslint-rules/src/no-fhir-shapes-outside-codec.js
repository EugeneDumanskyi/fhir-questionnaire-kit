import { matchesPath, repoPath } from './paths.js';

/**
 * `no-fhir-shapes-outside-codec` — NFR-M-06, ADR-0016.
 *
 * FHIR R4 resource shapes are defined and read in `fhir/r4/` only; the rest of
 * core works on version-neutral domain types, which is what makes "R5 could
 * attach here" a checkable claim rather than a paragraph. `resourceType` is the
 * one property every FHIR resource has and no domain type needs, so a file
 * outside the codec that declares or reads it has let a FHIR shape in.
 *
 * Reported: an object or class property, a type member, and a member access
 * named `resourceType`. Apply it to core's sources through the config's `files`
 * pattern; `allow` names the codec.
 */

const NAME = 'resourceType';

/** @type {import('eslint').Rule.RuleModule} */
export const noFhirShapesOutsideCodec = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Confine FHIR resource shapes (resourceType) to the R4 codec',
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
      shape:
        "'resourceType' is a FHIR resource shape. Only the codec (fhir/r4/) knows FHIR; everything else uses domain types (ADR-0016).",
    },
  },

  create(context) {
    const allow = context.options[0]?.allow ?? [];
    const path = repoPath(context);
    if (allow.some((pattern) => matchesPath(path, pattern))) return {};

    /** @param {import('estree').Node} key */
    const named = (key, computed) =>
      (!computed && key.type === 'Identifier' && key.name === NAME) ||
      (key.type === 'Literal' && key.value === NAME);

    /** @param {import('estree').Node} node */
    const report = (node) => context.report({ node, messageId: 'shape' });

    return {
      Property(node) {
        if (named(node.key, node.computed)) report(node.key);
      },
      PropertyDefinition(node) {
        if (named(node.key, node.computed)) report(node.key);
      },
      TSPropertySignature(node) {
        if (named(node.key, node.computed)) report(node.key);
      },
      MemberExpression(node) {
        if (named(node.property, node.computed)) report(node.property);
      },
    };
  },
};
