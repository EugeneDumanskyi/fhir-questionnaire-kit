import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { COMPARABLE } from '../../src/definition/checks.js';
import {
  createSession,
  emitResponse,
  FhirqError,
  type Answer,
  type Command,
  type Diagnostic,
  type HostIdentity,
  type Issue,
  type LoadMode,
  type OptionResolver,
  type Questionnaire,
  type QuestionnaireResponse,
  type RetentionPolicy,
  type Session,
  type SessionOptions,
  type VisibleProjection,
} from '../../src/index.js';
import { hydrateSession } from '../../src/resume.js';

/**
 * The conformance runner (M2 plan D6): every `fixtures/<behaviour>/` with a
 * `scenario.json` is loaded through the public entry point, as a host would,
 * and its cases replayed. Test names are `<behaviour>: <case>`, which is what
 * `docs/conformance/matrix.json` rows link to.
 *
 * Findings are compared on the fields a fixture names (`code` and `path`
 * always; `related`, `detail`, `severity`, `expected` and `found` where
 * given), never on values: fixtures assert codes and paths (`fixtures/README.md`).
 *
 * From M3 a case may start from a stored response (`hydrate`), name the
 * issues it ends with, and name a file holding the response it must emit at
 * the end, compared with `authored` fixed.
 *
 * From M4 a case may name the host's collaborators, as in-memory test doubles
 * this runner builds (`fixtures/README.md`): a resolver per value set, scorers
 * and an evaluator that add up the numbers they read. A resolution settles
 * before the first step; a step with `settle` lets the ones it started settle.
 */

type Expected = Partial<Pick<Diagnostic, 'code' | 'path' | 'related' | 'detail' | 'severity' | 'expected' | 'found'>>;
type ExpectedIssue = Partial<Pick<Issue, 'code' | 'path' | 'severity' | 'params'>>;

/** The `authored` every fixture's expected response carries. */
const AUTHORED = '2026-01-01T00:00:00Z';

interface Step {
  readonly name: string;
  readonly command: Command;
  readonly result: unknown;
  readonly enabled: readonly string[];
  /** Let the resolutions this command started settle before checking what is enabled. */
  readonly settle?: true;
}

/** Numbers the double adds up: the first answer of each named item that is visible, an integer or decimal. */
interface Sum {
  readonly sum: readonly string[];
}

interface Case {
  readonly name: string;
  readonly loadMode: LoadMode;
  readonly retention?: RetentionPolicy;
  readonly hostIdentity?: HostIdentity;
  /** A stored response in the fixture directory to hydrate from, instead of starting empty. */
  readonly hydrate?: string;
  readonly rejected?: readonly Expected[];
  readonly diagnostics?: readonly Expected[];
  readonly enabled?: readonly string[];
  readonly steps?: readonly Step[];
  readonly answers?: Readonly<Record<string, readonly unknown[]>>;
  /** The validation result at the end, in order, on the fields each names. */
  readonly issues?: readonly ExpectedIssue[];
  /** A file in the fixture directory holding the response the session emits at the end. */
  readonly response?: string;
  /** By value set canonical: fulfil with these codings, reject, or never settle. */
  readonly resolver?: Readonly<Record<string, { readonly resolve: Awaited<ReturnType<OptionResolver>> } | 'reject' | 'pending'>>;
  /** By name: a sum over `sum` (null until every one is answered), or one that throws. */
  readonly scorers?: Readonly<Record<string, { readonly inputs: readonly string[] } & (Sum | { readonly throws: true })>>;
  /** By calculated item `linkId`: a sum of that kind, or nothing until every input is answered. */
  readonly evaluator?: Readonly<Record<string, Sum & { readonly kind: 'integer' | 'decimal' }>>;
  /** Each option set's status at the end. */
  readonly optionSets?: Readonly<Record<string, string>>;
  /** Each score at the end. */
  readonly scores?: Readonly<Record<string, unknown>>;
}

interface Scenario {
  readonly behaviour: string;
  readonly cases: readonly Case[];
}

const root = new URL('../../../../fixtures/', import.meta.url);

export const behaviours = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(new URL(`${entry.name}/scenario.json`, root)))
  .map((entry) => entry.name)
  .sort();

const read = <T>(behaviour: string, file: string): T => JSON.parse(readFileSync(new URL(`${behaviour}/${file}`, root), 'utf8')) as T;

const flush = () => new Promise<void>((resolve) => void Promise.resolve().then(() => resolve()));

/** The numbers `sum` names, or `null` while any is unanswered or hidden. */
function add(projection: VisibleProjection, linkIds: readonly string[]): number | null {
  const values = linkIds.map((linkId) => projection.nodes.find((node) => node.item.linkId === linkId)?.answers[0]?.value);
  return values.every((value) => typeof value === 'number') ? values.reduce((sum, value) => sum + value, 0) : null;
}

/** The collaborators a case names, built as in-memory doubles. */
function collaborators(testCase: Case): SessionOptions {
  const { resolver, scorers, evaluator } = testCase;
  return {
    ...(resolver === undefined
      ? {}
      : {
          resolver: (valueSet: string) => {
            const plan = resolver[valueSet];
            if (plan === 'reject') return Promise.reject(new Error('fixture resolver rejects'));
            return plan === undefined || plan === 'pending' ? new Promise<never>(() => undefined) : Promise.resolve(plan.resolve);
          },
        }),
    ...(scorers === undefined
      ? {}
      : {
          scorers: Object.fromEntries(
            Object.entries(scorers).map(([name, scorer]) => [
              name,
              {
                inputs: scorer.inputs,
                score: (projection: VisibleProjection) => {
                  if ('throws' in scorer) throw new Error('fixture scorer throws');
                  return add(projection, scorer.sum);
                },
              },
            ]),
          ),
        }),
    ...(evaluator === undefined
      ? {}
      : {
          evaluator: {
            evaluate: (_: unknown, { path, projection }: { path: string; projection: VisibleProjection }): Answer | undefined => {
              const binding = evaluator[path.split('/').at(-1) ?? ''];
              const value = binding === undefined ? null : add(projection, binding.sum);
              return value === null || binding === undefined ? undefined : { kind: binding.kind, value };
            },
          },
        }),
  };
}

