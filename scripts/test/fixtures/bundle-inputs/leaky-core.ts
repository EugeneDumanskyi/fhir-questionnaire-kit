// MUST FAIL: a main entry point that re-exports restoreSession pulls the resume path in (ADR-0021).
export * from '../../../../packages/core/src/index.js';
export { restoreSession } from '../../../../packages/core/src/resume.js';
