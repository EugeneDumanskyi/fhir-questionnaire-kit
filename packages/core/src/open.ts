import { compile, type Definition } from './definition/compile.js';
import { parseQuestionnaire } from './fhir/r4/parse.js';
import { FhirqError } from './kernel/error.js';
import type { RetentionPolicy } from './session/enablement.js';
import type { Validator } from './session/projection.js';
import type { SessionSettings } from './session/session.js';
import { compileRules } from './validation/rules.js';
import { validator } from './validation/validate.js';

/**
 * What every way of starting a session shares — `createSession`, and the
 * resume path's `restoreSession` and `hydrateSession`: reading the options,
 * loading the questionnaire, and composing the validator with the host's
 * rules. Internal; neither entry point exports it.
 */
export interface Opened {
  readonly definition: Definition;
  readonly settings: SessionSettings;
  readonly validate: Validator;
}

const LOAD_MODES: readonly unknown[] = ['strict', 'lenient'];
const RETENTION: readonly unknown[] = ['retain-exclude', 'discard'];

export function open(questionnaire: unknown, options: unknown): Opened {
  const read = typeof options === 'object' && options !== null ? (options as Readonly<Record<string, unknown>>) : invalidOptions();
  const { loadMode = 'strict', retention = 'retain-exclude', hostIdentity } = read;
  if (!LOAD_MODES.includes(loadMode) || !RETENTION.includes(retention)) invalidOptions();
  if (hostIdentity !== undefined && (typeof hostIdentity !== 'object' || hostIdentity === null)) invalidOptions();

  const parsed = parseQuestionnaire(questionnaire);
  if (!parsed.ok) throw new FhirqError('definition-rejected', parsed.findings);
  const compiled = compile(parsed.input, loadMode as Definition['loadMode']);
  if (!compiled.ok) throw new FhirqError('definition-rejected', compiled.findings);
  const { definition } = compiled;
  const rules = compileRules(definition, read['rules']);
  if (rules === null) invalidOptions();
  return { definition, settings: { retention: retention as RetentionPolicy, hostIdentity: hostIdentity ?? null }, validate: validator(definition, rules) };
}

export function invalidOptions(): never {
  throw new FhirqError('invalid-options');
}
