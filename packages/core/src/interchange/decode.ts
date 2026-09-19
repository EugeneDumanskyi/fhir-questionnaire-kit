import type { Answer } from '../kernel/answer.js';
import { slot } from '../kernel/dense.js';
import { diagnostic, type Diagnostic } from '../kernel/diagnostic.js';
import { childPath, instancePath, type ItemPath } from '../kernel/path.js';
import type { StoredItem } from '../kernel/response.js';
import type { Definition, ItemDef } from '../definition/compile.js';

/**
 * Hydration step 3 (`04-domain.md` §8): stored items walked against the
 * definition, in document order. What fits is loaded; what does not is a
 * diagnostic naming the path and the types, never the value (INV-E-08,
 * INV-E-09), and is not loaded, so no later emission can carry it.
 *
 * - An unknown `linkId`, or one stored under the wrong parent, is an
 *   `orphan-answer`; its subtree is skipped (AC-06.1.3).
 * - An answer the item cannot hold is a `quarantined-answer` with the kinds
 *   expected and found (AC-06.3.2); so are more answers than a non-repeating
 *   item allows, and none of them is loaded (AC-06.3.3), and a non-repeating
 *   item stored more than once. An answer on a calculated item is quarantined
 *   too when the session has no evaluator; with one, it is silently replaced
 *   by the value the evaluator computes (M4 plan D8).
 * - A repeating group gets one instance per stored occurrence, ordinals
 *   `0 … n-1` in stored order (INV-E-11), whatever its `minOccurs` and
 *   `maxOccurs` say: SM-05 reports those.
 */
export interface Decoded {
  readonly instances: Map<ItemPath, { readonly ordinals: readonly number[]; readonly next: number }>;
  readonly answers: Map<ItemPath, readonly Answer[]>;
  readonly diagnostics: Diagnostic[];
}

export function decodeItems(definition: Definition, stored: readonly StoredItem[]): Decoded {
  const decoded: Decoded = { instances: new Map(), answers: new Map(), diagnostics: [] };
  const report = (code: 'orphan-answer' | 'quarantined-answer', path: string, extra: { detail?: string; expected?: string; found?: string } = {}): void => {
    decoded.diagnostics.push(diagnostic(code, 'warning', path, extra));
  };

  const walk = (items: readonly StoredItem[], parent: number, container: ItemPath | null): void => {
    for (const [linkId, occurrences] of inDocumentOrder(definition, items)) {
      const path = childPath(container, linkId);
      const id = definition.byLinkId.get(linkId);
      const def = id === undefined ? undefined : slot(definition.items, id);
      if (def === undefined || def.parent !== parent) {
        occurrences.forEach(() => report('orphan-answer', path));
        continue;
      }
      if (def.type === 'group' && def.repeats) {
        decoded.instances.set(path, { ordinals: occurrences.map((_, ordinal) => ordinal), next: occurrences.length });
        occurrences.forEach((occurrence, ordinal) => group(def, occurrence, instancePath(path, ordinal)));
      } else if (occurrences.length > 1) {
        report('quarantined-answer', path, { detail: 'repeated-item', expected: '1', found: String(occurrences.length) });
      } else if (def.type === 'group') {
        group(def, slot(occurrences, 0), path);
      } else {
        question(def, slot(occurrences, 0), path);
      }
    }
  };

  const group = (def: ItemDef, occurrence: StoredItem, path: ItemPath): void => {
    if (occurrence.answers.length > 0) report('quarantined-answer', path, { expected: 'none', found: kinds(occurrence) });
    walk(occurrence.items, def.id, path);
  };

  const question = (def: ItemDef, occurrence: StoredItem, path: ItemPath): void => {
    // A question has no child items here (INV-D-17), under itself or under an answer.
    for (const child of [...occurrence.items, ...occurrence.answerItems]) report('orphan-answer', childPath(path, child.linkId));
    const { answers } = occurrence;
    if (answers.length === 0) return;
    // With an evaluator, a calculated item's stored value is recomputed, not loaded (M4 plan D8).
    if (def.calculation !== null) return;
    if (answers.length > 1 && !def.repeats) {
      report('quarantined-answer', path, { detail: 'too-many-answers', expected: '1', found: String(answers.length) });
      return;
    }
    const typed = answers.flatMap((stored) => (stored.answer !== null && def.accepts.includes(stored.answer.kind) ? [stored.answer] : []));
    if (typed.length < answers.length || def.calculated) {
      const expected = def.calculated || def.accepts.length === 0 ? 'none' : def.accepts.join('|');
      report('quarantined-answer', path, { ...(def.calculated ? { detail: 'calculated' } : {}), expected, found: kinds(occurrence) });
      return;
    }
    decoded.answers.set(path, typed);
  };

  walk(stored, -1, null);
  return decoded;
}

/**
 * Stored siblings grouped by `linkId`, in the definition's document order;
 * `linkId`s it does not have come last, in stored order. Occurrences of one
 * `linkId` keep their stored order, which is the instances' order.
 */
function inDocumentOrder(definition: Definition, items: readonly StoredItem[]): [string, StoredItem[]][] {
  const groups = new Map<string, StoredItem[]>();
  for (const item of items) {
    const list = groups.get(item.linkId);
    if (list === undefined) groups.set(item.linkId, [item]);
    else list.push(item);
  }
  const rank = (linkId: string): number => definition.byLinkId.get(linkId) ?? Number.MAX_SAFE_INTEGER;
  return [...groups].sort(([a], [b]) => rank(a) - rank(b));
}

/** The distinct kinds an item's stored answers have, as the diagnostic's `found`. */
function kinds(item: StoredItem): string {
  return [...new Set(item.answers.map((answer) => answer.found))].join('|');
}
