import { expect, type Page } from '@playwright/test';

import { ORIGIN } from './pages/serve.js';

/**
 * What a hydrated React page must not do (NFR-C-08, AC-14.6.1): print a
 * console warning or error, throw, replace the server's form, or request
 * anything but its own page, script and two stylesheets. Call before the page
 * opens; the check it returns runs at the end of the proof. Shared by the
 * hydration proofs (M6 step 8) and the quickstart's (step 9).
 */
export async function watch(page: Page): Promise<(major: 18 | 19, html: string) => Promise<void>> {
  const messages: string[] = [];
  const requests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') messages.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
  page.on('request', (request) => requests.push(request.url()));
  // A client re-render after a mismatch replaces the server nodes; count removals.
  await page.addInitScript(() => {
    const removed: string[] = [];
    Object.assign(window, { fhirqRemoved: removed });
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (node instanceof Element && node.classList.contains('fhirq-form')) removed.push('fhirq-form');
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  return async (major, html) => {
    expect(messages).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { fhirqRemoved: string[] }).fhirqRemoved)).toEqual([]);
    expect(requests.map((url) => url.replace(ORIGIN, '')).sort()).toEqual(['/base.css', '/default.css', html, `/react-${major}.js`].sort());
  };
}
