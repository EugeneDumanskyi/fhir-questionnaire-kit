import { compile, type Definition, type ItemDef } from './definition/compile.js';
import { parseQuestionnaire } from './fhir/r4/parse.js';
import { diagnostic, type Diagnostic } from './kernel/diagnostic.js';
import { FhirqError } from './kernel/error.js';
import { collaborators } from './session/collaborator.js';
import type { RetentionPolicy } from './session/enablement.js';
import type { Validator } from './session/projection.js';
import type { SessionSettings } from './session/session.js';
import { compileRules } from './validation/rules.js';
import { compileScorers } from './validation/scores.js';
import { validator } from './validation/validate.js';

/**
 * What every way of starting a session shares — `createSession`, and the
 * resume path's `restoreSession` and `hydrateSession`: reading the options,
 * loading the questionnaire, sanitizing its rich text, and composing the
 * validator with the host's rules and scorers. Internal; neither entry point
 * exports it.
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
  const { sanitize, ...host } = hostCode(read);

  const parsed = parseQuestionnaire(questionnaire);
  if (!parsed.ok) throw new FhirqError('definition-rejected', parsed.findings);
  const compiled = compile(parsed.input, loadMode as Definition['loadMode'], host.evaluator !== undefined);
  if (!compiled.ok) throw new FhirqError('definition-rejected', compiled.findings);
  const definition = sanitized(compiled.definition, sanitize, host.onError);
  const rules = compileRules(definition, read['rules']);
  const scorers = compileScorers(definition, read['scorers']);
  if (rules === null || scorers === null) invalidOptions();
  return {
    definition,
    settings: { retention: retention as RetentionPolicy, hostIdentity: hostIdentity ?? null, ...host },
    validate: validator(definition, rules, scorers),
  };
}

/** The host's code (BC5): each collaborator a function or absent, and an evaluator an object with `evaluate`. */
function hostCode(read: Readonly<Record<string, unknown>>): Pick<SessionSettings, 'resolver' | 'evaluator' | 'onError'> & { readonly sanitize: unknown } {
  const { resolver, evaluator, onCollaboratorError: onError, sanitize } = read;
  const optional = (value: unknown): boolean => value === undefined || typeof value === 'function';
  if (!optional(resolver) || !optional(onError) || !optional(sanitize)) invalidOptions();
  if (evaluator === undefined) return { resolver, onError, sanitize };
  const checked = evaluator as NonNullable<SessionSettings['evaluator']> | null;
  if (typeof checked?.evaluate !== 'function') invalidOptions();
  return { resolver, onError, sanitize, evaluator: checked };
}

/**
 * INV-X-06, AC-01.4.2 (M4 plan D3): each item's `rendering-xhtml` goes through
 * the host's sanitizer once, as the session opens, and only its output is
 * kept. With no sanitizer, or one that throws or returns something other than
 * a string, the item has none, so its plain `text` is what renders, and a
 * diagnostic says why: `no-sanitizer`, or `sanitizer-threw` (detail `type`
 * for a result that is not a string).
 */
function sanitized(definition: Definition, sanitize: unknown, onError: unknown): Definition {
  if (definition.items.every((item) => item.renderingXhtml === null)) return definition;
  const found: Diagnostic[] = [];
  const host = collaborators((finding) => found.push(finding), onError);
  const items = definition.items.map((item): ItemDef => {
    const { renderingXhtml: xhtml, path } = item;
    if (xhtml === null) return item;
    let kept: string | null = null;
    if (typeof sanitize !== 'function') {
      found.push(diagnostic('no-sanitizer', 'warning', path));
    } else {
      const out = host.call(diagnostic('sanitizer-threw', 'warning', path), () => (sanitize as (xhtml: string) => unknown)(xhtml));
      if (typeof out?.value === 'string') kept = out.value;
      else if (out !== null) host.once(diagnostic('sanitizer-threw', 'warning', path, { detail: 'type' }));
    }
    return { ...item, renderingXhtml: kept };
  });
  return { ...definition, items, diagnostics: [...definition.diagnostics, ...found] };
}

export function invalidOptions(): never {
  throw new FhirqError('invalid-options');
}
