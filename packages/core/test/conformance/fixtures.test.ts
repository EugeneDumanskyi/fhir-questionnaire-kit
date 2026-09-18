import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { COMPARABLE } from '../../src/definition/checks.js';
import {
  createSession,
  emitResponse,
  FhirqError,
  type Command,
  type Diagnostic,
  type HostIdentity,
  type Issue,
  type LoadMode,
  type Questionnaire,
  type QuestionnaireResponse,
  type RetentionPolicy,
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
        it(`${behaviour}: ${testCase.name}`, () => {
          const options = {
            loadMode: testCase.loadMode,
            ...(testCase.retention === undefined ? {} : { retention: testCase.retention }),
            ...(testCase.hostIdentity === undefined ? {} : { hostIdentity: testCase.hostIdentity }),
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
          const enabled = () => session.getSnapshot().nodes.map((node) => node.path);
          expect(shaped(session.diagnostics, testCase.diagnostics ?? [])).toEqual(testCase.diagnostics ?? []);
          if (testCase.enabled !== undefined) expect(enabled()).toEqual(testCase.enabled);
          for (const step of testCase.steps ?? []) {
            expect(session.dispatch(step.command), step.name).toEqual(step.result);
            expect(enabled(), step.name).toEqual(step.enabled);
          }
          for (const [path, answers] of Object.entries(testCase.answers ?? {})) {
            expect(session.getSnapshot().nodes.find((node) => node.path === path)?.answers, path).toEqual(answers);
          }
          if (testCase.issues !== undefined) expect(shaped(session.getSnapshot().issues, testCase.issues)).toEqual(testCase.issues);
          if (testCase.response !== undefined) {
            expect(emitResponse(session, { authored: AUTHORED })).toEqual(read<QuestionnaireResponse>(behaviour, testCase.response));
          }
        });
      }
    });
  }
});
