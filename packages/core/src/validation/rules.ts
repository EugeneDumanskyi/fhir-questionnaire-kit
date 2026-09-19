import type { Answer } from '../kernel/answer.js';
import { slot } from '../kernel/dense.js';
import { diagnostic } from '../kernel/diagnostic.js';
import type { Issue } from '../kernel/issue.js';
import type { LinkId } from '../kernel/item-type.js';
import type { ItemPath } from '../kernel/path.js';
import type { Definition, ItemDef } from '../definition/compile.js';
import type { Collaborate, VisibleNode, VisibleProjection } from '../session/projection.js';

/**
 * Cross-field rules (US-04.3, M3 plan D5). A host registers them with the
 * session; each names the items it reads by `linkId` and returns a message
 * catalogue key, or `null`.
 *
 * A rule runs once per instance of the innermost repeating group its items
 * share, the scoping `enableWhen` uses (INV-D-13): inside `meds[2]` it reads
 * `meds[2]`'s items and items outside every repeat. It is skipped wherever
 * any item it names is disabled (INV-V-03). It receives frozen answers of the
 * visible projection only (INV-V-04), and a rule that throws contributes no
 * issue and becomes a diagnostic, never a failed cycle (INV-V-05). It keeps
 * this shape rather than the whole projection scorers get (M4 plan D4).
 */
export interface Rule {
  readonly inputs: readonly LinkId[];
  /** Where the issue attaches: the inputs when absent, the form when empty (AC-04.3.1). */
  readonly targets?: readonly LinkId[];
  readonly severity?: 'error' | 'warning';
  readonly check: (answers: Readonly<Record<LinkId, readonly Answer[]>>) => string | null;
}

export interface CompiledRule {
  readonly index: number;
  readonly rule: Rule;
  readonly inputs: readonly ItemDef[];
  readonly targets: readonly ItemDef[];
  /** The repeating group whose instances the rule runs in, or `-1` for once per form. */
  readonly scope: number;
}

/**
 * Checks registered rules against the definition. `null` when one cannot be
 * read — an unknown `linkId`, or items in repeats that share no instance —
 * which the session reports as `invalid-options`: an integration error.
 */
export function compileRules(definition: Definition, rules: unknown): CompiledRule[] | null {
  if (rules === undefined) return [];
  if (!Array.isArray(rules)) return null;
  const compiled: CompiledRule[] = [];
  for (const [index, rule] of (rules as readonly unknown[]).entries()) {
    const read = compileRule(definition, rule, index);
    if (read === null) return null;
    compiled.push(read);
  }
  return compiled;
}

function compileRule(definition: Definition, candidate: unknown, index: number): CompiledRule | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const rule = candidate as Partial<Rule>;
  const items = (linkIds: unknown): ItemDef[] | null => {
    if (!Array.isArray(linkIds)) return null;
    const ids = (linkIds as readonly unknown[]).map((linkId) => (typeof linkId === 'string' ? definition.byLinkId.get(linkId) : undefined));
    return ids.every((id) => id !== undefined) ? ids.map((id) => slot(definition.items, id)) : null;
  };
  const inputs = items(rule.inputs);
  const targets = rule.targets === undefined ? inputs : items(rule.targets);
  const severity: unknown = rule.severity;
  if (inputs === null || inputs.length === 0 || targets === null || typeof rule.check !== 'function') return null;
  if (severity !== undefined && severity !== 'error' && severity !== 'warning') return null;
  const scope = sharedScope(definition, [...inputs, ...targets]);
  return scope === null ? null : { index, rule: rule as Rule, inputs, targets, scope };
}

/** The innermost repeating group enclosing every item, when their repeats nest in one chain; otherwise `null`. */
function sharedScope(definition: Definition, items: readonly ItemDef[]): number | null {
  const chain = (id: number): number[] => {
    const out: number[] = [];
    for (let scope = id; scope !== -1; scope = slot(definition.items, scope).repeatScope) out.push(scope);
    return out;
  };
  const deepest = items.reduce((best, item) => (chain(item.repeatScope).length > chain(best).length ? item.repeatScope : best), -1);
  const enclosing = chain(deepest);
  return items.every((item) => item.repeatScope === -1 || enclosing.includes(item.repeatScope)) ? deepest : null;
}

/** Runs every rule in every instance of its scope, in document order of those instances. */
export function ruleIssues(
  definition: Definition,
  rules: readonly CompiledRule[],
  projection: VisibleProjection,
  call: Collaborate,
): Issue[] {
  if (rules.length === 0) return [];
  const byPath = new Map<string, VisibleNode>(projection.nodes.map((node) => [node.path, node]));
  const contexts = instanceContexts(projection);
  return rules.flatMap((compiled) =>
    (contexts.get(compiled.scope) ?? []).flatMap((context) => {
      const find = (item: ItemDef): VisibleNode | undefined => byPath.get(pathIn(definition, item, context));
      const inputs = compiled.inputs.map(find);
      const targets = compiled.targets.map(find);
      const present = (nodes: readonly (VisibleNode | undefined)[]): nodes is readonly VisibleNode[] => nodes.every((node) => node !== undefined);
      if (!present(inputs) || !present(targets)) return [];
      const message = run(compiled, inputs, call);
      if (message === null) return [];
      const severity = compiled.rule.severity ?? 'error';
      const issue = (node: VisibleNode | null): Issue => ({
        code: 'rule',
        severity,
        path: node?.path ?? null,
        linkId: node?.item.linkId ?? null,
        message,
        params: {},
      });
      return targets.length === 0 ? [issue(null)] : targets.map(issue);
    }),
  );
}

/**
 * The rule's message key, or `null` for none and for a rule that threw, which
 * the guard reports once per rule, naming the rule only: the thrown value may
 * carry an answer (NFR-X-04).
 */
function run(compiled: CompiledRule, inputs: readonly VisibleNode[], call: Collaborate): string | null {
  const answers: Record<LinkId, readonly Answer[]> = {};
  for (const node of inputs) answers[node.item.linkId] = node.answers;
  const message = call(diagnostic('rule-threw', 'warning', null, { detail: `rules[${compiled.index}]` }), () => compiled.rule.check(Object.freeze(answers)));
  return typeof message?.value === 'string' && message.value !== '' ? message.value : null;
}

/**
 * For each repeating group, the enclosing instance paths of each of its
 * visible instances, by group id; `-1` holds the one form-level context.
 */
function instanceContexts(projection: VisibleProjection): Map<number, ReadonlyMap<number, ItemPath>[]> {
  const contexts = new Map<number, ReadonlyMap<number, ItemPath>[]>([[-1, [new Map()]]]);
  const visit = (node: VisibleNode, enclosing: ReadonlyMap<number, ItemPath>): void => {
    for (const child of node.children) visit(child, enclosing);
    for (const instance of node.instances) {
      const inner = new Map(enclosing).set(node.item.id, instance.path);
      const list = contexts.get(node.item.id);
      if (list === undefined) contexts.set(node.item.id, [inner]);
      else list.push(inner);
      for (const child of instance.children) visit(child, inner);
    }
  };
  for (const root of projection.roots) visit(root, new Map());
  return contexts;
}

/** An item's node path in a context: its definition path, rewritten under the instance of its repeating group. */
function pathIn(definition: Definition, item: ItemDef, context: ReadonlyMap<number, ItemPath>): string {
  if (item.repeatScope === -1) return item.path;
  const group = slot(definition.items, item.repeatScope);
  return `${context.get(item.repeatScope) ?? ''}${item.path.slice(group.path.length)}`;
}
