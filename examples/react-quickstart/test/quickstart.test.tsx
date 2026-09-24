import { readFileSync } from 'node:fs';

import { version } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Intake } from '../src/app.js';

/**
 * M6 AC-1 (NFR-U-01, NFR-Q-08, AC-13.2.1) in Node, on React 18 and 19: the
 * quickstart compiles as a consumer writes it, the README shows exactly that
 * code, and it renders on a server with no DOM. It is hydrated, answered and
 * completed in browsers by `tests/browser/quickstart.spec.ts`.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const APP = read('../src/app.tsx');

/** Every line that is not blank. The sample holds no comments, so none are left out. */
const counted = (source: string) => source.split('\n').filter((line) => line.trim() !== '');

describe('the React quickstart (M6 AC-1)', () => {
  it('is 13 lines of consumer code: NFR-U-01 asks for 10, and the 3 over are recorded', () => {
    expect(APP).not.toMatch(/\/\/|\/\*/);
    expect(counted(APP)).toHaveLength(13);
  });

  it('is what the README shows, verbatim (NFR-Q-08)', () => {
    const shown = read('../README.md').match(/```tsx\n([\s\S]*?)```/)?.[1];

    expect(shown).toBe(APP);
  });

  it('renders on a server with no DOM: the form, its questions and the submit button', () => {
    expect(version.split('.')[0]).toBe(process.env['FHIRQ_REACT_MAJOR']);
    expect(typeof document).toBe('undefined');

    const html = renderToString(<Intake onComplete={() => undefined} />);

    expect(html).toMatch(/^<form><div class="fhirq-form" part="form">/);
    expect(html).toMatch(/<button>Submit<\/button><\/form>$/);
    const all = (pattern: RegExp) => [...html.matchAll(pattern)].map(([, text]) => text);
    // Initial enablement: the question on smoking is not shown until it is answered yes.
    expect(all(/data-path="([^"]+)"/g)).toEqual(['notice', 'name', 'born', 'smoker', 'contact']);
    expect(all(/class="fhirq-label"[^>]*>([^<]+)</g)).toEqual(['Full name', 'Date of birth', 'Do you smoke?', 'How should we contact you?']);
    expect(all(/class="fhirq-choice-label"[^>]*>([^<]+)</g)).toEqual(['Yes', 'No', 'Phone', 'Email', 'Post']);
  });
});
