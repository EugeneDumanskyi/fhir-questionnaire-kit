import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** WCAG 2.0, 2.1 and 2.2 at A and AA (NFR-A-01). */
export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

/**
 * Runs axe over the page and returns each violation as its rule and targets.
 * Not vacuous: it fails unless the form's own controls were among what axe
 * checked.
 */
export async function audit(page: Page): Promise<{ id: string; targets: unknown[] }[]> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const checked = results.passes.flatMap(({ nodes }) => nodes.map((node) => JSON.stringify(node.target)));
  expect(checked.some((target) => target.includes('fhirq-'))).toBe(true);
  return results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }));
}
