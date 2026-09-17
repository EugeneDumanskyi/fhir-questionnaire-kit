import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { COMPARABLE } from '../../src/definition/checks.js';
import { createSession, FhirqError, type Command, type Diagnostic, type LoadMode, type Questionnaire, type RetentionPolicy } from '../../src/index.js';

/**
 * The conformance runner (M2 plan D6): every `fixtures/<behaviour>/` with a
 * `scenario.json` is loaded through the public entry point, as a host would,
 * and its cases replayed. Test names are `<behaviour>: <case>`, which is what
 * `docs/conformance/matrix.json` rows link to.
 *
 * Findings are compared on the fields a fixture names (`code` and `path`
 * always; `related`, `detail` and `severity` where given), never on values: fixtures
 * assert codes and paths (`fixtures/README.md`).
 */

type Expected = Partial<Pick<Diagnostic, 'code' | 'path' | 'related' | 'detail' | 'severity'>>;

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
  readonly rejected?: readonly Expected[];
  readonly diagnostics?: readonly Expected[];
  readonly enabled?: readonly string[];
  readonly steps?: readonly Step[];
  readonly answers?: Readonly<Record<string, readonly unknown[]>>;
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
const shaped = (findings: readonly Diagnostic[], expected: readonly Expected[]) =>
  findings.map((finding, index) => {
    const keys = Object.keys(expected[index] ?? { code: 0, path: 0 }) as (keyof Expected)[];
    return Object.fromEntries(keys.map((key) => [key, finding[key]]));
  });

describe('conformance fixtures (M2 plan D6)', () => {
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
          const options = { loadMode: testCase.loadMode, ...(testCase.retention === undefined ? {} : { retention: testCase.retention }) };
          if (testCase.rejected !== undefined) {
            let thrown: unknown;
            try {
              createSession(questionnaire, options);
            } catch (error) {
              thrown = error;
            }
            expect(thrown).toBeInstanceOf(FhirqError);
            expect((thrown as FhirqError).code).toBe('definition-rejected');
            expect(shaped((thrown as FhirqError).findings, testCase.rejected)).toEqual(testCase.rejected);
            return;
          }

          const session = createSession(questionnaire, options);
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
        });
      }
    });
  }
});
