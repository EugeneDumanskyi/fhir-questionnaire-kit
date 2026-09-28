import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { docs, region, run, snippets } from '../docs-snippets.mjs';

const fixtures = fileURLToPath(new URL('./fixtures/snippets/', import.meta.url));
const text = (name) => readFileSync(`${fixtures}${name}`, 'utf8');
const read = (path) => {
  try {
    return text(path);
  } catch {
    return null;
  }
};

describe('the docs snippet check (NFR-Q-08, M10 plan step 3)', () => {
  it('takes a region without its markers, nested ones included, dedented; or the whole file', () => {
    expect(region(text('source.txt'), 'top')).toEqual(["import { a } from 'a';"]);
    expect(region(text('source.txt'), 'nested')).toEqual(['const x = 1;', 'const y = 2;', '', 'return x + y;']);
    expect(region(text('page.txt'), 'embed')).toEqual(['<script src="kit.js"></script>']);
    expect(region(text('page.txt'))).toEqual(['<main>', '  <script src="kit.js"></script>', '</main>']);
    expect(region(text('source.txt'), 'absent')).toBeNull();
    expect(region(text('source.txt'), 'open')).toBeNull();
  });

  it('passes snippets in step, signatures, and blocks that are not runnable, and changes nothing', () => {
    const markdown = text('passing.md');

    expect(snippets(markdown, read)).toEqual({ output: markdown, failures: [] });
  });

  it('fails the fixture that must fail, naming each line and reason', () => {
    expect(snippets(text('failing.md'), read).failures).toEqual([
      { line: 3, reason: 'a ts block is neither a snippet nor marked <!-- signature -->' },
      { line: 7, reason: 'a HTML block is neither a snippet nor marked <!-- signature -->' },
      { line: 12, reason: 'snippet source.txt#top is stale: run node scripts/docs-snippets.mjs --write' },
      { line: 17, reason: 'snippet gone.txt#top: gone.txt does not exist' },
      { line: 21, reason: 'snippet source.txt#absent: no region "absent" in source.txt, or it is never closed' },
      { line: 25, reason: 'snippet source.txt#open: no region "open" in source.txt, or it is never closed' },
      { line: 28, reason: 'a snippet comment needs a fenced block on the next line' },
      { line: 32, reason: 'a tsx block is neither a snippet nor marked <!-- signature -->' },
      { line: 36, reason: 'a fenced block is never closed' },
    ]);
  });

  it('rewrites a stale snippet from its source, and leaves the rest of the file as it was', () => {
    const stale = text('passing.md').replace("import { a } from 'a';", "import { old } from 'old';");
    const { output, failures } = snippets(stale, read);

    expect(failures).toEqual([{ line: 6, reason: 'snippet source.txt#top is stale: run node scripts/docs-snippets.mjs --write' }]);
    expect(output).toBe(text('passing.md'));
    expect(snippets(output, read).failures).toEqual([]);
  });

  it("checks the docs the site publishes: the API reference, every ADR and each example's README", () => {
    const files = docs();

    expect(files).toEqual(expect.arrayContaining(['docs/07-api.md', 'docs/adr/0017-fhirpath-excluded-evaluator-seam.md', 'examples/react-quickstart/README.md']));
    expect(files).not.toContain('docs/00-idea.md');
  });

  it('finds every snippet in the docs in step, and no unmarked runnable block', () => {
    expect(run(docs())).toEqual({ failures: [], stale: [] });
  });
});
