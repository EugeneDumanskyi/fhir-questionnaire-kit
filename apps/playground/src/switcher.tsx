import './tiers/scheme.css';

import type { Session } from '@fhirq/core';
import type { JSX } from 'react';

import theme from '../../../examples/themed-host/theme.css?raw';
import tier1 from './tiers/tier1.tsx?raw';
import tier2 from './tiers/tier2.tsx?raw';
import tier2Css from './tiers/tier2.css?raw';
import tier3 from './tiers/tier3.tsx?raw';
import tier4 from './tiers/tier4.tsx?raw';
import tier4Css from './tiers/tier4.css?raw';
import scheme from './tiers/scheme.css?raw';
import type { Scheme, Tier } from './choices.js';
import { Tier2 } from './tiers/tier2.js';
import { Tier3 } from './tiers/tier3.js';
import { Tier4 } from './tiers/tier4.js';


interface File {
  readonly name: string;
  readonly text: string;
}

/** Each tier's name, and the files that make it, shown as written: what is shown is what runs. */
const TIERS: Readonly<Record<Tier, { readonly name: string; readonly files: readonly File[] }>> = {
  1: { name: 'Defaults', files: [{ name: 'tier1.tsx', text: tier1 }] },
  2: {
    name: 'Tokens',
    files: [
      { name: 'tier2.tsx', text: tier2 },
      { name: 'examples/themed-host/theme.css', text: theme },
      { name: 'tier2.css', text: tier2Css },
    ],
  },
  3: { name: 'Slots', files: [{ name: 'tier3.tsx', text: tier3 }] },
  4: {
    name: 'Headless',
    files: [
      { name: 'tier4.tsx', text: tier4 },
      { name: 'tier4.css', text: tier4Css },
    ],
  },
};

const ORDER = [1, 2, 3, 4] as const;
const SCHEMES = ['system', 'light', 'dark'] as const;
const SCHEME_NAMES: Readonly<Record<Scheme, string>> = { system: 'System', light: 'Light', dark: 'Dark' };

/** The form in tiers 2 to 4; tier 1 is on the first screen already. */
export function TierForm({ tier, session }: { readonly tier: Exclude<Tier, 1>; readonly session: Session }): JSX.Element {
  switch (tier) {
    case 2:
      return <Tier2 session={session} />;
    case 3:
      return <Tier3 session={session} />;
    case 4:
      return <Tier4 session={session} />;
  }
}

/**
 * The tier and scheme switcher (M9 AC-6, AC-12.4.1). The form above re-renders
 * in the tier chosen, over the same session, so the answers stay; beside it,
 * the code that tier needs. The scheme is the page's, which sets it.
 */
export function Switcher({
  tier,
  onTier,
  scheme: chosen,
  onScheme,
}: {
  readonly tier: Tier;
  readonly onTier: (tier: Tier) => void;
  readonly scheme: Scheme;
  readonly onScheme: (scheme: Scheme) => void;
}): JSX.Element {
  return (
    <section className="switcher" aria-labelledby="switcher-title">
      <h2 id="switcher-title">Customization tiers</h2>
      <p className="pane-note">The form above re-renders in the tier chosen here, over the same session: your answers stay.</p>
      <div className="choices">
        <fieldset>
          <legend>Tier</legend>
          {ORDER.map((n) => (
            <label key={n}>
              <input type="radio" name="tier" checked={tier === n} onChange={() => onTier(n)} /> {n}. {TIERS[n].name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Colour scheme</legend>
          {SCHEMES.map((value) => (
            <label key={value}>
              <input type="radio" name="scheme" checked={chosen === value} onChange={() => onScheme(value)} /> {SCHEME_NAMES[value]}
            </label>
          ))}
        </fieldset>
      </div>
      <section className="code" aria-label={`The code for tier ${tier}`}>
        {TIERS[tier].files.map(({ name, text }) => (
          <Source key={name} name={name} text={text} />
        ))}
      </section>
      <details className="scheme-code">
        <summary>How the page sets light or dark</summary>
        <Source name="scheme.css" text={scheme} />
      </details>
    </section>
  );
}

function Source({ name, text }: File): JSX.Element {
  return (
    <figure>
      <figcaption>
        <code>{name}</code>
      </figcaption>
      {/* Focusable, so a keyboard can scroll it (it overflows). */}
      <pre tabIndex={0} aria-label={name}>
        <code>{text}</code>
      </pre>
    </figure>
  );
}
