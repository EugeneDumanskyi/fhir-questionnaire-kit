/**
 * `@fhirq/themes` — `base.css` and the token preset.
 *
 * The stylesheets are the product; they are published as `@fhirq/themes/base.css`
 * and `@fhirq/themes/default.css`. This entry names the token contract they
 * share (ADR-0013 tier 2), so a test can hold the two files to it.
 *
 * The documented token set (AC-10.2.1): type scale, spacing, radius, border,
 * focus ring, target sizes and colour. `default.css` gives every token a light
 * value and every colour token a dark one. A host sets tokens on
 * `fhir-questionnaire` itself for the element, or on any ancestor for React
 * (ADR-0014, 2026-09-28 note).
 *
 * @public
 */
export const TOKENS = [
  '--fhirq-font-family',
  '--fhirq-font-size',
  '--fhirq-font-size-heading',
  '--fhirq-font-size-subheading',
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
  '--fhirq-color-text-muted',
  '--fhirq-color-background',
  '--fhirq-color-control-background',
  '--fhirq-color-border',
  '--fhirq-color-accent',
  '--fhirq-color-focus',
  '--fhirq-color-error',
] as const;
