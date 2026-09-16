// MUST PASS: stands in for packages/element/src/default-resolver.ts, the single
// file ADR-0012 allows to reach the network. The test passes this path as the
// rule's `allow` option, which is how eslint.config.js records the exception.

export async function defaultResolver(url: string): Promise<unknown> {
  const response = await fetch(url);
  return response.json();
}
