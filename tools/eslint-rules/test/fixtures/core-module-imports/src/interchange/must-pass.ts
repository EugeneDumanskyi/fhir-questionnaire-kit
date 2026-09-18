// MUST PASS: another interchange file keeps its module's row, and emit's projection is open to it.
import type { VisibleProjection } from '../session/projection.js';
import type { Definition } from '../definition/compile.js';
import type { QuestionnaireResponse } from '../fhir/r4/types.js';

export type Reads = [VisibleProjection, Definition, QuestionnaireResponse];
