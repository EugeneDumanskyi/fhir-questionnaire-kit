/**
 * NFR-P-08: peak engine heap for a 1,000-item session with 50 repeat
 * instances. Run by `bench-run.mjs` as
 *
 *   node --expose-gc scripts/bench-heap.mjs <bundled core> <fixture>
 *
 * and prints `{ "heapBytes": n }`: the heap still held after a forced
 * collection, with the session alive, less the heap before it was created.
 * Retained size is the claim the budget makes, so garbage is collected first.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [bundle, fixture] = process.argv.slice(2);
if (typeof globalThis.gc !== 'function' || bundle === undefined || fixture === undefined) {
  console.error('usage: node --expose-gc scripts/bench-heap.mjs <bundle> <fixture>');
  process.exit(2);
}

const { createSession, itemPath } = await import(pathToFileURL(bundle).href);
const questionnaire = JSON.parse(readFileSync(fixture, 'utf8'));

globalThis.gc();
globalThis.gc();
const before = process.memoryUsage().heapUsed;

const session = createSession(questionnaire);
for (let i = 0; i < 49; i += 1) session.dispatch({ type: 'AddRepeatInstance', path: itemPath('visit') });
session.dispatch({ type: 'SetAnswer', path: itemPath('gate-0'), answers: [{ kind: 'boolean', value: true }] });

globalThis.gc();
globalThis.gc();
const after = process.memoryUsage().heapUsed;
if (session.getSnapshot().nodes.length === 0) process.exit(3);
console.log(JSON.stringify({ heapBytes: after - before }));
