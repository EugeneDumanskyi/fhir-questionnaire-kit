import { coreModuleImports } from './core-module-imports.js';
import { noDeepImports } from './no-deep-imports.js';
import { noAnswerInDiagnostics } from './no-answer-in-diagnostics.js';
import { noDomInCore } from './no-dom-in-core.js';
import { noDomInRender } from './no-dom-in-render.js';
import { noFhirShapesOutsideCodec } from './no-fhir-shapes-outside-codec.js';
import { noHardcodedUserStrings } from './no-hardcoded-user-strings.js';
import { noNetwork } from './no-network.js';

/**
 * The architectural rules NFR-M-06 names: the four M0 rules, then the §4.1
 * import table and ADR-0016's codec boundary from M2, from M4 NFR-X-04's
 * answer-value rule, the one that reads types, and from M6 ADR-0015's rule
 * confining the React adapter's DOM access to effects and handlers. They are in-repo and
 * dependency-free on purpose: they are part of the evidence an adopter reads,
 * so they have to be readable (ADR-0018).
 *
 * @type {import('eslint').ESLint.Plugin}
 */
export const fhirqPlugin = {
  meta: { name: '@fhirq/eslint-rules', version: '0.0.0' },
  rules: {
    'core-module-imports': coreModuleImports,
    'no-answer-in-diagnostics': noAnswerInDiagnostics,
    'no-deep-imports': noDeepImports,
    'no-dom-in-core': noDomInCore,
    'no-dom-in-render': noDomInRender,
    'no-fhir-shapes-outside-codec': noFhirShapesOutsideCodec,
    'no-hardcoded-user-strings': noHardcodedUserStrings,
    'no-network': noNetwork,
  },
};

export {
  coreModuleImports,
  noAnswerInDiagnostics,
  noDeepImports,
  noDomInCore,
  noDomInRender,
  noFhirShapesOutsideCodec,
  noHardcodedUserStrings,
  noNetwork,
};
