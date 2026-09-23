import { readFileSync } from 'node:fs';

import { bench, describe } from 'vitest';

import { createSession, type Questionnaire } from '../src/index.js';
import { createView, type ViewNode } from '../src/view/index.js';

/**
 * NFR-P-03's engine-and-view share of a keystroke (M5 plan, report only): one
 * character typed into a text question of the 500-item fixture, through the
 * view's command and the next model, which is what a renderer reads. Named
 * under `reference:` so `scripts/bench-compare.mjs` reports it and never
 * gates on it; the keystroke-to-paint figure is M6's (AC-10).
 */

const questionnaire = JSON.parse(readFileSync(new URL('../../../fixtures/bench/large-500.json', import.meta.url), 'utf8')) as Questionnaire;

const OPTIONS = { time: 400, warmupTime: 100 } as const;

/** The first text entry node in document order. */
function firstText(nodes: readonly ViewNode[]): ViewNode | undefined {
  for (const node of nodes) {
    if (node.control === 'short-text' || node.control === 'long-text') return node;
    const inner = node.control === 'group' ? firstText(node.children) : node.control === 'repeating-group' ? firstText(node.instances.flatMap((instance) => instance.children)) : undefined;
    if (inner !== undefined) return inner;
  }
  return undefined;
}

describe('reference: NFR-P-03 one keystroke through the view', () => {
  const view = createView(createSession(questionnaire), { idPrefix: 'b', locale: 'en' });
  const node = firstText(view.getSnapshot().nodes);
  if (node === undefined || !('setAt' in node)) throw new Error('large-500 has no text question');
  let text = '';
  bench(
    'large-500',
    () => {
      text = text.length > 20 ? 'a' : `${text}a`;
      node.set(text);
      view.getSnapshot();
    },
    OPTIONS,
  );
});
