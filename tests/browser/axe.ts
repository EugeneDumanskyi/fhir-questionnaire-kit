import { mkdirSync, writeFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** WCAG 2.0, 2.1 and 2.2 at A and AA (NFR-A-01). */
export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

/** Where each run of M8's matrix leaves its result, for `scripts/a11y-report.mjs`. */
export const RUNS = new URL('../../reports/a11y/runs/', import.meta.url);

type Violation = { id: string; impact: string | null; help: string; targets: unknown[] };

async function analyze(page: Page, mark: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const checked = results.passes.flatMap(({ nodes }) => nodes.map((node) => JSON.stringify(node.target)));
  expect(checked.some((target) => target.includes(mark))).toBe(true);
  return results;
}

/**
 * Runs axe over the page and returns each violation as its rule and targets.
 * Not vacuous: it fails unless the form's own controls were among what axe
 * checked, found by `mark` in axe's selector for them: the kit's class stem,
 * or for a headless host, whose markup is its own, the view's control ids.
 */
export async function audit(page: Page, mark = 'fhirq-'): Promise<{ id: string; targets: unknown[] }[]> {
  const results = await analyze(page, mark);
  return results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }));
}

/**
 * `audit`, recorded: writes the run's cell, axe's version and its counts of
 * rules passed, failed and left for review to `RUNS`, named by `name`, and
 * returns the violations with their impact and help text.
 */
export async function recordedAudit(page: Page, name: string, cell: Readonly<Record<string, string | number>>, mark = 'fhirq-'): Promise<Violation[]> {
  const results = await analyze(page, mark);
  const violations = results.violations.map(({ id, impact, help, nodes }) => ({ id, impact: impact ?? null, help, targets: nodes.map((node) => node.target) }));
  mkdirSync(RUNS, { recursive: true });
  writeFileSync(
    new URL(`${name}.json`, RUNS),
    `${JSON.stringify({ name, cell, axe: results.testEngine.version, passes: results.passes.length, incomplete: results.incomplete.length, violations }, null, 2)}\n`,
  );
  return violations;
}
