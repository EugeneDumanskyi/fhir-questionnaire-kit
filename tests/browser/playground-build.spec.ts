import { expect, test } from '@playwright/test';

import { PLAYGROUND, servePlayground } from './pages/playground.js';

/**
 * The playground's build (M9 step 2; ADR-0019 and its 2026-09-28 note): it
 * loads from `dist` under Pages' project path through relative asset paths.
 * Its policy and the network log are `playground-privacy.spec.ts`'s.
 */

test('loads every asset from the build under the project path', async ({ page }) => {
  const served = await servePlayground(page);
  await page.goto(PLAYGROUND);
  await page.waitForLoadState('networkidle');
  expect(served.requests.length).toBeGreaterThan(1);
  expect(served.requests.filter((request) => request.status !== 200)).toEqual([]);
  expect(served.requests.every((request) => request.method === 'GET' && request.url.startsWith(PLAYGROUND))).toBe(true);
  await expect(page.locator('#root > main')).toBeAttached();
});
