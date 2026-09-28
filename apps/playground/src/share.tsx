import { useState, type JSX } from 'react';

import type { Start } from './app.js';
import { decode, LIMIT, link, type Link, type Shared } from './link.js';
import { load } from './load.js';
import { resolver } from './samples.js';

/**
 * Share this state (M9 plan D7, AC-12.5.1). A link is made only when asked
 * for, and shown to copy; the page never writes one into the address bar, so
 * a pasted questionnaire goes into no browser history unless the user puts it
 * there. A link made for an earlier state is not shown.
 */
export function Share({ shared }: { readonly shared: Shared }): JSX.Element {
  const [made, setMade] = useState<{ readonly shared: Shared; readonly link: Link } | null>(null);
  const make = () => void link(location.href, shared).then((result) => setMade({ shared, link: result }));
  return (
    <section className="share" aria-labelledby="share-title">
      <h2 id="share-title">Share this state</h2>
      <p className="pane-note">
        A link to the questionnaire as it was loaded, the load mode, the tier and the colour scheme, never your answers. They are written after the <code>#</code>, which browsers
        never send to a server.
      </p>
      <button type="button" onClick={make}>
        Make a link
      </button>
      <div role="status">{made !== null && made.shared === shared && <Made link={made.link} />}</div>
    </section>
  );
}

function Made({ link: made }: { readonly link: Link }): JSX.Element {
  if (made.kind === 'too-long') {
    return (
      <p>
        This questionnaire makes a link of {made.length.toLocaleString()} characters, more than the {LIMIT.toLocaleString()} a link may have. Nothing was cut short: share the
        JSON itself instead.
      </p>
    );
  }
  return (
    <label className="share-link">
      Link to this state
      <input type="text" readOnly value={made.url} onFocus={(event) => event.currentTarget.select()} />
    </label>
  );
}

/**
 * The page as a share link left it: its questionnaire loaded as the editor
 * would load it, in its mode, tier and scheme. What it could not load is in
 * the editor, refused, beside the page's own form; a fragment this page did
 * not make opens the page as it would open without one, and says so.
 */
export async function open(fragment: string, page: Start): Promise<Start> {
  const shared = await decode(fragment);
  if (shared === null) return { ...page, broken: true };
  const { text, mode, tier, scheme } = shared;
  const loaded = load(text, mode, resolver);
  const shown = loaded.kind === 'loaded' ? { session: loaded.session, hostCode: loaded.hostCode } : { session: page.session, hostCode: page.hostCode };
  return { ...shown, source: { text, mode, loaded }, tier, scheme, broken: false };
}
