import { expect, test, type Page } from '@playwright/test';

import type { TestWindow } from './fhirq.js';
import { CLIENT_ZONE, open } from './pages/serve.js';
import { watch } from './watch.js';

/**
 * M6 AC-1 (NFR-U-01, NFR-Q-08, AC-13.2.1) in browsers: `examples/react-quickstart`,
 * as a consumer writes it, rendered on a server and hydrated here in another
 * timezone, on React 18 and 19, under StrictMode, in Chromium and WebKit. It
 * hydrates with 0 warnings, refuses an empty submission with the error
 * summary focused, and completes once answered, handing its host the
 * response. Axe runs over it in `react-a11y.spec.ts`; the Node render and the
 * line count are the example's own test.
 */

test.use({ timezoneId: CLIENT_ZONE });

/** What the host's `onComplete` was handed: each response's status and answers, by `linkId`. */
const completed = (page: Page) =>
  page.evaluate(() =>
    ((window as unknown as TestWindow).fhirq.completed ?? []).map(({ status, item = [] }) => ({
      status,
      answers: Object.fromEntries(item.map(({ linkId, answer = [] }) => [linkId, answer])),
    })),
  );

for (const major of [18, 19] as const) {
  test(`React ${major}: the quickstart hydrates with 0 warnings, refuses an empty submission, then completes`, async ({ page }) => {
    const check = await watch(page);
    await open(page, `react-${major}`, 'quickstart');
    const submit = page.getByRole('button', { name: 'Submit' });

    await submit.click();
    const summary = page.getByRole('region', { name: 'There is a problem' });
    await expect(summary).toBeFocused();
    await expect(summary.getByRole('link')).toHaveCount(3);
    expect(await completed(page)).toEqual([]);

    await page.getByRole('textbox', { name: 'Full name' }).fill('Ada Lovelace');
    await page.getByRole('textbox', { name: 'Date of birth' }).fill('1815-12-10');
    await page.getByRole('radiogroup', { name: 'Do you smoke?' }).getByRole('radio', { name: 'Yes' }).check();
    await page.getByRole('textbox', { name: 'Cigarettes a day' }).fill('5');
    await page.getByRole('radiogroup', { name: 'How should we contact you?' }).getByRole('radio', { name: 'Email' }).check();
    await submit.click();

    await expect(summary).toHaveCount(0);
    expect(await completed(page)).toEqual([
      {
        status: 'completed',
        answers: {
          name: [{ valueString: 'Ada Lovelace' }],
          born: [{ valueDate: '1815-12-10' }],
          smoker: [{ valueBoolean: true }],
          'per-day': [{ valueInteger: 5 }],
          contact: [{ valueString: 'Email' }],
        },
      },
    ]);
    await check(major, `/react-${major}-quickstart.html`);
  });
}
