import type { TOKENS } from '../../../packages/themes/src/index.js';

export type Token = (typeof TOKENS)[number];

/**
 * A value for every documented token (M8 AC-2) that no token of the preset
 * has, so a computed style that shows one can only have read it from the
 * host. `/tokens.css` sets them on `fhir-questionnaire` and on `.sentinel`,
 * an ancestor of React's form (ADR-0014, 2026-09-28 note).
 */
export const SENTINELS: Readonly<Record<Token, string>> = {
  '--fhirq-font-family': 'fhirq-sentinel, monospace',
  '--fhirq-font-size': '13px',
  '--fhirq-font-size-heading': '29px',
  '--fhirq-font-size-subheading': '23px',
  '--fhirq-font-weight-strong': '800',
  '--fhirq-line-height': '2',
  '--fhirq-space-1': '3px',
  '--fhirq-space-2': '5px',
  '--fhirq-space-3': '7px',
  '--fhirq-space-4': '11px',
  '--fhirq-radius': '9px',
  '--fhirq-border-width': '5px',
  '--fhirq-error-bar-width': '10px',
  '--fhirq-focus-width': '6px',
  '--fhirq-focus-offset': '1px',
  '--fhirq-target-size': '50px',
  '--fhirq-radio-size': '30px',
  '--fhirq-color-text': 'rgb(11, 12, 13)',
  '--fhirq-color-text-muted': 'rgb(21, 22, 23)',
  '--fhirq-color-background': 'rgb(31, 32, 33)',
  '--fhirq-color-control-background': 'rgb(41, 42, 43)',
  '--fhirq-color-border': 'rgb(51, 52, 53)',
  '--fhirq-color-accent': 'rgb(61, 62, 63)',
  '--fhirq-color-focus': 'rgb(71, 72, 73)',
  '--fhirq-color-error': 'rgb(81, 82, 83)',
};

/** The host stylesheet that sets every sentinel, on the element and on an ancestor of React's form. */
export const SENTINEL_CSS = `fhir-questionnaire,\n.sentinel {\n${Object.entries(SENTINELS)
  .map(([token, value]) => `  ${token}: ${value};`)
  .join('\n')}\n}\n`;
