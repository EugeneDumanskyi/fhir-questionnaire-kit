// A development-only check behind the guard @fhirq/react's checks use. A
// production define must remove all of it (M6 plan D6), and the `typeof`
// guard keeps a page with no bundler, where `process` is undefined, from throwing.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

export function check(found: boolean): boolean {
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production' && !found) {
    console.warn('control-contract: a development build names the control kind and the attribute it left off');
  }
  return found;
}