/** What a case names about the session at its end. */
function expectEnd(session: Session, behaviour: string, testCase: Case): void {
  if (testCase.optionSets !== undefined) {
    const statuses = Object.fromEntries(Object.entries(session.getSnapshot().optionSets).map(([valueSet, set]) => [valueSet, set.status]));
    expect(statuses).toEqual(testCase.optionSets);
  }
  if (testCase.scores !== undefined) expect(session.getSnapshot().scores).toEqual(testCase.scores);
  for (const [path, answers] of Object.entries(testCase.answers ?? {})) {
    expect(session.getSnapshot().nodes.find((node) => node.path === path)?.answers, path).toEqual(answers);
  }
  if (testCase.issues !== undefined) expect(shaped(session.getSnapshot().issues, testCase.issues)).toEqual(testCase.issues);
  if (testCase.response !== undefined) {
    expect(emitResponse(session, { authored: AUTHORED })).toEqual(read<QuestionnaireResponse>(behaviour, testCase.response));
  }
}

/** Each finding reduced to the fields its expectation names. */
const shaped = <T extends object>(findings: readonly T[], expected: readonly Partial<T>[]) =>
  findings.map((finding, index) => {
    const keys = Object.keys(expected[index] ?? { code: 0, path: 0 }) as (keyof T)[];
    return Object.fromEntries(keys.map((key) => [key, finding[key]]));
  });

describe('conformance fixtures (M2 plan D6)', () => {
  it('names only response files that exist, and uses every response file it has', () => {
    for (const behaviour of behaviours) {
      const named = read<Scenario>(behaviour, 'scenario.json').cases.flatMap((testCase) => [testCase.hydrate, testCase.response].filter((file) => file !== undefined));
      const present = readdirSync(new URL(`${behaviour}/`, root)).filter((file) => file.endsWith('.json') && file !== 'questionnaire.json' && file !== 'scenario.json');
      expect(new Set(named), behaviour).toEqual(new Set(present));
    }
  });

  it('finds the fixtures, each with a questionnaire, a scenario and a README', () => {
    expect(behaviours.length).toBeGreaterThanOrEqual(25);
    for (const behaviour of behaviours) {
      for (const file of ['questionnaire.json', 'scenario.json', 'README.md']) expect(existsSync(new URL(`${behaviour}/${file}`, root))).toBe(true);
    }
  });

  it('has an operator fixture for every type the engine compares, with exactly the operators it supports (NFR-Q-05)', () => {
    const compared = Object.entries(COMPARABLE).filter(([, comparable]) => comparable.operators.length > 0);
    expect(behaviours.filter((behaviour) => behaviour.startsWith('enablewhen-'))).toEqual(compared.map(([type]) => `enablewhen-${type}`).sort());
    for (const [type, comparable] of compared) {
      const { item } = read<{ item: { enableWhen?: { operator: string }[] }[] }>(`enablewhen-${type}`, 'questionnaire.json');
      const operators = item.flatMap((entry) => (entry.enableWhen ?? []).map((condition) => condition.operator));
      expect(operators, type).toEqual([...comparable.operators, 'exists']);
    }
  });

  for (const behaviour of behaviours) {
    const questionnaire = read<Questionnaire>(behaviour, 'questionnaire.json');
    const scenario = read<Scenario>(behaviour, 'scenario.json');

    describe(behaviour, () => {
      for (const testCase of scenario.cases) {
        it(`${behaviour}: ${testCase.name}`, async () => {
          const options = {
            loadMode: testCase.loadMode,
            ...(testCase.retention === undefined ? {} : { retention: testCase.retention }),
            ...(testCase.hostIdentity === undefined ? {} : { hostIdentity: testCase.hostIdentity }),
            ...collaborators(testCase),
          };
          const start = () =>
            testCase.hydrate === undefined
              ? createSession(questionnaire, options)
              : hydrateSession(questionnaire, read<QuestionnaireResponse>(behaviour, testCase.hydrate), options);
          if (testCase.rejected !== undefined) {
            let thrown: unknown;
            try {
              start();
            } catch (error) {
              thrown = error;
            }
            expect(thrown).toBeInstanceOf(FhirqError);
            expect((thrown as FhirqError).code).toBe('definition-rejected');
            expect(shaped((thrown as FhirqError).findings, testCase.rejected)).toEqual(testCase.rejected);
            return;
          }

          const session = start();
          await flush();
          const enabled = () => session.getSnapshot().nodes.map((node) => node.path);
          expect(shaped(session.diagnostics, testCase.diagnostics ?? [])).toEqual(testCase.diagnostics ?? []);
          if (testCase.enabled !== undefined) expect(enabled()).toEqual(testCase.enabled);
          for (const step of testCase.steps ?? []) {
            expect(session.dispatch(step.command), step.name).toEqual(step.result);
            if (step.settle) await flush();
            expect(enabled(), step.name).toEqual(step.enabled);
          }
          expectEnd(session, behaviour, testCase);
        });
      }
    });
  }
});
