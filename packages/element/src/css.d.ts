/**
 * esbuild's `text` loader turns an imported stylesheet into its source string,
 * so the element can adopt it as a constructable stylesheet (ADR-0014).
 */
declare module '*.css' {
  const css: string;
  // eslint-disable-next-line no-restricted-syntax -- the text loader's contract is a default export; this declares it, it exports nothing of ours.
  export default css;
}
