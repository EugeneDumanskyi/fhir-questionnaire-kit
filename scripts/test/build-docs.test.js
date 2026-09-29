import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MATRIX as PLAYGROUND_MATRIX } from '../../apps/playground/src/rows.ts';
import { CSP as PLAYGROUND_CSP } from '../../apps/playground/vite/plugins.ts';
import { CSP, pages, refused, relative, render, REPO, resolve, slug, testLink } from '../build-docs.mjs';
import { docs } from '../docs-snippets.mjs';

const base = fileURLToPath(new URL('../../', import.meta.url));
const commit = '0123456789abcdef0123456789abcdef01234567';
const matrix = JSON.parse(readFileSync(new URL('../../docs/conformance/matrix.json', import.meta.url), 'utf8'));
const site = render({ base, commit });
const html = (output) => site.pages.find((page) => page.output === output)?.html ?? '';

describe('the docs site build (ADR-0019, M10 plan D1 and D9)', () => {
  it('publishes the pages plan D9 names, and only those: design docs 01–06 stay on GitHub', () => {
    const outputs = site.pages.map((page) => page.output);
    expect(outputs).toEqual(expect.arrayContaining(['index.html', 'api.html', 'accessibility.html', 'conformance.html', 'adr/index.html', 'adr/0019-static-client-only-playground-and-docs.html']));
    expect(outputs.filter((output) => output.startsWith('adr/'))).toHaveLength(25);
    for (const source of pages(base).map((page) => page.source)) expect(source, source).not.toMatch(/^docs\/0[1-6]-/);
  });

  it('checks every published Markdown page with the docs snippet check, so its code is compiled and run (NFR-Q-08)', () => {
    const checked = docs(base);
    for (const { source } of pages(base).filter((page) => page.source.endsWith('.md'))) expect(checked, source).toContain(source);
  });

  it("opens every page's <head> with ADR-0019's policy, the playground's own, and carries no script or inline style", () => {
    expect(CSP).toBe(PLAYGROUND_CSP);
    for (const { output, html: text } of site.pages) {
      expect(refused(text), output).toBeNull();
      expect(text, output).toContain(`<link rel="stylesheet" href="${relative(output, 'style.css')}">`);
    }
  });

  it('refuses a page with a script, a style, a style attribute, a handler, or the policy anywhere but first', () => {
    const page = (head, body = '') => `<!doctype html>\n<html lang="en">\n<head>\n${head}\n</head><body>${body}</body></html>`;
    const policy = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
    expect(refused(page(policy))).toBeNull();
    expect(refused(page(`<meta charset="utf-8">\n${policy}`))).toBe('the policy is not the first element of <head>');
    expect(refused(page(policy, '<script src="a.js"></script>'))).toBe('it has a <script>');
    expect(refused(page(policy, '<style>p{}</style>'))).toBe('it has a <style>');
    expect(refused(page(policy, '<p style="color: red">'))).toBe('it has a style attribute');
    expect(refused(page(policy, '<img src="a.png" onerror="x()">'))).toBe('it has an event handler attribute');
  });

  it("gives headings GitHub's anchors, and a repeated heading a numbered one", () => {
    expect(slug('4.1 Module import rules')).toBe('41-module-import-rules');
    expect(slug('ADR-0019 — Playground and docs are static')).toBe('adr-0019--playground-and-docs-are-static');
    expect(slug('`session/` reads, `view/` renders')).toBe('session-reads-view-renders');
    const adr = html('adr/0019-static-client-only-playground-and-docs.html');
    expect(adr).toContain('<h2 id="consequences">');
    expect(adr).toContain('<strong>Costs accepted</strong>');
  });

  it('links a published page to its HTML, and anything else in the repository to GitHub at the built commit', () => {
    const published = new Map([
      ['docs/07-api.md', 'api.html'],
      ['docs/adr/README.md', 'adr/index.html'],
      ['docs/adr/0019-x.md', 'adr/0019-x.html'],
    ]);
    const from = { source: 'docs/adr/0018-y.md', output: 'adr/0018-y.html', published, commit, base };
    expect(resolve('0019-x.md#decision', from)).toBe('0019-x.html#decision');
    expect(resolve('../07-api.md', from)).toBe('../api.html');
    expect(resolve('./', from)).toBe('index.html');
    expect(resolve('../05-architecture.md#41-module-import-rules', from)).toBe(`${REPO}/blob/${commit}/docs/05-architecture.md#41-module-import-rules`);
    expect(resolve('../../packages/core', from)).toBe(`${REPO}/tree/${commit}/packages/core`);
    expect(resolve('/scripts/budgets.json', from)).toBe(`${REPO}/blob/${commit}/scripts/budgets.json`);
    expect(resolve('https://hl7.org/fhir/R4/', from)).toBe('https://hl7.org/fhir/R4/');
    expect(resolve('#context', from)).toBe('#context');
  });

  it('renders every matrix row with its status and reason, each test linked to GitHub at the built commit (AC-13.4.1)', () => {
    const page = html('conformance.html');
    for (const row of matrix.rows) {
      expect(page, row.id).toContain(`<tr id="${row.id}">`);
      for (const link of row.tests) expect(page, link).toContain(`href="${testLink(link, { commit, base }).href}"`);
    }
    expect(page).toContain(`<caption>${matrix.rows.length} rows</caption>`);
  });

  it("links a fixture case to its scenario, and any other test to its title's line", () => {
    expect(testLink('packages/core/test/conformance/fixtures.test.ts > enablewhen-boolean: operators on boolean', { commit, base })).toEqual({
      text: 'enablewhen-boolean: operators on boolean',
      href: `${REPO}/blob/${commit}/fixtures/enablewhen-boolean/scenario.json`,
    });
    const link = matrix.rows.flatMap((row) => row.tests).find((candidate) => !candidate.startsWith('packages/core/test/conformance/'));
    const [file, ...names] = link.split(' > ');
    const { href } = testLink(link, { commit, base });
    const line = Number(/#L(\d+)$/.exec(href)?.[1]);
    expect(href.startsWith(`${REPO}/blob/${commit}/${file}#L`)).toBe(true);
    expect(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').split('\n')[line - 1]).toContain(names.at(-1));
  });

  it("publishes the pages the playground links to from under playground/ (M9 plan D5)", () => {
    const outputs = site.pages.map((page) => page.output);
    const policy = /const POLICY = '([^']+)'/.exec(readFileSync(new URL('../../apps/playground/src/app.tsx', import.meta.url), 'utf8'))?.[1] ?? '';
    for (const link of [PLAYGROUND_MATRIX, policy]) expect(outputs, link).toContain(posix.join('playground', link));
  });

  it('names the commit it was built from on every page', () => {
    for (const { output, html: text } of site.pages) expect(text, output).toContain(`<a href="${REPO}/tree/${commit}"><code>0123456</code></a>`);
  });
});
