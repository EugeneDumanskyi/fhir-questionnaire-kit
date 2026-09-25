/**
 * The React pages the proofs open, each a form the server renders and the
 * client hydrates (M6 steps 8 and 9): the S1 slice, the demo, a value set that
 * stays pending until the proof releases it, ADR-0020's dates, decimals and
 * quantities, and the quickstart. Its own module, so the client bundle reads
 * it without the server's build code.
 */
export const PAGES = ['slice', 'demo', 'value-set', 'formats', 'quickstart'] as const;
export type Page = (typeof PAGES)[number];

/**
 * The keystroke pages (M6 step 10): client-rendered production builds, as a
 * host ships them. A bare textarea is the control, giving the wait for the
 * next frame that no code can shorten; then the demo, the 500-item bench
 * fixture, and that fixture controlled by a host that stores a clone of
 * every response.
 */
export const TYPED = ['control', 'demo', 'large-500', 'large-500-cloned'] as const;
export type Typed = (typeof TYPED)[number];

/**
 * The element's pages (M7): the S1 slice, and a form of every kind it builds
 * (`packages/element/test/kinds.ts`). Client-rendered, one bundle for both.
 */
export const ELEMENT_PAGES = ['slice', 'kinds'] as const;
export type ElementPage = (typeof ELEMENT_PAGES)[number];
