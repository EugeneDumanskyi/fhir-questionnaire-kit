import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { apng, chunks, DEMO } from '../capture-demo.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url));

/** A PNG of `width` × 1 grey pixels of shade `shade`, built by hand. */
function png(width, shade) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'latin1');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width, shade)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(row)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Each chunk's CRC, as written against as computed. */
function crcs(image) {
  const found = [];
  for (let at = 8; at < image.length; ) {
    const length = image.readUInt32BE(at);
    found.push([image.readUInt32BE(at + 8 + length), crc32(image.subarray(at + 4, at + 8 + length))]);
    at += 12 + length;
  }
  return found;
}

describe('the README demo (M10 AC-4, plan D4)', () => {
  it('assembles frames into an APNG that loops, the first frame the default image, sequence numbers in order', () => {
    const image = apng([
      { png: png(4, 0), ms: 1600 },
      { png: png(4, 128), ms: 1400 },
      { png: png(4, 255), ms: 3000 },
    ]);
    const list = chunks(image);

    expect(list.map(({ type }) => type)).toEqual(['IHDR', 'acTL', 'fcTL', 'IDAT', 'fcTL', 'fdAT', 'fcTL', 'fdAT', 'IEND']);
    const control = list.find(({ type }) => type === 'acTL').data;
    expect([control.readUInt32BE(0), control.readUInt32BE(4)]).toEqual([3, 0]);
    const sequences = list.filter(({ type }) => type === 'fcTL' || type === 'fdAT').map(({ data }) => data.readUInt32BE(0));
    expect(sequences).toEqual([0, 1, 2, 3, 4]);
    const delays = list.filter(({ type }) => type === 'fcTL').map(({ data }) => [data.readUInt16BE(20), data.readUInt16BE(22)]);
    expect(delays).toEqual([[1600, 1000], [1400, 1000], [3000, 1000]]);
    for (const [written, computed] of crcs(image)) expect(written).toBe(computed);
  });

  it('refuses frames of different sizes, and no frames at all', () => {
    expect(() => apng([{ png: png(4, 0), ms: 100 }, { png: png(5, 0), ms: 100 }])).toThrow('frames differ in size or format');
    expect(() => apng([])).toThrow('no frames');
    expect(() => chunks(Buffer.from('GIF89a'))).toThrow('not a PNG');
  });

  it('is committed as an animation, and the README shows it on its first screen', () => {
    const types = chunks(read(DEMO)).map(({ type }) => type);
    expect(types).toContain('acTL');
    expect(types.filter((type) => type === 'fcTL').length).toBeGreaterThan(1);

    const readme = read('README.md').toString('utf8');
    const image = readme.indexOf(`](${DEMO})`);
    expect(image).toBeGreaterThan(-1);
    expect(image).toBeLessThan(readme.indexOf('\n## '));
  });
});
