import type { Answer } from '../src/kernel/answer.js';
import type { DefinitionInput, ItemInput } from '../src/kernel/input.js';
import { test as holds } from '../src/session/conditions.js';

/**
 * ADR-0009's test oracle: option A, full re-evaluation, written apart from the
 * engine. It shares only the operator semantics (`test`, proven pair by pair
 * in `conditions.test.ts`). Everything else is its own: the node tree comes
 * from the input spec, a question is found by rewriting the dependent's path,
 * enablement is a Jacobi iteration to a fixed point (M1's naive pass), and
 * retention compares a whole before-state with a whole after-state.
 *
 * It replays the same commands as the engine and says what the stored and
 * settled state must be. Nothing here is fast, and nothing needs to be.
 */

export type Retention = 'retain-exclude' | 'discard';

export type ModelCommand =
  | { readonly type: 'SetAnswer'; readonly path: string; readonly answers: readonly Answer[] }
  | { readonly type: 'ClearAnswer'; readonly path: string }
  | { readonly type: 'AddRepeatInstance'; readonly path: string }
  | { readonly type: 'RemoveRepeatInstance'; readonly path: string; readonly ordinal: number };

export interface OracleNode {
  readonly path: string;
  readonly item: ItemInput;
  /** The path of the node it sits under, or `null` at the root. */
  readonly parent: string | null;
  /** Direct children in document order, instances expanded in position order. */
  readonly children: readonly string[];
}

export interface Evaluation {
  readonly nodes: ReadonlyMap<string, OracleNode>;
  /** Document order. */
  readonly order: readonly string[];
  readonly own: ReadonlyMap<string, boolean>;
  readonly effective: ReadonlyMap<string, boolean>;
}

export type Outcome = { readonly outcome: 'refused'; readonly reason: string } | { readonly outcome: 'applied' | 'unchanged' };

const segment = (linkId: string) => encodeURIComponent(linkId);

export class Oracle {
  readonly #input: DefinitionInput;
  readonly #retention: Retention;
  readonly #byLinkId = new Map<string, { item: ItemInput; chain: readonly ItemInput[] }>();
  /** Stored answers by path, retained ones included. */
  readonly answers = new Map<string, readonly Answer[]>();
  /** Live ordinals by repeating group path, in position order, and the next ordinal to hand out. */
  readonly instances = new Map<string, { ordinals: number[]; next: number }>();

  constructor(input: DefinitionInput, retention: Retention) {
    this.#input = input;
    this.#retention = retention;
    const index = (items: readonly ItemInput[], chain: readonly ItemInput[]) => {
      for (const item of items) {
        this.#byLinkId.set(item.linkId, { item, chain: [...chain, item] });
        index(item.children, [...chain, item]);
      }
    };
    index(input.items, []);
  }

