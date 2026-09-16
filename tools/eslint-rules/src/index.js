import { noDeepImports } from './no-deep-imports.js';
import { noDomInCore } from './no-dom-in-core.js';
import { noHardcodedUserStrings } from './no-hardcoded-user-strings.js';
import { noNetwork } from './no-network.js';

/**
 * The four architectural rules NFR-M-06 names. They are in-repo and
 * dependency-free on purpose: they are part of the evidence an adopter reads,
 * so they have to be readable (ADR-0018).
 *
 * @type {import('eslint').ESLint.Plugin}
 */
export const fhirqPlugin = {
  meta: { name: '@fhirq/eslint-rules', version: '0.0.0' },
  rules: {
    'no-deep-imports': noDeepImports,
    'no-dom-in-core': noDomInCore,
    'no-hardcoded-user-strings': noHardcodedUserStrings,
    'no-network': noNetwork,
  },
};

export { noDeepImports, noDomInCore, noHardcodedUserStrings, noNetwork };
