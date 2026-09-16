// MUST FAIL: one reach past the front door, one climb out of the package.

import { compile } from '@fhirq/core/session/state.js';
import { CORE_ENTRY_POINT } from '../../../../../packages/core/src/index.js';

export const used = [compile, CORE_ENTRY_POINT];
