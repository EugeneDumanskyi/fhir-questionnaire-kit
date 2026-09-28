import { describe, expect, it } from 'vitest';

import { CSP, injectCsp, sourceModules } from '../vite/plugins.js';

describe('the build-only CSP (ADR-0019)', () => {
  const page = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n  </head>\n  <body></body>\n</html>\n';

  it('writes the policy as the first element of <head>', () => {
    const html = injectCsp(page);
    expect(html).toContain(`<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta charset="utf-8" />`);
  });

  it('is the policy ADR-0019 names, with no outbound connection', () => {
    expect(CSP).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'",
    );
  });

  it('finds a <head> that carries attributes', () => {
    expect(injectCsp('<html><head data-x="1"><title>t</title></head></html>')).toMatch(/^<html><head data-x="1">\n {4}<meta http-equiv="Content-Security-Policy"/);
  });

  describe('must fail', () => {
    it('refuses a page with no <head>', () => {
      expect(() => injectCsp('<html><body></body></html>')).toThrow('no <head>');
    });

    it('refuses a page that declares a policy of its own', () => {
      expect(() => injectCsp(`<html><head><meta http-equiv="content-security-policy" content="default-src *"></head></html>`)).toThrow('already declares');
    });
  });
});

describe('built from dist (M9 AC-8)', () => {
  it('names every module from a package\'s sources, and none from its dist', () => {
    expect(
      sourceModules([
        '/repo/apps/playground/src/main.tsx',
        '/repo/packages/core/dist/index.js',
        '/repo/packages/react/src/questionnaire.tsx',
        'C:\\repo\\packages\\core\\src\\index.ts',
        '/repo/node_modules/react/index.js',
      ]),
    ).toEqual(['/repo/packages/react/src/questionnaire.tsx', 'C:\\repo\\packages\\core\\src\\index.ts']);
  });
});