  /** Every node of the current stored structure, from scratch. */
  tree(): { nodes: Map<string, OracleNode>; order: string[] } {
    const nodes = new Map<string, OracleNode>();
    const order: string[] = [];
    const visit = (item: ItemInput, parent: string | null): string => {
      const path = parent === null ? segment(item.linkId) : `${parent}/${segment(item.linkId)}`;
      const children: string[] = [];
      order.push(path);
      nodes.set(path, { path, item, parent, children });
      if (item.type === 'group' && item.repeats) {
        const state = this.#instancesOf(path);
        for (const ordinal of state.ordinals) {
          for (const child of item.children) children.push(visit(child, `${path}[${ordinal}]`));
        }
      } else {
        for (const child of item.children) children.push(visit(child, path));
      }
      return path;
    };
    for (const root of this.#input.items) visit(root, null);
    // A child's `parent` is the group's path even when its prefix is an instance path.
    for (const node of nodes.values()) {
      if (node.parent !== null && !nodes.has(node.parent)) nodes.set(node.path, { ...node, parent: node.parent.replace(/\[\d+\]$/, '') });
    }
    return { nodes, order };
  }

  /** Option A: every own condition and effective enablement, iterated to a fixed point. */
  evaluate(): Evaluation {
    const { nodes, order } = this.tree();
    let effective = new Map(order.map((path) => [path, true]));
    let own = new Map<string, boolean>();
    for (let pass = 0; pass <= order.length + 1; pass += 1) {
      const current = effective;
      own = new Map(order.map((path) => [path, this.#own(path, nodes, current)]));
      const next = new Map(order.map((path) => [path, (own.get(path) ?? false) && parentEnabled(path, nodes, current)]));
      if (order.every((path) => next.get(path) === current.get(path))) break;
      effective = next;
    }
    return { nodes, order, own, effective };
  }

  #own(path: string, nodes: ReadonlyMap<string, OracleNode>, effective: ReadonlyMap<string, boolean>): boolean {
    const { item } = nodes.get(path) as OracleNode;
    if (item.enableWhen.length === 0) return true;
    const results = item.enableWhen.map((condition) => {
      if (condition.answer === null) return false;
      const question = this.questionPath(path, condition.question);
      const readable = question !== null && effective.get(question) === true ? (this.answers.get(question) ?? []) : [];
      return holds(condition.operator, condition.answer, readable);
    });
    return (item.enableBehavior ?? 'all') === 'all' ? results.every(Boolean) : results.some(Boolean);
  }

  /**
   * The question a condition at `dependent` reads, by rewriting paths: walk
   * the question's definition chain from the root, and at each repeating
   * group take the ordinal the dependent's own path has at the same depth.
   */
  questionPath(dependent: string, question: string): string | null {
    const target = this.#byLinkId.get(question);
    if (target === undefined) return null;
    const own = dependent.split('/');
    const parts = target.chain.map((item, depth) => {
      const isLast = depth === target.chain.length - 1;
      if (isLast || !(item.type === 'group' && item.repeats)) return segment(item.linkId);
      const match = /\[(\d+)\]$/.exec(own[depth] ?? '');
      return match === null ? null : `${segment(item.linkId)}[${match[1]}]`;
    });
    return parts.includes(null) ? null : parts.join('/');
  }

  #instancesOf(path: string): { ordinals: number[]; next: number } {
    let state = this.instances.get(path);
    if (state === undefined) {
      state = { ordinals: [0], next: 1 };
      this.instances.set(path, state);
    }
    return state;
  }

  /** Applies a command the way the domain says (§7.1, SM-02, SM-05), from before and after states. */
  dispatch(command: ModelCommand): Outcome {
    const before = this.evaluate();
    const node = before.nodes.get(command.path);
    if (node === undefined) return { outcome: 'refused', reason: 'unknown-path' };
    if (before.effective.get(command.path) !== true) return { outcome: 'refused', reason: 'node-disabled' };
    const outcome =
      command.type === 'AddRepeatInstance' || command.type === 'RemoveRepeatInstance'
        ? this.#repeat(command, node)
        : this.#answer(command, node);
    if (outcome.outcome === 'applied' && this.#retention === 'discard') this.#discard(before);
    return outcome;
  }

  #repeat(command: Extract<ModelCommand, { type: 'AddRepeatInstance' | 'RemoveRepeatInstance' }>, node: OracleNode): Outcome {
    if (!(node.item.type === 'group' && node.item.repeats)) return { outcome: 'refused', reason: 'not-repeating' };
    const state = this.#instancesOf(command.path);
    if (command.type === 'AddRepeatInstance') {
      if (node.item.maxOccurs !== null && state.ordinals.length >= node.item.maxOccurs) return { outcome: 'refused', reason: 'at-max-occurs' };
      state.ordinals.push(state.next);
      state.next += 1;
      return { outcome: 'applied' };
    }
    if (!state.ordinals.includes(command.ordinal)) return { outcome: 'refused', reason: 'unknown-instance' };
    state.ordinals.splice(state.ordinals.indexOf(command.ordinal), 1);
    this.#forget(`${command.path}[${command.ordinal}]`);
    return { outcome: 'applied' };
  }

  #answer(command: Extract<ModelCommand, { type: 'SetAnswer' | 'ClearAnswer' }>, node: OracleNode): Outcome {
    if (node.item.type === 'group' || node.item.type === 'display' || node.item.type === null) return { outcome: 'refused', reason: 'not-answerable' };
    const next = command.type === 'SetAnswer' ? command.answers : [];
    if (JSON.stringify(this.answers.get(command.path) ?? []) === JSON.stringify(next)) return { outcome: 'unchanged' };
    if (next.length === 0) this.answers.delete(command.path);
    else this.answers.set(command.path, next);
    return { outcome: 'applied' };
  }

  /** Under `discard`: what became disabled loses its answers, and a repeating group goes back to one empty instance. */
  #discard(before: Evaluation): void {
    const after = this.evaluate();
    for (const path of after.order) {
      if (before.effective.get(path) !== true || after.effective.get(path) !== false) continue;
      this.answers.delete(path);
      const { item } = after.nodes.get(path) as OracleNode;
      const state = this.instances.get(path);
      if (!(item.type === 'group' && item.repeats) || state === undefined || state.ordinals.length === 1) continue;
      for (const ordinal of state.ordinals) this.#forget(`${path}[${ordinal}]`);
      state.ordinals = [state.next];
      state.next += 1;
    }
  }

  /** Removal destroys: every stored answer and nested instance list under an instance (INV-S-25). */
  #forget(prefix: string): void {
    for (const key of [...this.answers.keys()]) if (key.startsWith(`${prefix}/`)) this.answers.delete(key);
    for (const key of [...this.instances.keys()]) if (key.startsWith(`${prefix}/`)) this.instances.delete(key);
  }

  /** What the snapshot must show: effectively enabled paths in document order, with answers and instance ordinals. */
  visible(evaluation: Evaluation = this.evaluate()): { path: string; answers: readonly Answer[]; instances: readonly number[] }[] {
    return evaluation.order
      .filter((path) => evaluation.effective.get(path) === true)
      .map((path) => {
        const { item } = evaluation.nodes.get(path) as OracleNode;
        const repeating = item.type === 'group' && item.repeats;
        return { path, answers: this.answers.get(path) ?? [], instances: repeating ? (this.instances.get(path)?.ordinals ?? [0]) : [] };
      });
  }
}

function parentEnabled(path: string, nodes: ReadonlyMap<string, OracleNode>, effective: ReadonlyMap<string, boolean>): boolean {
  const parent = nodes.get(path)?.parent ?? null;
  return parent === null || effective.get(parent) === true;
}
