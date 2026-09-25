import { expect, test, type Request } from '@playwright/test';

import { ORIGIN, serve, SRC } from './pages/serve.js';

/**
 * M7 AC-8, AC-07.1.3, ADR-0012 and its M7 note: an element with `src` and
 * `value-set-base` and no host script makes exactly one `GET` for its form
 * and exactly one per distinct canonical, under the strict CSP, and nothing
 * the respondent or host does afterwards makes another. The spec is the
 * server: it answers the form and each `$expand`, and records every request
 * the page makes. Chromium, Firefox and WebKit (M7 plan D8).
 */

const COLOURS = 'http://example.org/fhir/ValueSet/colours';
const SIZES = 'http://example.org/fhir/ValueSet/sizes';

/** Two items share one value set and a third has another. */
const FORM = {
  resourceType: 'Questionnaire',
  status: 'draft',
  item: [
    { linkId: 'colour', type: 'choice', text: 'Colour', answerValueSet: COLOURS },
    { linkId: 'size', type: 'choice', text: 'Size', answerValueSet: SIZES },
    { linkId: 'shade', type: 'choice', text: 'Shade', answerValueSet: COLOURS },
  ],
};

const EXPANSIONS: Readonly<Record<string, unknown>> = {
  [COLOURS]: [
    { system: 'urn:c', code: 'red', display: 'Red' },
    { display: 'Blues', contains: [{ system: 'urn:c', code: 'navy', display: 'Navy' }] },
  ],
  [SIZES]: [
    { system: 'urn:s', code: 's', display: 'Small' },
    { system: 'urn:s', code: 'l', display: 'Large' },
  ],
};

const fhir = (body: unknown) => ({ status: 200, contentType: 'application/fhir+json', body: JSON.stringify(body) });

test('one GET for src and one per distinct canonical, from markup alone, and none after', async ({ page }) => {
  const requests: Request[] = [];
  page.on('request', (request) => requests.push(request));
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await serve(page);
  // Registered after the pages, so these answer first.
  await page.route(`${ORIGIN}${SRC.form}`, (route) => route.fulfill(fhir(FORM)));
  await page.route(
    (url) => url.pathname === `${SRC.valueSetBase}/ValueSet/$expand`,
    (route) => {
      const canonical = new URL(route.request().url()).searchParams.get('url') ?? '';
      return route.fulfill(fhir({ resourceType: 'ValueSet', expansion: { contains: EXPANSIONS[canonical] } }));
    },
  );

  await page.goto(`${ORIGIN}/element-src.html`);
  await expect(page.getByRole('radio', { name: 'Navy' })).toHaveCount(2);
  await expect(page.getByRole('radio', { name: 'Large' })).toHaveCount(1);

  // Answering, reconnecting and a new view make no further request.
  await page.getByRole('radio', { name: 'Navy' }).first().check();
  await page.getByRole('radio', { name: 'Small' }).check();
  await page.evaluate(() => {
    const element = document.querySelector('fhir-questionnaire');
    if (element === null) return;
    element.remove();
    document.body.append(element);
    element.setAttribute('lang', 'de');
  });
  await expect(page.getByRole('radio', { name: 'Red' })).toHaveCount(2);
  await expect(page.getByRole('radio', { name: 'Navy' }).first()).toBeChecked();

  const assets = ['/element-src.html', '/element-src.js'];
  const calls = requests.filter((request) => !assets.includes(new URL(request.url()).pathname));
  expect(calls.map((request) => [request.method(), request.url()]).sort()).toEqual(
    [
      ['GET', `${ORIGIN}${SRC.form}`],
      ['GET', `${ORIGIN}${SRC.valueSetBase}/ValueSet/$expand?url=${encodeURIComponent(COLOURS)}`],
      ['GET', `${ORIGIN}${SRC.valueSetBase}/ValueSet/$expand?url=${encodeURIComponent(SIZES)}`],
    ].sort(),
  );
  for (const request of calls) expect(await request.headerValue('accept')).toBe('application/fhir+json');
  expect(errors).toEqual([]);
});
