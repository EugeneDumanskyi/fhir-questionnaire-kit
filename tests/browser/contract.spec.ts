import { expect, test, type Locator, type Page } from '@playwright/test';

import { open, reach, type FormState } from './pages/serve.js';

/**
 * M1 AC-4, ADR-0007: one DOM contract (docs/08-dom-contract.md), asserted
 * against both renderers by one test. For every state, the two renderers must
 * produce the same tree of elements, classes, `part` names, roles and ARIA
 * attributes, with every id reference resolved *within the same root* and
 * described by what it points at, and the same accessible names.
 */

const FORM: Readonly<Record<'element' | 'react-19', string>> = {
  element: 'fhir-questionnaire .fhirq-form',
  'react-19': '#root .fhirq-form',
};

/** A renderer-neutral description of the form: ids replaced by what they resolve to. */
function describe(form: Locator) {
  return form.evaluate((root) => {
    const tree = root.getRootNode() as Document | ShadowRoot;
    const describeTarget = (id: string) => {
      const target = tree.getElementById(id);
      if (target === null) return `UNRESOLVED`;
      const item = target.closest('[data-path]')?.getAttribute('data-path');
      return `${target.tagName.toLowerCase()}.${target.getAttribute('class') ?? ''}${item === undefined ? '' : `@${item}`}`;
    };
    const REFERENCES = new Set(['aria-describedby', 'aria-labelledby', 'aria-controls', 'aria-errormessage', 'for']);
    const OWN = new Set(['class', 'part', 'role', 'data-path']);
    // Properties, not attributes: React mirrors them into attributes, the patcher does not need to.
    const PROPERTY_ONLY = new Set(['value', 'checked']);

    type Node = { tag: string; attributes: Record<string, string | string[] | boolean>; text: string; children: Node[]; state?: Record<string, unknown> };
    const walk = (element: Element): Node => {
      const attributes: Node['attributes'] = {};
      for (const { name, value } of element.attributes) {
        if (OWN.has(name)) attributes[name] = value;
        else if (name === 'id') attributes['id'] = true;
        else if (REFERENCES.has(name)) attributes[name] = value.split(/\s+/).map(describeTarget);
        else if (name === 'href') attributes['href'] = describeTarget(value.slice(1));
        else if (name === 'name') attributes['name'] = describeTarget(value);
        else if (!(element instanceof HTMLInputElement && PROPERTY_ONLY.has(name))) attributes[name] = value;
      }
      const text = [...element.childNodes]
        .filter((child) => child.nodeType === 3)
        .map((child) => child.textContent ?? '')
        .join('');
      const node: Node = { tag: element.tagName.toLowerCase(), attributes, text, children: [...element.children].map(walk) };
      if (element instanceof HTMLInputElement) node.state = { value: element.value, checked: element.checked };
      return node;
    };
    return walk(root);
  });
}

async function capture(page: Page, renderer: 'element' | 'react-19', state: FormState) {
  await open(page, renderer);
  await reach(page, state);
  const form = page.locator(FORM[renderer]);
  // Link URLs carry the renderer's id prefix; the DOM description already
  // asserts what each one resolves to.
  const aria = (await form.ariaSnapshot()).replace(/\/url: "#[^"]*"/g, '/url: "#<id>"');
  return { dom: await describe(form), aria };
}

for (const state of ['initial', 'string-shown', 'errors-surfaced'] as const) {
  test(`both renderers honour one DOM contract: ${state}`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'The contract is markup; one engine suffices in M1.');
    const element = await capture(await browser.newPage(), 'element', state);
    const react = await capture(await browser.newPage(), 'react-19', state);

    expect(JSON.stringify(element.dom)).not.toContain('UNRESOLVED');
    expect(react.dom).toEqual(element.dom);
    expect(react.aria).toEqual(element.aria);
  });
}
