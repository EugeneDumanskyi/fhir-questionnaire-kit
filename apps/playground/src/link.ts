import type { LoadMode } from '@fhirq/core';

import type { Scheme, Tier } from './choices.js';

/**
 * Share links (M9 plan D7, AC-12.5.1; ADR-0019). A link carries the
 * questionnaire's text as it was loaded, the load mode, the tier and the
 * colour scheme, deflated with the platform's `CompressionStream` and
 * written after the `#`, which a browser never sends to a server. It never
 * carries an answer.
 */
export interface Shared {
  readonly text: string;
  readonly mode: LoadMode;
  readonly tier: Tier;
  readonly scheme: Scheme;
}

/**
 * The longest link the page makes, in characters, the whole URL counted. The
 * fragment never reaches a server, but a link is pasted into issues, chats and
 * documents, and 8 KiB is the common ceiling along that way. About four times
 * the demo's link. A longer one is refused, never cut short (ADR-0019).
 */
export const LIMIT = 8192;

/** A link's format; a later one gets a new prefix, and this one still reads. */
const VERSION = 'v1.';

const MODES: readonly string[] = ['strict', 'lenient'] satisfies readonly LoadMode[];
const TIERS: readonly unknown[] = [1, 2, 3, 4] satisfies readonly Tier[];
const SCHEMES: readonly string[] = ['system', 'light', 'dark'] satisfies readonly Scheme[];

/** A link to `page` with this state, or how long it would have been. */
export type Link = { readonly kind: 'link'; readonly url: string } | { readonly kind: 'too-long'; readonly length: number };

export async function link(page: string, shared: Shared): Promise<Link> {
  const url = `${page.split('#', 1)[0] ?? page}#${await encode(shared)}`;
  return url.length > LIMIT ? { kind: 'too-long', length: url.length } : { kind: 'link', url };
}

/** The fragment for this state, without the `#`. */
export async function encode({ text, mode, tier, scheme }: Shared): Promise<string> {
  const json = JSON.stringify({ q: text, m: mode, t: tier, s: scheme });
  return VERSION + toBase64Url(await through(new TextEncoder().encode(json), new CompressionStream('deflate')));
}

/**
 * The state a fragment carries, or `null` for anything that is not a link
 * this page made: another prefix, a character outside base64url, bytes that
 * do not inflate, text that is not the shape. One longer than a link can be is
 * refused before it is inflated, so a crafted one cannot inflate without bound.
 */
export async function decode(fragment: string): Promise<Shared | null> {
  if (!fragment.startsWith(VERSION) || fragment.length > LIMIT) return null;
  const body = fragment.slice(VERSION.length);
  if (!/^[\w-]*$/.test(body)) return null;
  try {
    const bytes = await through(fromBase64Url(body), new DecompressionStream('deflate'));
    return shape(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    return null;
  }
}

function shape(value: unknown): Shared | null {
  if (typeof value !== 'object' || value === null) return null;
  const { q, m, t, s } = value as Readonly<Record<string, unknown>>;
  if (typeof q !== 'string' || typeof m !== 'string' || !MODES.includes(m) || !TIERS.includes(t) || typeof s !== 'string' || !SCHEMES.includes(s)) return null;
  return { text: q, mode: m as LoadMode, tier: t as Tier, scheme: s as Scheme };
}

async function through(bytes: Uint8Array<ArrayBuffer>, transform: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const reader = new Blob([bytes]).stream().pipeThrough(transform).getReader();
  const chunks: Uint8Array[] = [];
  for (let read = await reader.read(); !read.done; read = await reader.read()) chunks.push(read.value);
  const joined = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
