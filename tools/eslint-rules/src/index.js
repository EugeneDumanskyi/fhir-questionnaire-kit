import { coreModuleImports } from './core-module-imports.js';
import { noDeepImports } from './no-deep-imports.js';
import { noDomInCore } from './no-dom-in-core.js';
import { noFhirShapesOutsideCodec } from './no-fhir-shapes-outside-codec.js';
import { noHardcodedUserStrings } from './no-hardcoded-user-strings.js';
import { noNetwork } from './no-network.js';

/**
 * The architectural rules NFR-M-06 names: the four M0 rules, then the §4.1
 * import table and ADR-0016's codec boundary from M2. They are in-repo and
 * dependency-free on purpose: they are part of the evidence an adopter reads,
 * so they have to be readable (ADR-0018).
 *
 * @type {import('eslint').ESLint.Plugin}
 */
export const fhirqPlugin = {
  meta: { name: '@fhirq/eslint-rules', version: '0.0.0' },
  rules: {
    'core-module-imports': coreModuleImports,
    'no-deep-imports': noDeepImports,
    'no-dom-in-core': noDomInCore,
    'no-fhir-shapes-outside-codec': noFhirShapesOutsideCodec,
    'no-hardcoded-user-strings': noHardcodedUserStrings,
    'no-network': noNetwork,
  },
};

export {
  coreModuleImports,
  noDeepImports,
  noDomInCore,
  noFhirShapesOutsideCodec,
  noHardcodedUserStrings,
  noNetwork,
};
