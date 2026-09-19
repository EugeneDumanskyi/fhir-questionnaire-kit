import { diagnostic } from '../kernel/diagnostic.js';
import type { Definition } from '../definition/compile.js';
import { shared, type Collaborate, type VisibleProjection } from '../session/projection.js';

/**
 * Scoring functions (US-07.2, ADR-0006, M4 plan D5), run with the rules in
 * cycle step 5. A scorer names the items it reads by `linkId`, which decides
 * when it re-runs (ADR-0009): when the visible nodes of those items, or their
 * answers, changed. It receives the whole visible projection, frozen, so a
 * hidden item's retained answer never reaches it (AC-07.2.2, INV-X-04).
 *
 * Its result is opaque: stored and exposed, never interpreted (INV-X-05). A
 * scorer that throws has its result cleared to `null`, never left stale, and
 * the others still run.
 */
export interface Scorer {
  readonly name: string;
  readonly inputs: ReadonlySet<string>;
  readonly score: (projection: Pick<VisibleProjection, 'status' | 'nodes'>) => unknown;
}

/** `null` when the option cannot be read: not a record of `{ inputs, score }` over known `linkId`s. */
export function compileScorers(definition: Definition, scorers: unknown): Scorer[] | null {
  if (scorers === undefined) return [];
  if (typeof scorers !== 'object' || scorers === null) return null;
  const compiled: Scorer[] = [];
  for (const [name, candidate] of Object.entries(scorers)) {
    const { inputs, score } = (typeof candidate === 'object' && candidate !== null ? candidate : {}) as Partial<Record<'inputs' | 'score', unknown>>;
    const known = Array.isArray(inputs) && inputs.length > 0 && inputs.every((linkId) => typeof linkId === 'string' && definition.byLinkId.has(linkId));
    if (!known || typeof score !== 'function') return null;
    compiled.push({ name, inputs: new Set(inputs as string[]), score: score as Scorer['score'] });
  }
  return compiled;
}

/**
 * A session's scoring step. Each scorer re-runs only when what its inputs show
 * changed — the visible nodes of those items and their answers, compared by
 * reference, since answers are frozen and replaced, never edited — and the
 * record keeps its identity while no score changed.
 */
export function scoring(scorers: readonly Scorer[]): (projection: VisibleProjection, call: Collaborate) => Readonly<Record<string, unknown>> {
  const seen = new Map<Scorer, unknown[]>();
  let scores: Readonly<Record<string, unknown>> = {};
  return (projection, call) => {
    let given: ReturnType<typeof shared> | undefined;
    const next: Record<string, unknown> = {};
    for (const scorer of scorers) {
      const { name, inputs, score } = scorer;
      const read = projection.nodes.flatMap((node) => (inputs.has(node.item.linkId) ? [node.path, node.answers] : []));
      const before = seen.get(scorer);
      seen.set(scorer, read);
      next[name] =
        before?.length === read.length && read.every((entry, at) => entry === before[at])
          ? scores[name]
          : (call(diagnostic('scorer-threw', 'warning', null, { detail: name }), () => score((given ??= shared(projection))))?.value ?? null);
    }
    if (scorers.some(({ name }) => !Object.is(next[name], scores[name]))) scores = next;
    return scores;
  };
}
