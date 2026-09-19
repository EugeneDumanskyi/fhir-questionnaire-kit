import { copyAnswer, isCoding, type Coding } from '../kernel/answer.js';
import { diagnostic, type Diagnostic } from '../kernel/diagnostic.js';
import type { Definition } from '../definition/compile.js';
import type { Collaborators } from './collaborator.js';

/**
 * SM-04, option resolution (ADR-0005, ADR-0012): one option set per distinct
 * value set canonical per session, keyed by the canonical verbatim, so
 * `url|1` and `url|2` are two (M4 plan D6).
 *
 * Every set starts resolving as the session enters `in-progress`, whether or
 * not any item that uses it is enabled, so the resolver's calls depend on the
 * questionnaire and never on the answers. The resolver is called once per
 * set, and again only on `RetryOptions` from `failed` (INV-X-01). A
 * settlement is its own cycle (T12), which the session runs, and drops once
 * disposed; disposing aborts the signal. With no resolver, every set is
 * `unresolved` and each item that uses one reports it (INV-D-08). Option sets
 * are never in a snapshot: a restored session starts them again.
 */

export type OptionStatus = 'pending' | 'resolved' | 'failed' | 'unresolved';

export interface OptionSet {
  readonly status: OptionStatus;
  /** The resolved options, in the resolver's order; empty in any other state. */
  readonly options: readonly Coding[];
}

export interface OptionSets {
  /** Every set by canonical: a new object whenever one changes. */
  readonly sets: () => Readonly<Record<string, OptionSet>>;
  /** `RetryOptions` for a set the guard found `failed`. */
  readonly retry: (valueSet: string) => void;
  readonly dispose: () => void;
}

const NO_OPTIONS: readonly Coding[] = [];

/**
 * `settle` runs a settlement's change as a cycle of its own. The resolver runs
 * through the guard, so a command it sends synchronously is refused, and a
 * synchronous throw fails the set at once.
 */
export function optionSets(
  definition: Definition,
  resolver: unknown,
  guard: Collaborators,
  report: (finding: Diagnostic) => void,
  settle: (apply: () => void) => void,
): OptionSets {
  let sets: Readonly<Record<string, OptionSet>> = {};
  const write = (valueSet: string, status: OptionStatus, options = NO_OPTIONS): void => {
    sets = Object.freeze({ ...sets, [valueSet]: Object.freeze({ status, options }) });
  };
  const resolves = typeof resolver === 'function';
  const controller = resolves ? new (globalThis as unknown as { AbortController: new () => { readonly signal: AbortSignal; abort(): void } }).AbortController() : null;

  const resolve = (valueSet: string): void => {
    if (controller === null) return write(valueSet, 'unresolved');
    const finding = diagnostic('resolver-failed', 'warning', null, { detail: valueSet });
    const fail = (error: unknown): void => {
      write(valueSet, 'failed');
      guard.fail(error, finding, true);
    };
    write(valueSet, 'pending');
    const call = guard.call(finding, () => (resolver as (valueSet: string, context: object) => unknown)(valueSet, { signal: controller.signal }), true);
    if (call === null) return write(valueSet, 'failed');
    Promise.resolve(call.value).then(
      (list: unknown) =>
        settle(() => {
          // A fulfilment that is not a list of codings with codes fails the set, and reaches the host as it came.
          if (!Array.isArray(list) || !list.every((option) => isCoding(option) && typeof option.code === 'string')) return fail(list);
          write(valueSet, 'resolved', Object.freeze((list as readonly Coding[]).map((value) => copyAnswer({ kind: 'coding', value }).value as Coding)));
        }),
      (error: unknown) => settle(() => fail(error)),
    );
  };

  for (const { valueSet, path } of definition.items) {
    if (valueSet === null) continue;
    if (!Object.hasOwn(sets, valueSet)) resolve(valueSet);
    if (!resolves) report(diagnostic('unresolved-options', 'warning', path, { detail: valueSet }));
  }
  return { sets: () => sets, retry: resolve, dispose: () => controller?.abort() };
}
