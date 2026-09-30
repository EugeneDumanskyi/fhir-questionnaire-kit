/**
 * The README's demo of the rules engine (M10 AC-4, plan D4): the built
 * playground on a phone, answering the demo's chain of conditions three deep.
 * "Yes" to pain reveals the score, a score of 7 or more reveals when the pain
 * started, and an answer there reveals the note to tell reception. Each step
 * is one frame, and the frames are one animated PNG, `docs/media/demo.png`.
 *
 * An APNG is a PNG with its frames in extra chunks (the APNG specification,
 * adopted into PNG's third edition), so the screenshots need no decoding:
 * every frame shares the first one's header, and each frame's image data is
 * copied in as it came. A viewer that ignores the extra chunks shows the
 * first frame.
 *
 *   pnpm build:playground && pnpm demo:capture
 */

import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Where the image is written, from the repository root; the README shows it. */
export const DEMO = 'docs/media/demo.png';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A PNG's chunks, in order, as `{ type, data }`. */
export function chunks(png) {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  const found = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    found.push({ type: png.toString('latin1', at + 4, at + 8), data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return found;
}

/** One chunk as written: length, type, data and the CRC over type and data. */
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

const u32 = (...values) => {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeUInt32BE(value, index * 4));
  return buffer;
};

/**
 * `frames`, each `{ png, ms }`, as one APNG that loops forever. Every PNG must
 * have the same header (size, depth, colour type), as screenshots of one clip
 * do. Each frame replaces the whole canvas for `ms` milliseconds.
 */
export function apng(frames) {
  if (frames.length === 0) throw new Error('no frames');
  const parsed = frames.map(({ png }) => chunks(png));
  const header = parsed[0].find(({ type }) => type === 'IHDR').data;
  if (parsed.some((list) => !list.find(({ type }) => type === 'IHDR').data.equals(header))) throw new Error('frames differ in size or format');
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  let sequence = 0;
  const out = [SIGNATURE, chunk('IHDR', header), chunk('acTL', u32(frames.length, 0))];
  frames.forEach(({ ms }, index) => {
    // fcTL: sequence, size, offset 0,0, delay ms/1000, dispose none, blend source.
    const control = Buffer.concat([u32(sequence++, width, height, 0, 0), Buffer.from([ms >> 8, ms & 0xff, 0x03, 0xe8, 0, 0])]);
    out.push(chunk('fcTL', control));
    for (const { type, data } of parsed[index]) {
      if (type !== 'IDAT') continue;
      out.push(index === 0 ? chunk('IDAT', data) : chunk('fdAT', Buffer.concat([u32(sequence++), data])));
    }
  });
  out.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(out);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

/** Screenshots of the demo's chain, one per step, all of one clip. */
async function capture() {
  const { chromium } = await import('@playwright/test');
  const dist = join(root, 'apps/playground/dist');
  const origin = 'http://demo.fhirq.test/';
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });
    await page.route(`${origin}**`, (route) => {
      const path = new URL(route.request().url()).pathname.replace(/\/$/, '/index.html');
      try {
        route.fulfill({ status: 200, contentType: TYPES[extname(path)] ?? 'application/octet-stream', body: readFileSync(join(dist, path)) });
      } catch {
        route.fulfill({ status: 404, body: '' });
      }
    });
    await page.goto(origin);
    const pain = page.locator('[data-path="pain"]');
    const now = page.getByRole('radiogroup', { name: 'Are you in pain today?' });
    await pain.scrollIntoViewIfNeeded();
    const box = await pain.boundingBox();
    if (box === null) throw new Error('the demo has no pain group: is the playground built?');
    // Tall enough for the last step, when all four of the group's items show.
    const clip = { x: box.x, y: box.y, width: box.width, height: 430 };
    const shot = () => page.screenshot({ clip, animations: 'disabled', caret: 'hide' });

    const frames = [{ png: await shot(), ms: 1600 }];
    await now.getByRole('radio', { name: 'Yes' }).check();
    await page.getByLabel(/how strong is it/).waitFor();
    frames.push({ png: await shot(), ms: 1400 });
    await page.getByLabel(/how strong is it/).fill('8');
    await page.getByLabel(/how strong is it/).blur();
    await page.getByLabel('When did the strong pain start?').waitFor();
    frames.push({ png: await shot(), ms: 1400 });
    await page.getByLabel('When did the strong pain start?').fill('2026-09-30T08:30+01:00');
    await page.getByLabel('When did the strong pain start?').blur();
    await page.locator('.fhirq-form').getByText('Please tell reception about your pain when you arrive.').waitFor();
    frames.push({ png: await shot(), ms: 3000 });
    return frames;
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const image = apng(await capture());
  writeFileSync(join(root, DEMO), image);
  console.log(`${DEMO}: ${image.length} bytes`);
}
