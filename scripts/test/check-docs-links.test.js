import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { check, ids, links } from '../check-docs-links.mjs';

const fixture = (path) => fileURLToPath(new URL(`./fixtures/docs-links/${path}`, import.meta.url));
const base = fileURLToPath(new URL('../../', import.meta.url));

describe('the docs link checker (ADR-0019 Verification, M10 plan step 4)', () => {
  it('passes pages, anchors, directories, the playground mount and GitHub paths that exist', () => {
    const mounts = [
      ['', fixture('passing/site')],
      ['playground/', fixture('passing/playground')],
    ];
    expect(check({ mounts, base })).toEqual([]);
  });

  it('fails the fixture that must fail, once per broken link, naming the reason', () => {
    const mounts = [
      ['', fixture('failing/site')],
      ['playground/', fixture('failing/playground')],
    ];
    expect(check({ mounts, base }).map(({ link, reason }) => ({ link, reason }))).toEqual([
      { link: 'missing.css', reason: 'missing.css does not exist' },
      { link: '', reason: 'empty link' },
      { link: '#bottom', reason: 'no id "bottom" in index.html' },
      { link: 'gone.html', reason: 'gone.html does not exist' },
      { link: 'index.html#nowhere', reason: 'no id "nowhere" in index.html' },
      { link: '../outside.html', reason: 'leaves the site' },
      { link: 'playground/', reason: `playground/ is not built (${fixture('failing/playground')})` },
      {
        link: 'https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/0123abc/packages/core/test/gone.test.ts#L9',
        reason: 'packages/core/test/gone.test.ts is not in the repository',
      },
    ]);
  });

  it('reads links and ids with their entities decoded', () => {
    const html = '<a href="a.html#x&amp;y">A</a><img src="i.png" alt=""><h2 id="x&amp;y">X</h2>';
    expect(links(html)).toEqual(['a.html#x&y', 'i.png']);
    expect([...ids(html)]).toEqual(['x&y']);
  });
});
