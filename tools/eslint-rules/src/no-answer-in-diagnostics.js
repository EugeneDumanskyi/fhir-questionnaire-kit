/**
 * `no-answer-in-diagnostics` — NFR-X-04, INV-D-10, `05-architecture.md` §7.
 *
 * A diagnostic, an error and a console line are safe to log only if no answer
 * value ever reaches one: codes, paths, kinds and counts, never what the
 * respondent entered. This rule reads types (M4 plan D9). It reports an
 * expression anywhere inside the arguments of `diagnostic(…)`,
 * `new FhirqError(…)` or `console.*(…)` whose type is an answer or holds one —
 * directly, in a template literal, through concatenation, in an object — and
 * the `value` of an answer. An answer's `kind` and a list's `length` are
 * allowed: they are what the hydration diagnostics name.
 *
 * "An answer" is any object type with a `kind` whose type is one of the
 * answer kinds and a `value`, so a narrowed answer (`answer.kind === 'coding'`)
 * is caught as well as the `Answer` union.
 *
 * **What it cannot see:** a value copied out of an answer into a variable of
 * a plain type first (`const text = answer.value; diagnostic(…, text)`). That
 * aliasing is the leak property test's to catch at runtime
 * (`packages/core/test/property/leak.test.ts`).
 */

const ANSWER_KINDS = new Set(['boolean', 'decimal', 'integer', 'date', 'dateTime', 'string', 'coding', 'quantity']);

/** Members of an answer, or of a list of answers, that carry no value. */
const SAFE_MEMBERS = new Set(['kind', 'length']);

/** @type {import('eslint').Rule.RuleModule} */
export const noAnswerInDiagnostics = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid answer values in diagnostics, errors and console output (NFR-X-04)',
    },
    schema: [],
    messages: {
      answer:
        'An answer value reaches {{sink}} here. Diagnostics, errors and console output carry codes, paths and kinds, never what the respondent entered (NFR-X-04).',
      untyped: 'no-answer-in-diagnostics needs type information: run it where parserOptions.projectService is on.',
    },
  },

  create(context) {
    const services = context.sourceCode.parserServices;
    if (services?.program == null || services.esTreeNodeToTSNodeMap == null) {
      return {
        Program(node) {
          context.report({ node, messageId: 'untyped' });
        },
      };
    }
    const checker = services.program.getTypeChecker();
    const typeOf = (node) => checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node));

    /** Whether a type is an answer, a union with one, or an array or tuple of them. */
    const holdsAnswer = (type, seen = new Set()) => {
      if (seen.has(type)) return false;
      seen.add(type);
      if (type.isUnion() || type.isIntersection()) return type.types.some((member) => holdsAnswer(member, seen));
      if (checker.isArrayType(type) || checker.isTupleType(type)) {
        return checker.getTypeArguments(type).some((member) => holdsAnswer(member, seen));
      }
      const kind = type.getProperty('kind');
      if (kind === undefined || type.getProperty('value') === undefined) return false;
      const kindType = checker.getTypeOfSymbol(kind);
      const literals = kindType.isUnion() ? kindType.types : [kindType];
      return literals.some((literal) => literal.isStringLiteral() && ANSWER_KINDS.has(literal.value));
    };

    /** Each expression once, however many sinks it sits inside. */
    const reported = new Set();
    const report = (node, sink) => {
      if (reported.has(node)) return;
      reported.add(node);
      context.report({ node, messageId: 'answer', data: { sink } });
    };

    /**
     * Walks an argument; reports the outermost expression that holds an
     * answer, and does not look inside it again. A callback's parameters are
     * names, not values: only its body is read.
     */
    const inspect = (node, sink) => {
      if (node == null || typeof node.type !== 'string') return;
      if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
        inspect(node.body, sink);
        return;
      }
      const verdict = node.type === 'MemberExpression' && holdsAnswer(typeOf(node.object)) ? member(node) : own(node);
      if (verdict === 'leaks') report(node, sink);
      if (verdict === 'read') children(node).forEach((child) => inspect(child, sink));
    };

    /**
     * A member of an answer, or of a list of them: its `kind` and a list's
     * `length` are safe; a method (`answers.map`) is not a value itself, since
     * what flows out of it is checked inside its callback; anything else leaks.
     */
    const member = (node) => {
      const name = !node.computed && node.property.type === 'Identifier' ? node.property.name : null;
      if (name !== null && SAFE_MEMBERS.has(name)) return 'safe';
      return typeOf(node).getCallSignatures().length > 0 ? 'safe' : 'leaks';
    };

    /** Any other node: an expression that holds an answer leaks; otherwise read what is inside it. */
    const own = (node) => {
      const expression = node.type.endsWith('Expression') || node.type === 'Identifier' || node.type === 'TemplateLiteral';
      return expression && holdsAnswer(typeOf(node)) ? 'leaks' : 'read';
    };

    const children = (node) =>
      Object.entries(node)
        .filter(([key]) => key !== 'parent' && key !== 'typeAnnotation' && key !== 'typeArguments')
        .flatMap(([, child]) => (Array.isArray(child) ? child : [child]))
        .filter((child) => child !== null && typeof child === 'object' && typeof child.type === 'string');

    const sinkOf = (callee, isNew) => {
      if (callee.type === 'Identifier') {
        if (!isNew && callee.name === 'diagnostic') return 'a diagnostic';
        if (isNew && callee.name === 'FhirqError') return 'an error';
        return null;
      }
      if (!isNew && callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === 'console') return 'the console';
      return null;
    };

    const check = (node, isNew) => {
      const sink = sinkOf(node.callee, isNew);
      if (sink !== null) node.arguments.forEach((argument) => inspect(argument, sink));
    };

    return {
      CallExpression: (node) => check(node, false),
      NewExpression: (node) => check(node, true),
    };
  },
};
