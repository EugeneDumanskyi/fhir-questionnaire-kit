// MUST FAIL, linted as apps/playground/src/__lint-fixture__.ts: a climb into a
// package's sources, a climb out of the app into scripts, and a package's
// sources by absolute and by Vite /@fs/ path.

import { createSession } from '../../../packages/core/src/index.js';
import { buildPackages } from '../../../scripts/build-packages.mjs';
import { createView } from '/repo/packages/core/src/view/index.js';
import { Questionnaire } from '/@fs/repo/packages/react/src/index.js';

export const used = [createSession, buildPackages, createView, Questionnaire];
