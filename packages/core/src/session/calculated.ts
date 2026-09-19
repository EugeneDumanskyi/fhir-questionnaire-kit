import { copyAnswer, isAnswer, sameAnswer, type Answer } from '../kernel/answer.js';
import { diagnostic } from '../kernel/diagnostic.js';
import type { ItemPath } from '../kernel/path.js';
import type { Collaborators } from './collaborator.js';
import { shared, type VisibleProjection } from './projection.js';
import { project } from './publish.js';
import { inDocumentOrder, type Store } from './store.js';

/**
 * ADR-0009 cycle step 4: calculated values through the host's evaluator
 * (ADR-0017, M4 plan D8). Only `calculatedExpression` is routed. Items are
 * evaluated in document order, each against the visible projection as it
 * stands, so an item sees the values of calculated items before it in this
 * cycle and a later one's from the last. A value joins the projection like an
 * answer, so rules, scorers and emission read it; a snapshot does not hold it,
 * since it is recomputed.
 *
 * A disabled item has no value. The evaluator returning `undefined` clears it;
 * a throw clears it and reports `evaluator-threw` naming the item, and a value
 * the item cannot hold clears it and reports `evaluator-threw` with detail
 * `type` — each once per item per session, never with the value or the
 * thrown text (AC-07.3.4, NFR-X-04).
 */

type Evaluate = (
  expression: { readonly language: string; readonly expression: string; readonly name?: string },
  context: { readonly path: ItemPath; readonly projection: Pick<VisibleProjection, 'status' | 'nodes'> },
) => unknown;

const NONE: readonly Answer[] = [];

export function calculate(store: Store, status: VisibleProjection['status'], evaluator: { readonly evaluate: Evaluate }, guard: Collaborators): void {
  let given: ReturnType<typeof shared> | null = null;
  for (const node of inDocumentOrder(store)) {
    const { calculation, path, accepts } = node.def;
    if (calculation === null) continue;
    let answers = NONE;
    if (node.effective) {
      const projection = (given ??= shared(project(store, status).projection));
      const value = guard.call(diagnostic('evaluator-threw', 'warning', path), () => evaluator.evaluate(calculation, { path: node.path, projection }))?.value;
      if (isAnswer(value) && accepts.includes(value.kind)) answers = [copyAnswer(value)];
      else if (value !== undefined) guard.once(diagnostic('evaluator-threw', 'warning', path, { detail: 'type' }));
    }
    const [before] = node.answers;
    const [after] = answers;
    if (before === after || (before !== undefined && after !== undefined && sameAnswer(before, after))) continue;
    node.answers = Object.freeze(answers);
    given = null;
  }
}
