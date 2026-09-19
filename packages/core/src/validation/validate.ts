import type { Issue } from '../kernel/issue.js';
import type { Definition } from '../definition/compile.js';
import type { Validator } from '../session/projection.js';
import { builtInIssues } from './built-in.js';
import { ruleIssues, type CompiledRule } from './rules.js';
import { scoring, type Scorer } from './scores.js';

/**
 * Cycle step 5 (ADR-0009): the validation result and the scores.
 *
 * The validation result (BC3, AC-04.4.1) is a pure function of the visible
 * projection and the registered rules (INV-V-09). Ordered by document order,
 * then repeat position (INV-V-06): form-level issues first, since they have
 * no place in the document, then each node's built-in issues and its rule
 * issues in registration order. Host rules and scorers run through the
 * session's collaborator guard, which reports a throw once per rule or scorer
 * per session (M4 plan D7).
 */
export function validator(definition: Definition, rules: readonly CompiledRule[], scorers: readonly Scorer[] = []): Validator {
  const score = scoring(scorers);
  return (projection, call) => {
    const scores = score(projection, call);
    const builtIn = builtInIssues(projection);
    const fromRules = ruleIssues(definition, rules, projection, call);
    if (fromRules.length === 0) return { issues: builtIn, scores };
    const position = new Map<string | null, number>(projection.nodes.map((node, index) => [node.path, index]));
    position.set(null, -1);
    // Stable: built-in issues come before rule issues on the same node.
    const issues: Issue[] = [...builtIn, ...fromRules].sort((a, b) => (position.get(a.path) ?? 0) - (position.get(b.path) ?? 0));
    return { issues, scores };
  };
}
