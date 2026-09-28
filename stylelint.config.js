/**
 * The themes' stylesheets (ADR-0018, 2026-09-28 note; M8 plan D3). Built-in
 * rules only. `pnpm lint` runs it over `packages/themes/src/*.css`; the
 * must-fail fixtures in `packages/themes/test/fixtures/` prove each rule bites.
 *
 * `base.css` reads tokens (ADR-0013): no literal colour, no literal length
 * but `0`, and nothing tied to a physical side (NFR-I-05). A relative value
 * comes from a token (`calc(var(--fhirq-space-1) * 2)`), so the only unit
 * allowed is `%`, plus the ones that are not lengths. `default.css` is the
 * preset: it is where literals live, so it declares tokens and nothing else.
 */

/** Physical sides, corners and axes, each with a logical equivalent. */
const PHYSICAL_PROPERTIES = [
  /^(margin|padding|inset|scroll-margin|scroll-padding)-(left|right|top|bottom)$/,
  /^border-(left|right|top|bottom)(-(width|style|color))?$/,
  /^border-(top|bottom)-(left|right)-radius$/,
  /^(left|right|top|bottom)$/,
  /^(min-|max-)?(width|height)$/,
  /^overscroll-behavior-[xy]$/,
  /^contain-intrinsic-(width|height)$/,
];

/** One top-level component of a value: a word, or a call nested up to three deep, so `calc(a + b)` counts once. */
const PART = String.raw`(?:[^\s()/]+|[\w-]*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))+`;

/**
 * Values that name a side, and shorthands whose values would. Two values are
 * symmetric along the inline axis; a third or fourth names a side, and so
 * does a second corner radius before any `/`.
 */
const PHYSICAL_VALUES = {
  '/^(float|clear|text-align|caption-side)$/': [/\b(left|right|top|bottom)\b/],
  resize: ['horizontal', 'vertical'],
  '/^(margin|padding|inset|scroll-margin|scroll-padding|border-(width|style|color))$/': [new RegExp(`^${PART}\\s+${PART}\\s+${PART}`)],
  'border-radius': [new RegExp(`^${PART}\\s+${PART}`)],
};

const TOKENS_ONLY = {
  'color-no-hex': true,
  'color-named': 'never',
  'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color'],
  'unit-allowed-list': ['%', 'fr', 's', 'ms', 'deg', 'turn', 'dppx', 'x'],
  'property-disallowed-list': PHYSICAL_PROPERTIES,
  'declaration-property-value-disallowed-list': PHYSICAL_VALUES,
};

export default {
  reportNeedlessDisables: true,
  reportDescriptionlessDisables: true,
  reportInvalidScopeDisables: true,
  rules: TOKENS_ONLY,
  overrides: [
    {
      files: ['**/default.css'],
      rules: {
        'color-no-hex': null,
        'function-disallowed-list': null,
        'unit-allowed-list': null,
        'color-hex-length': 'long',
        'property-allowed-list': [/^--fhirq-/],
      },
    },
  ],
};
