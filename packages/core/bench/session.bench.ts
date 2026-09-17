import { readFileSync } from 'node:fs';

import { bench, describe } from 'vitest';

import { createSession, itemPath, type Questionnaire, type Session } from '../src/index.js';

/**
 * NFR-P-01 and NFR-P-02 on the committed fixtures (M2 plan D7), plus the
 * synthetic ceiling for reference. `scripts/bench-run.mjs` runs this file
 * five times and compares medians against `benchmarks/baseline.json`.
 */

const fixture = (name: string): Questionnaire =>
  JSON.parse(readFileSync(new URL(`../../../fixtures/bench/${name}.json`, import.meta.url), 'utf8')) as Questionnaire;

const yes = [{ kind: 'boolean', value: true }] as const;
const no = [{ kind: 'boolean', value: false }] as const;

/** A session with `chain-1` … `chain-5` answered yes, so toggling `chain-1` cascades five links. */
function chained(questionnaire: Questionnaire): Session {
  const session = createSession(questionnaire);
  for (let link = 1; link <= 5; link += 1) session.dispatch({ type: 'SetAnswer', path: itemPath(`chain-${link}`), answers: yes });
  return session;
}

const OPTIONS = { time: 400, warmupTime: 100 } as const;

for (const name of ['small-25', 'large-500']) {
  const questionnaire = fixture(name);

  describe(`NFR-P-01 create session`, () => {
    bench(name, () => void createSession(questionnaire), OPTIONS);
  });

  describe(`NFR-P-02 one answer, cascade depth 5`, () => {
    const session = chained(questionnaire);
    let on = true;
    bench(
      name,
      () => {
        on = !on;
        session.dispatch({ type: 'SetAnswer', path: itemPath('chain-1'), answers: on ? yes : no });
      },
      OPTIONS,
    );
  });
}

describe('reference: synthetic ceiling (not gated)', () => {
  const questionnaire = fixture('ceiling');
  bench('create, then 49 more instances', () => {
    const session = createSession(questionnaire);
    for (let i = 0; i < 49; i += 1) session.dispatch({ type: 'AddRepeatInstance', path: itemPath('visit') });
  }, OPTIONS);

  const session = createSession(questionnaire);
  for (let i = 0; i < 49; i += 1) session.dispatch({ type: 'AddRepeatInstance', path: itemPath('visit') });
  let on = false;
  bench('one gate answer at 50 instances', () => {
    on = !on;
    session.dispatch({ type: 'SetAnswer', path: itemPath('gate-0'), answers: on ? yes : no });
  }, OPTIONS);
});
