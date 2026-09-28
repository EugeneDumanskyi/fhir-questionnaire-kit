import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * The switcher's stylesheets copy values from elsewhere (M9 step 9, plan D8):
 * the forced schemes are the preset's own light and dark colours, and tier 2's
 * design system is `examples/themed-host`'s. These hold them to their sources.
 */

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

/** A stylesheet before its `prefers-color-scheme` block, and inside it. */
const split = (css: string) => [css.slice(0, css.indexOf('@media')), css.slice(css.indexOf('@media'))] as const;

/** The custom properties declared in each block whose selector matches, in order, as `name: value`. */
function declarations(css: string, selector: RegExp): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, head = '', body = ''] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selector.test(head.trim())) continue;
    for (const [, name = '', value = ''] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) found[name] = value.trim();
  }
  return found;
}

describe('the forced schemes', () => {
  const preset = read('packages/themes/src/default.css');
  const scheme = read('apps/playground/src/tiers/scheme.css');
  const [before, inside] = split(preset);
  const light = declarations(before, /^:root,\s*:host$/);
  const dark = declarations(inside, /^:root,\s*:host$/);

  it('are the preset colours, light and dark, and every one of them', () => {
    const colours = (tokens: Record<string, string>) => Object.fromEntries(Object.entries(tokens).filter(([name]) => name.startsWith('--fhirq-color-')));
    expect(Object.keys(colours(dark))).toHaveLength(8);
    expect(declarations(scheme, /data-scheme='light'/)).toEqual(colours(light));
    expect(declarations(scheme, /data-scheme='dark'/)).toEqual(dark);
  });
});

describe("tier 2's design system", () => {
  const source = read('examples/themed-host/design-system.css');
  const tier2 = read('apps/playground/src/tiers/tier2.css');

  it("is examples/themed-host's, light and dark", () => {
    const [before, inside] = split(source);
    const dark = declarations(inside, /^:root$/);
    expect(Object.keys(dark)).toHaveLength(7);
    expect(declarations(tier2, /^\.intake$/)).toEqual(declarations(before, /^:root$/));
    expect(declarations(tier2, /data-scheme='light'\]\) \.intake$/)).toEqual(dark);
    expect(declarations(tier2, /^:root\[data-scheme='dark'\] \.intake$/)).toEqual(dark);
  });
});
