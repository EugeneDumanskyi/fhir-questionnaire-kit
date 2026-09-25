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
 * The element's keystroke pages (M7 step 9): the demo and the 500-item bench
 * fixture, each a production build of the element making its own session
 * from the `questionnaire` property, with a host listening for `fhirq-change`.
 * The control reading is the React pages' textarea.
 */
export const ELEMENT_TYPED = ['demo', 'large-500'] as const;
export type ElementTyped = (typeof ELEMENT_TYPED)[number];

/**
 * The element's pages (M7): the S1 slice, a form of every kind
 * (`packages/element/test/kinds.ts`), and the demo, which the DOM contract
 * compares with React's. Client-rendered, one bundle for all three.
 */
export const ELEMENT_PAGES = ['slice', 'kinds', 'demo'] as const;
export type ElementPage = (typeof ELEMENT_PAGES)[number];

/**
 * The isolation pages (M7 step 8, AC-09.2.1, AC-09.2.2): a host page of its
 * own elements and, when `with`, the element on the demo, under one of four
 * host stylesheets. `clean` has only the host's layout; `hostile` adds
 * aggressive global rules; `inherited` sets inherited properties and the
 * root font size on the host page; `themed` sets tokens and `::part()` rules.
 */
export const HOST_STYLES = ['clean', 'hostile', 'inherited', 'themed'] as const;
export type HostStyle = (typeof HOST_STYLES)[number];
