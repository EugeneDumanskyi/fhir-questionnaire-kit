import type { Diagnostic, LoadMode, Session } from '@fhirq/core';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX } from 'react';

import matrix from '../../../docs/conformance/matrix.json?raw';
import { load, type Loaded, type Source } from './load.js';
import { rowsByCode, rowsFor, type Row } from './rows.js';
import { resolver, SAMPLES } from './samples.js';

/** How long typing pauses before the form re-renders. */
const DEBOUNCE = 300;

const rows = rowsByCode(matrix);

/**
 * Paste your own questionnaire (M9 AC-4, AC-12.3.1). The form above re-renders
 * from what is typed here, once typing pauses. Strict by default, with a
 * lenient switch (plan D6): strict shows the full rejection, lenient the form
 * beside its warnings. Every finding is shown with its conformance rows. A
 * sample puts a fixture in the text; value sets resolve from memory, and one
 * the page does not hold fails, to show the kit's retry. It opens on what the
 * page opened with, the demo or a share link's, already loaded, and tells the
 * page each text and mode it loads, whatever it became.
 */
export function Editor({
  demo,
  start,
  onLoad,
}: {
  readonly demo: string;
  readonly start: Source & { readonly loaded: Loaded | null };
  readonly onLoad: (source: Source, loaded: Loaded) => void;
}): JSX.Element {
  const [text, setText] = useState(start.text);
  const [mode, setMode] = useState<LoadMode>(start.mode);
  const [loaded, setLoaded] = useState<Loaded | null>(start.loaded);
  // Only an edit or a switch loads again.
  const shown = useRef<Source>(start);
  const samples = useMemo(() => [{ name: 'The demo', text: demo }, ...SAMPLES], [demo]);
  const sample = samples.findIndex((candidate) => candidate.text === text);

  useEffect(() => {
    if (shown.current.text === text && shown.current.mode === mode) return;
    const handle = setTimeout(() => {
      shown.current = { text, mode };
      const next = load(text, mode, resolver);
      setLoaded(next);
      onLoad({ text, mode }, next);
    }, DEBOUNCE);
    return () => clearTimeout(handle);
  }, [text, mode, onLoad]);

  return (
    <section className="editor" aria-labelledby="editor-title">
      <h2 id="editor-title">Paste your own Questionnaire</h2>
      <p className="pane-note">The form above re-renders from this text as you type. It is read here, in your browser, and sent nowhere.</p>
      <label className="sample">
        Sample{' '}
        <select value={sample} onChange={(event) => setText(samples[Number(event.target.value)]?.text ?? text)}>
          {sample === -1 && (
            <option value={-1} disabled>
              Your own
            </option>
          )}
          {samples.map(({ name }, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="load-mode">
        <legend>Load mode</legend>
        <label>
          <input type="radio" name="load-mode" checked={mode === 'strict'} onChange={() => setMode('strict')} /> Strict: refuse anything unsupported
        </label>
        <label>
          <input type="radio" name="load-mode" checked={mode === 'lenient'} onChange={() => setMode('lenient')} /> Lenient: load what can be, with warnings
        </label>
      </fieldset>
      <label htmlFor="editor-text">Questionnaire JSON</label>
      <textarea id="editor-text" value={text} onChange={(event) => setText(event.target.value)} rows={16} spellCheck={false} autoCapitalize="off" autoComplete="off" />
      {loaded !== null && <Outcome loaded={loaded} />}
    </section>
  );
}

function Outcome({ loaded }: { readonly loaded: Loaded }): JSX.Element {
  switch (loaded.kind) {
    case 'not-json':
      return (
        <div className="outcome" role="status">
          <p>
            Not JSON: {loaded.message}. The form shows the last questionnaire that loaded.
          </p>
        </div>
      );
    case 'rejected':
      return (
        <div className="outcome" role="status">
          <p>
            Refused (<code>{loaded.code}</code>), with {count(loaded.findings.length, 'finding')}. The form shows the last questionnaire that loaded.
          </p>
          <Findings findings={loaded.findings} />
        </div>
      );
    case 'loaded':
      return <Live session={loaded.session} hostCode={loaded.hostCode} />;
  }
}

/** A loaded session's diagnostics, which grow while it runs (a scorer or a resolver that fails). */
function Live({ session, hostCode }: { readonly session: Session; readonly hostCode: boolean }): JSX.Element {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const diagnostics = useMemo(() => [...session.diagnostics], [session, state]);
  return (
    <div className="outcome" role="status">
      <p>
        Loaded, with {count(diagnostics.length, 'diagnostic')}.{hostCode ? '' : ' The demo host code is off: this questionnaire lacks the items it names.'}
      </p>
      <Findings findings={diagnostics} />
    </div>
  );
}

function Findings({ findings }: { readonly findings: readonly Diagnostic[] }): JSX.Element | null {
  if (findings.length === 0) return null;
  return (
    <ol className="findings">
      {findings.map((finding, index) => (
        // Findings have no identity but their order, and a list is replaced whole.
        <li key={index}>
          <Finding finding={finding} />
        </li>
      ))}
    </ol>
  );
}

function Finding({ finding }: { readonly finding: Diagnostic }): JSX.Element {
  const { code, severity, path, related, detail, expected, found } = finding;
  return (
    <>
      <p>
        <span className={`severity severity-${severity}`}>{severity}</span> <code>{code}</code> at {path === null ? 'the questionnaire' : <code>{path}</code>}
        {detail !== null && (
          <>
            , on <code>{detail}</code>
          </>
        )}
        {related.length > 0 && (
          <>
            , naming <code>{related.join(', ')}</code>
          </>
        )}
        {expected !== undefined && (
          <>
            , expected <code>{expected}</code>
          </>
        )}
        {found !== undefined && (
          <>
            , found <code>{found}</code>
          </>
        )}
      </p>
      <Conformance rows={rowsFor(rows, code, detail)} />
    </>
  );
}

function Conformance({ rows: matched }: { readonly rows: readonly Row[] }): JSX.Element {
  if (matched.length === 0) return <p className="row">No conformance row lists this code.</p>;
  return (
    <ul className="rows" aria-label="Conformance rows">
      {matched.map(({ id, feature, status, reason, href }) => (
        <li key={id} className="row">
          <a href={href}>{id}</a>: {feature.replaceAll('`', '')}. <strong>{status}</strong>
          {reason !== null && <>. {reason.replaceAll('`', '')}</>}
        </li>
      ))}
    </ul>
  );
}

function count(n: number, noun: string): string {
  if (n === 0) return `no ${noun}s`;
  return n === 1 ? `1 ${noun}` : `${n} ${noun}s`;
}
