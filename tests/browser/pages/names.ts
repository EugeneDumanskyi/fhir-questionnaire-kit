/**
 * The React pages the proofs open, each a form the server renders and the
 * client hydrates (M6 steps 8 and 9): the S1 slice, the demo, a value set that
 * stays pending until the proof releases it, ADR-0020's dates, decimals and
 * quantities, and the quickstart. Its own module, so the client bundle reads
 * it without the server's build code.
 */
export const PAGES = ['slice', 'demo', 'value-set', 'formats', 'quickstart'] as const;
export type Page = (typeof PAGES)[number];
