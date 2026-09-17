import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * ADR-0014's lint ban, proven the way the NFR-M-06 rules are: code that must
 * fail, linted as if it lived in packages/element/src with the repository's
 * own configuration. The element itself cannot run in this Node project; the
 * browser suite covers it.
 */
const eslint = new ESLint({ cwd: fileURLToPath(new URL('../../..', import.meta.url)) });
const filePath = fileURLToPath(new URL('../src/__lint-fixture__.ts', import.meta.url));

const styleViolations = async (code: string) => {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((message) => message.message.includes('ADR-0014')).length;
};

describe('the element may not style inline (ADR-0014, NFR-C-07)', () => {
  it.each([
    ["document.createElement('style');"],
    ["document.createElement('STYLE');"],
    ["declare const el: HTMLElement; el.setAttribute('style', 'color: red');"],
    ["declare const el: HTMLElement; el.setAttributeNS(null, 'style', 'color: red');"],
    ["declare const el: HTMLElement; el.toggleAttribute('style');"],
    ["declare const el: HTMLElement & { style: unknown }; el.style = 'color: red';"],
    ["declare const el: HTMLElement; el.style.color = 'red';"],
    ["declare const el: HTMLElement; el.style.setProperty('color', 'red');"],
    ["declare const el: HTMLElement; el.style.cssText = 'color: red';"],
    ["declare const el: HTMLElement; el.attributeStyleMap.set('color', 'red');"],
  ])('rejects %s', async (code) => {
    expect(await styleViolations(`export {};\n${code}`)).toBeGreaterThan(0);
  });

  it('allows adopting a constructable stylesheet and reading style', async () => {
    const code = [
      'export {};',
      'declare const root: ShadowRoot; declare const el: HTMLElement;',
      'const sheet = new CSSStyleSheet();',
      "sheet.replaceSync('.a {}');",
      'root.adoptedStyleSheets = [sheet];',
      "el.setAttribute('part', 'item');",
      'const read = getComputedStyle(el).color;',
      'void read;',
    ].join('\n');
    expect(await styleViolations(code)).toBe(0);
  });
});
