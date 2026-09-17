/**
 * `@fhirq/themes` — `base.css` and the token presets.
 *
 * The stylesheets are the product; they are published as `@fhirq/themes/base.css`
 * and `@fhirq/themes/default.css`. This entry names the token contract they
 * share, so a test can hold the two files to it. S1 slice: the tokens two
 * controls need; the full set is M8.
 *
 * @alpha S1 spike surface.
 */
export const TOKENS = [
  '--fhirq-font-family',
  '--fhirq-font-size',
  '--fhirq-font-size-heading',
  '--fhirq-font-weight-strong',
  '--fhirq-line-height',
  '--fhirq-space-1',
  '--fhirq-space-2',
  '--fhirq-space-3',
  '--fhirq-space-4',
  '--fhirq-radius',
  '--fhirq-border-width',
  '--fhirq-error-bar-width',
  '--fhirq-focus-width',
  '--fhirq-focus-offset',
  '--fhirq-target-size',
  '--fhirq-radio-size',
  '--fhirq-color-text',
  '--fhirq-color-background',
  '--fhirq-color-control-background',
  '--fhirq-color-border',
  '--fhirq-color-accent',
  '--fhirq-color-focus',
  '--fhirq-color-error',
] as const;
