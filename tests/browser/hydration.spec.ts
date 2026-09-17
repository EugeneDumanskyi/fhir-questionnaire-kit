import { expect, test } from '@playwright/test';

import type { TestWindow } from './fhirq.js';
import { open, reach } from './pages/serve.js';

/**
 * M1 AC-6, R5's thin proof: the server-rendered slice hydrates with 0 console
 * warnings or errors on React 18 and React 19, in development builds (the
 * builds that print hydration warnings), and hydration adopts the server
 * markup rather than replacing it.
 */
for (const major of [18, 19] as const) {
  test(`React ${major} hydrates the server markup with 0 warnings`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Hydration is engine-independent; one engine in M1, the matrix is M6.');
    const messages: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') messages.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
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

    await open(page, `react-${major}`);
    expect(await page.evaluate(() => (window as unknown as TestWindow).fhirq.react?.split('.')[0])).toBe(String(major));

    await reach(page, 'errors-surfaced');
    await page.getByRole('textbox').fill('10');
    await expect(page.getByRole('region', { name: 'There is a problem' })).toHaveCount(0);

    expect(messages).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { fhirqRemoved: string[] }).fhirqRemoved)).toEqual([]);
  });
}
