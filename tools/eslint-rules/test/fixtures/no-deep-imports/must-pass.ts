// MUST PASS: published entry points, and a sibling inside the same package.

import { createSession } from '@fhirq/core';
import { VIEW_ENTRY_POINT } from '@fhirq/core/view';

import { helper } from './must-pass-helper.js';

export const used = [createSession, VIEW_ENTRY_POINT, helper];
