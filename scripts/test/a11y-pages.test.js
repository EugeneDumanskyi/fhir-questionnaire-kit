import { describe, expect, it } from 'vitest';

import { CSP, index, page, PAGES } from '../a11y-pages.mjs';

describe('the screen-reader pass pages (M8 plan step 10, NFR-A-02)', () => {
  it('sets the language, a title and the CSP a host sets on every page', () => {
    for (const markup of [index(), ...Object.values(PAGES).map(page)]) {
      expect(markup).toContain('<html lang="en">');
      expect(markup).toMatch(/<title>fhirq [^<]+<\/title>/);
      expect(markup).toContain(`<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
      expect(markup).not.toMatch(/<style|style="|<script>/);
    }
  });

  it('puts the element in a host form with a submit button, and React on its mount', () => {
    const element = page(PAGES['element-demo.html']);
    expect(element).toContain('<form>\n<fhir-questionnaire data-form="demo"></fhir-questionnaire>\n<button>Submit</button>\n</form>');
    expect(element).not.toContain('base.css');
    const react = page(PAGES['react-kinds.html']);
    expect(react).toContain('<div id="root" data-form="kinds"></div>');
    expect(react).toContain('<link rel="stylesheet" href="base.css">\n<link rel="stylesheet" href="default.css">');
  });

  it('lists every page on the index, named by renderer and form', () => {
    for (const file of Object.keys(PAGES)) expect(index()).toContain(`<a href="${file}">`);
    expect(index()).toContain('React, the form of every kind');
  });
});
