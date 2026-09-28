import { readFileSync } from 'node:fs';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { decode, encode, LIMIT, link, type Shared } from '../src/link.js';

/** Share links' codec (M9 step 12, plan D7, AC-12.5.1): the fragment only, round-tripped, and refused rather than cut short. */

const demo = readFileSync(new URL('../../../fixtures/demo/questionnaire.json', import.meta.url), 'utf8');
const PAGE = 'https://example.org/fhir-questionnaire-kit/playground/';

const shared: Shared = { text: demo, mode: 'lenient', tier: 3, scheme: 'dark' };

/** A questionnaire that compresses badly: every item's text is different noise. */
function incompressible(items: number): string {
  let seed = 1;
  const noise = () => Array.from({ length: 40 }, () => String.fromCharCode(33 + ((seed = (seed * 48271) % 2147483647) % 90))).join('');
  return JSON.stringify({ resourceType: 'Questionnaire', status: 'active', item: Array.from({ length: items }, (_, i) => ({ linkId: `q${i}`, text: noise(), type: 'string' })) });
}

/** A fragment for a payload of our choosing, deflated as the codec does, to reach its checks past the inflate. */
async function fragmentOf(payload: string): Promise<string> {
  const stream = new Blob([new TextEncoder().encode(payload)]).stream().pipeThrough(new CompressionStream('deflate'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return `v1.${Buffer.from(bytes).toString('base64url')}`;
}

describe('encode and decode', () => {
  it('round-trips the demo, with its mode, tier and scheme', async () => {
    expect(await decode(await encode(shared))).toEqual(shared);
  });

  it('round-trips any text, mode, tier and scheme', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          text: fc.string({ unit: 'grapheme', maxLength: 200 }),
          mode: fc.constantFrom('strict' as const, 'lenient' as const),
          tier: fc.constantFrom(1 as const, 2 as const, 3 as const, 4 as const),
          scheme: fc.constantFrom('system' as const, 'light' as const, 'dark' as const),
        }),
        async (state) => {
          expect(await decode(await encode(state))).toEqual(state);
        },
      ),
    );
  });

  it('writes only characters a fragment carries as they are, and not the text in the clear', async () => {
    const fragment = await encode({ ...shared, text: '{"item":[{"text":"Something private"}]}' });
    expect(fragment).toMatch(/^v1\.[\w-]+$/);
    expect(fragment).not.toContain('private');
  });

  it('keeps the text as typed, whitespace and all', async () => {
    const text = '{\n  "resourceType" : "Questionnaire"\n}\n';
    expect((await decode(await encode({ ...shared, text })))?.text).toBe(text);
  });

  it('reads nothing it did not make', async () => {
    const good = await encode(shared);
    const refused = [
      '',
      'v2.' + good.slice(3),
      good.slice(3),
      good + '=',
      good.slice(0, -1) + '!',
      good.slice(0, good.length >> 1),
      'v1.' + 'A'.repeat(LIMIT),
      await fragmentOf('not json'),
      await fragmentOf('null'),
      await fragmentOf('[]'),
      await fragmentOf(JSON.stringify({ q: 1, m: 'strict', t: 1, s: 'system' })),
      await fragmentOf(JSON.stringify({ q: '', m: 'loose', t: 1, s: 'system' })),
      await fragmentOf(JSON.stringify({ q: '', m: 'strict', t: 5, s: 'system' })),
      await fragmentOf(JSON.stringify({ q: '', m: 'strict', t: '1', s: 'system' })),
      await fragmentOf(JSON.stringify({ q: '', m: 'strict', t: 1, s: 'sepia' })),
      await fragmentOf(JSON.stringify({ q: '', m: 'strict', t: 1 })),
    ];
    for (const fragment of refused) expect(await decode(fragment), fragment.slice(0, 40)).toBeNull();
    expect(await decode(await fragmentOf(JSON.stringify({ q: '', m: 'strict', t: 1, s: 'system' })))).toEqual({ text: '', mode: 'strict', tier: 1, scheme: 'system' });
  });

  it('refuses bytes that are not UTF-8', async () => {
    const stream = new Blob([new Uint8Array([0xff, 0xfe, 0xfd])]).stream().pipeThrough(new CompressionStream('deflate'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    expect(await decode(`v1.${Buffer.from(bytes).toString('base64url')}`)).toBeNull();
  });
});

describe('link', () => {
  it('puts the state after the page, in the fragment only, and replaces any fragment there was', async () => {
    const made = await link(`${PAGE}#v1.old`, shared);
    expect(made.kind).toBe('link');
    if (made.kind !== 'link') return;
    const url = new URL(made.url);
    expect(`${url.origin}${url.pathname}${url.search}`).toBe(PAGE);
    expect(await decode(url.hash.slice(1))).toEqual(shared);
    expect(made.url.length).toBeLessThanOrEqual(LIMIT);
  });

  it('refuses a link over the limit and says how long it would have been, never cutting it short', async () => {
    const text = incompressible(200);
    const made = await link(PAGE, { ...shared, text });
    expect(made).toEqual({ kind: 'too-long', length: PAGE.length + 1 + (await encode({ ...shared, text })).length });
    expect(made.kind === 'too-long' && made.length).toBeGreaterThan(LIMIT);
  });

  it('makes a link right up to the limit', async () => {
    let items = 1;
    while ((await link(PAGE, { ...shared, text: incompressible(items + 1) })).kind === 'link') items += 1;
    const longest = await link(PAGE, { ...shared, text: incompressible(items) });
    expect(longest.kind).toBe('link');
    expect(longest.kind === 'link' && longest.url.length).toBeGreaterThan(LIMIT - 200);
  });
});
