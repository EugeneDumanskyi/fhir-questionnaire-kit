import { expect, test, type Page } from '@playwright/test';

import { PLAYGROUND, servePlayground } from './pages/playground.js';

/**
 * Share links (M9 plan D7, AC-12.5.1; ADR-0019), in Chromium, Firefox and
 * WebKit, whose `CompressionStream` each makes and reads them. A link carries
 * the questionnaire as loaded, the load mode, the tier and the scheme in the
 * fragment, never an answer; opening it reproduces them. One too long is
 * refused, never cut short, and one the page did not make opens the page as
 * it is.
 */

const editor = (page: Page) => page.getByRole('region', { name: 'Paste your own Questionnaire', exact: true });
const text = (page: Page) => editor(page).getByLabel('Questionnaire JSON');
const outcome = (page: Page) => editor(page).getByRole('status');
const form = (page: Page) => page.getByRole('region', { name: 'Demonstration form', exact: true });
const switcher = (page: Page) => page.getByRole('region', { name: 'Customization tiers', exact: true });
const tier = (page: Page, name: RegExp) => switcher(page).getByRole('group', { name: 'Tier' }).getByRole('radio', { name });
const share = (page: Page) => page.getByRole('region', { name: 'Share this state', exact: true });
const made = (page: Page) => share(page).getByLabel('Link to this state');

const questionnaire = (item: readonly object[]) => JSON.stringify({ resourceType: 'Questionnaire', status: 'active', item }, null, 2);
const attachment = questionnaire([
  { linkId: 'name', text: 'What should we call you?', type: 'string' },
  { linkId: 'photo', text: 'A photo of the rash', type: 'attachment' },
]);

/** Pastes `json` in `mode`, and waits for it to load or be refused. */
async function paste(page: Page, json: string, mode: 'Strict' | 'Lenient'): Promise<void> {
  await editor(page).getByRole('radio', { name: new RegExp(`^${mode}`) }).check();
  await text(page).fill(json);
  await expect(outcome(page)).toContainText(mode === 'Strict' ? 'Refused' : 'Loaded');
}

async function makeLink(page: Page): Promise<string> {
  await share(page).getByRole('button', { name: 'Make a link' }).click();
  return made(page).inputValue();
}

test.beforeEach(async ({ page }) => {
  await servePlayground(page);
  await page.goto(PLAYGROUND);
});

test('opens a link on its questionnaire, load mode, tier and scheme, and on none of the answers (AC-12.5.1)', async ({ page, context }) => {
  await paste(page, attachment, 'Lenient');
  await form(page).getByLabel('What should we call you?').fill('Ada Lovelace');
  await tier(page, /Slots/).check();
  await switcher(page).getByRole('radio', { name: 'Dark', exact: true }).check();

  const url = await makeLink(page);
  expect(url.startsWith(`${PLAYGROUND}#v1.`)).toBe(true);
  expect(url).not.toContain('Ada');
  // The page does not write the link into the address bar, or its history.
  expect(page.url()).toBe(PLAYGROUND);

  const opened = await context.newPage();
  await servePlayground(opened);
  await opened.goto(url);
  await expect(text(opened)).toHaveValue(attachment);
  await expect(editor(opened).getByRole('radio', { name: /^Lenient/ })).toBeChecked();
  await expect(outcome(opened)).toContainText('Loaded, with 1 diagnostic');
  await expect(tier(opened, /Slots/)).toBeChecked();
  await expect(switcher(opened).getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await expect(opened.locator('html')).toHaveAttribute('data-scheme', 'dark');
  await expect(form(opened).getByLabel('What should we call you?')).toHaveValue('');
});

test('opens a link to a refused questionnaire on the refusal, beside the demo', async ({ page, context }) => {
  await paste(page, attachment, 'Strict');
  const url = await makeLink(page);

  const opened = await context.newPage();
  await servePlayground(opened);
  await opened.goto(url);
  await expect(text(opened)).toHaveValue(attachment);
  await expect(outcome(opened)).toContainText('Refused (');
  await expect(form(opened).getByRole('radiogroup', { name: /Are you in pain today/ })).toBeVisible();
});

test('reads a link pasted into the address bar of the open page', async ({ page }) => {
  await tier(page, /Headless/).check();
  const url = await makeLink(page);
  await tier(page, /Defaults/).check();
  await page.goto(url);
  await expect(tier(page, /Headless/)).toBeChecked();
});

test('shows no link for a state that has changed since it was made', async ({ page }) => {
  await makeLink(page);
  await tier(page, /Tokens/).check();
  await expect(made(page)).toHaveCount(0);
});

test('refuses a link too long to share, and says so rather than cutting it short', async ({ page }) => {
  let seed = 7;
  const noise = () => Array.from({ length: 80 }, () => String.fromCharCode(97 + ((seed = (seed * 48271) % 2147483647) % 26))).join('');
  const large = questionnaire(Array.from({ length: 150 }, (_, i) => ({ linkId: `q${i}`, text: noise(), type: 'string' })));
  await paste(page, large, 'Lenient');
  await share(page).getByRole('button', { name: 'Make a link' }).click();
  await expect(share(page).getByRole('status')).toContainText(/makes a link of [\d,.\s ]+ characters, more than the 8.192 a link may have. Nothing was cut short/);
  await expect(made(page)).toHaveCount(0);
});

test('opens the page as it is on a link it did not make, and says so', async ({ context }) => {
  const opened = await context.newPage();
  await servePlayground(opened);
  await opened.goto(`${PLAYGROUND}#v1.not-a-link`);
  await expect(opened.getByText('This link could not be read')).toBeVisible();
  await expect(form(opened).getByRole('radiogroup', { name: /Are you in pain today/ })).toBeVisible();
  await expect(text(opened)).toHaveValue(/"resourceType": "Questionnaire"/);
});
