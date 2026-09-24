import { matchesPath, repoPath } from './paths.js';

/**
 * `no-hardcoded-user-strings` — NFR-M-06, NFR-I-01.
 *
 * Every string a person reads comes from the message catalogue, so a host can
 * translate the kit by supplying one object and the ≤ 45 keys of NFR-I-02 stay
 * countable. A sentence written inline in a renderer is invisible to all of
 * that, and the moment one exists the claim "no hard-coded user-facing strings"
 * stops being true.
 *
 * **This rule is a heuristic, and says so.** There is no way to know from the
 * syntax alone whether a literal is a message or a code. It reports a string
 * literal of two or more words containing lowercase letters, in a value
 * position, in a file outside the catalogue — which is what a message looks
 * like and what almost nothing else does. Codes, link ids, FHIR system URLs,
 * property keys, type literals, comparison operands and import specifiers are
 * all excluded structurally rather than by guessing.
 *
 * At M0 the catalogue does not exist yet, so the rule is pointed at the path
 * the catalogue will occupy. **It is retuned in M4**, when the catalogue lands
 * and the false-positive rate can be measured against real code rather than
 * against fixtures (`06-roadmap.md` §3, M4).
 */

const SENTENCE = /[a-z]/;
const CODE_LIKE = /^[A-Z0-9_.:-]+$/;
const URL_LIKE = /^(?:https?|urn|mailto|file|data):|:\/\//;

/** JSX attributes whose values are structural, never prose. */
const STRUCTURAL_ATTRIBUTES = new Set([
  'class', 'className', 'part', 'exportparts', 'id', 'slot', 'style', 'type',
  'href', 'src', 'name', 'role', 'key', 'ref', 'data-testid', 'htmlFor',
]);

/** Parents whose string child is a module specifier. */
const MODULE_SPECIFIER_PARENTS = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
  'TSImportType',
]);

/** Parents whose `key` is a name rather than a message. */
const KEYED_PARENTS = new Set(['Property', 'PropertyDefinition', 'MethodDefinition']);

/** Operators that make their operand a code being matched, not a message. */
const COMPARISONS = new Set(['===', '!==', '==', '!=', 'in']);

/** Ancestors that put a literal in type position rather than value position. */
const TYPE_CONTEXT = new Set([
  'TSLiteralType',
  'TSTypeAnnotation',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSIndexedAccessType',
  'TSTypeParameterInstantiation',
  'TSModuleDeclaration',
]);

/** @type {import('eslint').Rule.RuleModule} */
export const noHardcodedUserStrings = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid user-facing string literals outside the message catalogue',
    },
    schema: [
      {
        type: 'object',
        properties: {
          catalogue: { type: 'array', items: { type: 'string' } },
          minWords: { type: 'integer', minimum: 2 },
          minLetters: { type: 'integer', minimum: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      literal:
        'A user-facing string belongs in the message catalogue, not here (NFR-I-01). Move it to a message key and read it through the catalogue; if this string is never shown to a person, give it a shape the rule does not read as prose.',
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const catalogue = options.catalogue ?? [];
    const minWords = options.minWords ?? 2;
    const minLetters = options.minLetters ?? 6;

    const path = repoPath(context);
    if (catalogue.some((pattern) => matchesPath(path, pattern))) return {};

    const sourceCode = context.sourceCode;

    /**
     * @param {string} value
     * @returns {boolean}
     */
    const looksLikeProse = (value) => {
      const text = value.trim();
      if (text.length === 0) return false;
      if (URL_LIKE.test(text)) return false;
      if (CODE_LIKE.test(text)) return false;
      if (!SENTENCE.test(text)) return false;
      if ((text.match(/[A-Za-z]/g) ?? []).length < minLetters) return false;
      return text.split(/\s+/).filter((word) => /[A-Za-z]/.test(word)).length >= minWords;
    };

    /**
     * Positions where a string is never prose whatever it says: a module
     * specifier, a key, a member name, a directive.
     *
     * @param {import('estree').Node} node
     * @param {import('estree').Node} parent
     * @returns {boolean}
     */
    const isStructuralPosition = (node, parent) => {
      if (MODULE_SPECIFIER_PARENTS.has(parent.type)) return true;
      if (parent.type === 'ExpressionStatement') return parent.expression === node;
      if (KEYED_PARENTS.has(parent.type)) return parent.key === node && parent.computed !== true;
      if (parent.type === 'MemberExpression') return parent.property === node;
      return false;
    };

    /**
     * Positions where the string is being compared or is a structural
     * attribute: a code being matched, a class name, a part name.
     *
     * @param {import('estree').Node} node
     * @param {import('estree').Node} parent
     * @returns {boolean}
     */
    const isComparedOrStructuralAttribute = (node, parent) => {
      if (parent.type === 'BinaryExpression') return COMPARISONS.has(parent.operator);
      if (parent.type === 'SwitchCase') return parent.test === node;
      if (parent.type === 'JSXAttribute') {
        return parent.name?.type === 'JSXIdentifier' && STRUCTURAL_ATTRIBUTES.has(parent.name.name);
      }
      return false;
    };

    /**
     * @param {import('estree').Node} node
     * @returns {boolean}
     */
    const inExcludedPosition = (node) => {
      const ancestors = sourceCode.getAncestors(node);
      if (ancestors.some((ancestor) => TYPE_CONTEXT.has(ancestor.type))) return true;

      const parent = ancestors[ancestors.length - 1];
      if (parent === undefined) return true;

      // `part={`item ${stem}`}`: the whole value of a structural attribute, written in braces.
      const attribute = parent.type === 'JSXExpressionContainer' ? ancestors[ancestors.length - 2] : undefined;
      return (
        isStructuralPosition(node, parent) ||
        isComparedOrStructuralAttribute(node, parent) ||
        (attribute !== undefined && isComparedOrStructuralAttribute(parent, attribute))
      );
    };

    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        if (!looksLikeProse(node.value)) return;
        if (inExcludedPosition(node)) return;
        context.report({ node, messageId: 'literal' });
      },

      TemplateLiteral(node) {
        // An interpolated sentence is the same problem wearing backticks, and
        // is also how hand-rolled formatting sneaks past NFR-I-04.
        const text = node.quasis.map((quasi) => quasi.value.cooked ?? '').join(' ');
        if (!looksLikeProse(text)) return;
        if (inExcludedPosition(node)) return;
        context.report({ node, messageId: 'literal' });
      },
    };
  },
};
