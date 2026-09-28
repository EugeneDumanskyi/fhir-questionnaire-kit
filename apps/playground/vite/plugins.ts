import type { Plugin } from 'vite';

/**
 * ADR-0019's policy, word for word. `connect-src 'none'` is the privacy claim
 * (AC-12.3.2): the browser refuses every fetch, XHR, WebSocket and beacon.
 */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

/**
 * The page with the policy as the first element of `<head>`, where ADR-0019
 * puts it, so nothing in the document loads before it applies. Throws on a
 * page with no `<head>` or with a policy already, rather than ship either.
 */
export function injectCsp(html: string): string {
  if (/http-equiv=["']?content-security-policy/i.test(html)) throw new Error('The page already declares a Content-Security-Policy; the build writes the one ADR-0019 names.');
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head === null) throw new Error('The page has no <head> for the Content-Security-Policy.');
  const at = head.index + head[0].length;
  return `${html.slice(0, at)}\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />${html.slice(at)}`;
}

/**
 * Writes the policy into built pages only (ADR-0019, 2026-09-28 note): Vite's
 * development server needs inline scripts and a WebSocket, which it forbids.
 * Runs after every other HTML transform, so no tag lands above it.
 */
export function csp(): Plugin {
  return { name: 'fhirq-csp', apply: 'build', transformIndexHtml: { order: 'post', handler: injectCsp } };
}

/** A package's sources: `…/packages/core/src/…`. */
const SOURCES = /(^|\/)packages\/[^/]+\/src\//;

/** The module ids that are a package's sources rather than its built `dist`. */
export function sourceModules(ids: Iterable<string>): string[] {
  return [...ids].filter((id) => SOURCES.test(id.replace(/\\/g, '/'))).sort();
}

/**
 * Fails the build if any module came from a package's sources (M9 AC-8): the
 * playground runs what npm consumers get (ADR-0019). Lint catches a source
 * import in the app's own code; this catches one by any other route, such as
 * an alias or a package's `exports` pointing at `src`.
 */
export function fromDist(): Plugin {
  return {
    name: 'fhirq-from-dist',
    apply: 'build',
    buildEnd(error) {
      if (error !== undefined) return;
      const sources = sourceModules(this.getModuleIds());
      if (sources.length > 0) this.error(`Built from package sources, not dist (ADR-0019):\n${sources.map((id) => `  ${id}`).join('\n')}`);
    },
  };
}
